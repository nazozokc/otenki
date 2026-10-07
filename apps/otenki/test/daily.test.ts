import { describe, expect, spyOn, test } from "bun:test";
import { fortnight, weekly } from "../src/daily.ts";

const forecast = (times: string[]) => ({
  daily: {
    time: times,
    weather_code: times.map(() => 1),
    temperature_2m_max: times.map(() => 20),
    temperature_2m_min: times.map(() => 10),
    precipitation_sum: times.map(() => 0),
    precipitation_probability_max: times.map(() => 10),
    wind_speed_10m_max: times.map(() => 3),
  },
});

/**
 * A coordinate pair skips the geocoder, so the forecast call is the only
 * network access in the way. It is replaced with a canned answer that can be
 * shorter than the command asks for, which is the case the heading has to
 * survive.
 */
const renderHeading = async (
  command: (args: string[], options: { json?: boolean }) => Promise<void>,
  times: string[],
): Promise<string> => {
  const out: string[] = [];
  const log = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    out.push(args.join(" "));
  });
  const network = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(forecast(times)), { status: 200 }),
  );

  try {
    await command(["35.69", "139.69"], {});
  } finally {
    network.mockRestore();
    log.mockRestore();
  }

  return out[0] ?? "";
};

describe("forecast heading", () => {
  test("counts the days the API actually returned", async () => {
    const heading = await renderHeading(weekly, [
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
    ]);

    expect(heading).toContain("3日間予報");
  });

  test("counts the same way on the fortnight command", async () => {
    const heading = await renderHeading(fortnight, [
      "2026-10-07",
      "2026-10-08",
    ]);

    expect(heading).toContain("2日間予報");
  });
});

import { describe, expect, spyOn, test } from "bun:test";
import { fortnight, weekly } from "../src/daily.ts";
import type { Config } from "../src/config.ts";
import { displayWidth } from "../src/width.ts";
import { withColorAsync } from "./support.ts";

type Command = (
  args: string[],
  options: { json?: boolean },
  config?: Config,
) => Promise<void>;

const forecast = (times: string[], weatherCode = 1) => ({
  daily: {
    time: times,
    weather_code: times.map(() => weatherCode),
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
 * survive. Each `console.log` is split into the lines it printed, so the tests
 * below can address the output the way a reader sees it: the whole table
 * arrives as one call.
 */
const renderLines = async (
  command: Command,
  times: string[],
  weatherCode = 1,
): Promise<string[]> => {
  const out: string[] = [];
  const log = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    out.push(...args.join(" ").split("\n"));
  });
  // Commands print nothing on stderr themselves — the credit belongs to
  // dispatch — so this only silences a stray write and keeps the log readable.
  const err = spyOn(console, "error").mockImplementation(() => {});
  const network = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(forecast(times, weatherCode)), {
      status: 200,
    }),
  );

  try {
    await command(["35.69", "139.69"], {});
  } finally {
    network.mockRestore();
    log.mockRestore();
    err.mockRestore();
  }

  return out;
};

const renderHeading = async (command: Command, times: string[]) =>
  (await withColorAsync(false, () => renderLines(command, times)))[0] ?? "";

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

describe("forecast table", () => {
  test("labels its columns in Japanese", async () => {
    const lines = await withColorAsync(false, () =>
      renderLines(weekly, ["2026-10-07", "2026-10-08"]),
    );
    const header = lines[1] ?? "";

    for (const label of [
      "日付",
      "天気",
      "最低",
      "最高",
      "降水",
      "確率",
      "風速",
    ]) {
      expect(header).toContain(label);
    }
    expect(header).not.toContain("date");
    expect(header).not.toContain("icon");
  });

  test("keeps the lowest and the highest in their own columns", async () => {
    // Two numbers a table exists to compare, right aligned so their digits
    // stack: one range cell would put the `~` between them instead.
    const lines = await withColorAsync(false, () =>
      renderLines(weekly, ["2026-10-07"]),
    );

    expect(lines[3]).toBe(
      "10-07 (水)  🌤️ 晴れ  10.0℃  20.0℃  0.0 mm   10%  3.0 km/h",
    );
  });

  test("keeps every line on one grid", async () => {
    const lines = await withColorAsync(false, () =>
      renderLines(weekly, [
        "2026-10-07",
        "2026-10-08",
        "2026-10-09",
        "2026-10-10",
        "2026-10-11",
        "2026-10-12",
        "2026-10-13",
      ]),
    );
    const grid = displayWidth(lines[1] ?? "");

    for (const line of lines.slice(1)) expect(displayWidth(line)).toBe(grid);
  });

  test("strips control sequences the API puts in a date", async () => {
    // The date rides the table straight to the terminal, so a compromised
    // API could smuggle an OSC title rewrite into it. The row shows the
    // cleaned date instead.
    const lines = await withColorAsync(false, () =>
      renderLines(weekly, ["2026-10\u001B]0;pwn\u0007-07"]),
    );
    const text = lines.join("\n");

    expect(text).not.toContain("\u001B");
    expect(text).not.toContain("\u0007");
    expect(text).toContain("10-07");
  });

  test("bolds today's date so the forecast has a start", async () => {
    const lines = await withColorAsync(true, () =>
      renderLines(weekly, ["2026-10-07", "2026-10-08"]),
    );

    expect(lines[3]?.startsWith("\u001B[1m")).toBe(true);
    expect(lines[4]?.startsWith("\u001B[1m")).toBe(false);
  });

  test("paints the wet columns cyan", async () => {
    const lines = await withColorAsync(true, () =>
      renderLines(weekly, ["2026-10-07"]),
    );

    expect(lines[3]).toContain("\u001B[36m0.0 mm\u001B[0m");
    expect(lines[3]).toContain("\u001B[36m10%\u001B[0m");
  });

  test("raises the voice for thunderstorms and heavy rain", async () => {
    const thunder = await withColorAsync(true, () =>
      renderLines(weekly, ["2026-10-07"], 97),
    );
    const heavy = await withColorAsync(true, () =>
      renderLines(weekly, ["2026-10-07"], 65),
    );

    expect(thunder[3]).toContain("\u001B[35m");
    expect(heavy[3]).toContain("\u001B[1m\u001B[31m");
  });
});

describe("config", () => {
  /**
   * The same canned-answer render as above, but handing the command a config
   * and keeping the URL the forecast was requested with: `days` and `units`
   * are both decided at the query string, so that is where they are asserted.
   */
  const renderConfigured = async (
    command: Command,
    times: string[],
    config: Config,
  ): Promise<{ lines: string[]; url: string; err: string[] }> => {
    const out: string[] = [];
    const log = spyOn(console, "log").mockImplementation(
      (...args: unknown[]) => {
        out.push(...args.join(" ").split("\n"));
      },
    );
    const errOut: string[] = [];
    const err = spyOn(console, "error").mockImplementation(
      (...args: unknown[]) => {
        errOut.push(args.join(" "));
      },
    );
    const network = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(forecast(times)), { status: 200 }),
    );
    let url = "";

    try {
      await command(["35.69", "139.69"], {}, config);
      // Read before the restore: mockRestore clears the recorded calls.
      url = String(network.mock.calls[0]?.[0] ?? "");
    } finally {
      network.mockRestore();
      log.mockRestore();
      err.mockRestore();
    }

    return { lines: out, url, err: errOut };
  };

  test("builds the request URL from the coordinates and the configured days", async () => {
    const { err, url } = await withColorAsync(false, () =>
      renderConfigured(weekly, ["2026-10-07", "2026-10-08"], { days: 5 }),
    );

    // The command no longer prints the URL: the credit that follows its
    // output comes from dispatch, so stderr here stays empty.
    expect(err).toEqual([]);
    expect(url).toContain("https://api.open-meteo.com/v1/forecast?");
    expect(url).toContain("latitude=35.69");
    expect(url).toContain("longitude=139.69");
    expect(url).toContain("forecast_days=5");
  });

  test("asks the API for the configured number of days", async () => {
    const times = [
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
    ];

    const plain = await renderConfigured(weekly, times, {});
    expect(plain.url).toContain("forecast_days=7");

    const short = await renderConfigured(weekly, times, { days: 5 });
    expect(short.url).toContain("forecast_days=5");
  });

  test("applies the configured days to fortnight too", async () => {
    const times = ["2026-10-07", "2026-10-08"];

    const { lines, url } = await withColorAsync(false, () =>
      renderConfigured(fortnight, times, { days: 3 }),
    );

    expect(url).toContain("forecast_days=3");
    // The heading counts what came back, so a short answer never overclaims.
    expect(lines[0]).toContain("2日間予報");
  });

  test("converts to imperial in the query and labels it on screen", async () => {
    const { lines, url } = await withColorAsync(false, () =>
      renderConfigured(weekly, ["2026-10-07"], { units: "imperial" }),
    );

    expect(url).toContain("temperature_unit=fahrenheit");
    expect(url).toContain("wind_speed_unit=mph");
    expect(url).toContain("precipitation_unit=inch");

    const row = lines[3] ?? "";
    expect(row).toContain("10.0°F");
    expect(row).toContain("20.0°F");
    expect(row).toContain("0.00 in");
    expect(row).toContain("3.0 mph");
    expect(row).not.toContain("°C");
    expect(row).not.toContain("km/h");
    expect(row).not.toContain("mm");
  });

  test("stays metric without a config", async () => {
    const { url } = await renderConfigured(weekly, ["2026-10-07"], {});

    expect(url).not.toContain("temperature_unit");
    expect(url).not.toContain("wind_speed_unit");
    expect(url).not.toContain("precipitation_unit");
  });
});

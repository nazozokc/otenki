import { describe, expect, spyOn, test } from "bun:test";
import type { Config } from "../src/config.ts";
import { every } from "../src/hourly.ts";
import { displayWidth } from "../src/width.ts";
import { withColorAsync } from "./support.ts";

// 2026-10-10 05:00 UTC with the mocked API reporting offset 0, so the window
// opens at 05:00 local and runs a full day to 04:00 the next morning.
const NOW = Date.UTC(2026, 9, 10, 5, 0, 0);

/** Local midnight the API always starts from; two days cover the whole window. */
const HOURLY_TIMES = Array.from({ length: 48 }, (_, index) => {
  const date = index < 24 ? "2026-10-10" : "2026-10-11";
  const hour = String(index % 24).padStart(2, "0");
  return `${date}T${hour}:00`;
});

const forecast = (times: string[], weatherCode = 1) => ({
  utc_offset_seconds: 0,
  hourly: {
    time: times,
    temperature_2m: times.map(() => 20),
    weather_code: times.map(() => weatherCode),
    precipitation_probability: times.map(() => 10),
    wind_speed_10m: times.map(() => 3),
    precipitation: times.map(() => 0),
  },
});

/**
 * Runs one interval command against a canned hourly answer and returns the
 * printed lines, the request URL and anything written to stderr. `Date.now` is
 * pinned so the 24-hour window lands on a known hour instead of the wall clock.
 */
const render = async (
  interval: number,
  options: {
    config?: Config;
    times?: string[];
    weatherCode?: number;
  } = {},
): Promise<{ lines: string[]; url: string; err: string[] }> => {
  const out: string[] = [];
  const errOut: string[] = [];
  const log = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    out.push(...args.join(" ").split("\n"));
  });
  const err = spyOn(console, "error").mockImplementation(
    (...args: unknown[]) => {
      errOut.push(args.join(" "));
    },
  );
  const now = spyOn(Date, "now").mockReturnValue(NOW);
  const network = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify(
        forecast(options.times ?? HOURLY_TIMES, options.weatherCode),
      ),
      { status: 200 },
    ),
  );
  let url = "";

  try {
    await every(["35.69", "139.69"], {}, options.config ?? {}, interval);
    // Read before the restore: mockRestore clears the recorded calls.
    url = String(network.mock.calls[0]?.[0] ?? "");
  } finally {
    network.mockRestore();
    log.mockRestore();
    err.mockRestore();
    now.mockRestore();
  }

  return { lines: out, url, err: errOut };
};

describe("interval row count", () => {
  // The window is a fixed 24 hours, so the step decides how many rows survive.
  const cases: Array<[number, number]> = [
    [3, 8],
    [6, 4],
    [12, 2],
    [24, 1],
  ];

  for (const [interval, rows] of cases) {
    test(`${interval}h prints ${rows} row(s)`, async () => {
      const { lines } = await withColorAsync(false, () => render(interval));
      // Heading, column header and rule, then one line per kept hour.
      expect(lines.length).toBe(3 + rows);
    });
  }
});

describe("interval table", () => {
  test("labels its columns in Japanese", async () => {
    const { lines } = await withColorAsync(false, () => render(3));
    const header = lines[1] ?? "";

    for (const label of ["日時", "天気", "気温", "降水", "確率", "風速"]) {
      expect(header).toContain(label);
    }
    expect(header).not.toContain("time");
    expect(header).not.toContain("icon");
  });

  test("opens the window at the current local hour and steps from there", async () => {
    const { lines } = await withColorAsync(false, () => render(3));

    // NOW is 05:00, so the rows are 05, 08, 11, … local time.
    expect(lines[3]).toContain("2026-10-10 05");
    expect(lines[4]).toContain("2026-10-10 08");
    expect(lines[5]).toContain("2026-10-10 11");
  });

  test("keeps every line on one grid", async () => {
    const { lines } = await withColorAsync(false, () => render(3));
    const grid = displayWidth(lines[1] ?? "");

    for (const line of lines.slice(1)) expect(displayWidth(line)).toBe(grid);
  });

  test("bolds the opening row's time", async () => {
    const { lines } = await withColorAsync(true, () => render(3));

    expect(lines[3]?.startsWith("\u001B[1m")).toBe(true);
    expect(lines[4]?.startsWith("\u001B[1m")).toBe(false);
  });

  test("paints the wet columns cyan", async () => {
    const { lines } = await withColorAsync(true, () => render(3));

    expect(lines[3]).toContain("\u001B[36m0.0 mm\u001B[0m");
    expect(lines[3]).toContain("\u001B[36m10%\u001B[0m");
  });

  test("strips control sequences the API puts in a time", async () => {
    const times = [...HOURLY_TIMES];
    // The opening row carries an OSC title rewrite; it must not reach screen.
    times[5] = "2026-10-10T05:00\u001B]0;pwn\u0007";

    const { lines } = await withColorAsync(false, () => render(3, { times }));
    const text = lines.join("\n");

    expect(text).not.toContain("\u001B");
    expect(text).not.toContain("\u0007");
    expect(text).toContain("2026-10-10 05");
  });
});

describe("interval request", () => {
  test("asks for hourly variables and two forecast days", async () => {
    const { url } = await render(3);

    expect(url).toContain("https://api.open-meteo.com/v1/forecast?");
    expect(url).toContain("latitude=35.69");
    expect(url).toContain("longitude=139.69");
    expect(url).toContain("timezone=auto");
    expect(url).toContain("forecast_days=2");
    expect(url).toContain("timeformat=unixtime");
    expect(url).toContain("temperature_2m");
    expect(url).toContain("weather_code");
    expect(url).toContain("precipitation_probability");
    expect(url).toContain("wind_speed_10m");
  });

  test("converts to imperial in the query", async () => {
    const { url } = await render(3, { config: { units: "imperial" } });

    expect(url).toContain("temperature_unit=fahrenheit");
    expect(url).toContain("wind_speed_unit=mph");
    expect(url).toContain("precipitation_unit=inch");
  });
});

describe("DST-aware hourly timestamps", () => {
  test("starts at the current instant through the repeated fall-back hour", async () => {
    const nowUtc = Date.UTC(2026, 10, 1, 6, 0, 0);
    const startUtc = Date.UTC(2026, 10, 1, 4, 0, 0);
    const times = Array.from(
      { length: 48 },
      (_, index) => (startUtc + index * 3_600_000) / 1000,
    );
    const out: string[] = [];
    const log = spyOn(console, "log").mockImplementation(
      (...args: unknown[]) => {
        out.push(args.join(" "));
      },
    );
    const err = spyOn(console, "error").mockImplementation(() => {});
    const now = spyOn(Date, "now").mockReturnValue(nowUtc);
    const network = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          utc_offset_seconds: -18_000,
          timezone: "America/New_York",
          hourly: {
            time: times,
            temperature_2m: times.map(() => 20),
            weather_code: times.map(() => 1),
            precipitation_probability: times.map(() => 10),
            wind_speed_10m: times.map(() => 3),
            precipitation: times.map(() => 0),
          },
        }),
        { status: 200 },
      ),
    );

    try {
      await every(["35.69", "139.69"], { json: true }, {}, 1);
    } finally {
      network.mockRestore();
      log.mockRestore();
      err.mockRestore();
      now.mockRestore();
    }

    const result = JSON.parse(out.join("\n"));
    expect(result.hours).toHaveLength(24);
    expect(result.hours[0].time).toBe("2026-11-01T01:00");
    // The first 01:00 (EDT) is in the past; selection starts at 06:00 UTC,
    // the second 01:00 (EST), then advances to 02:00 local time.
    expect(result.hours[1].time).toBe("2026-11-01T02:00");
  });
});

describe("interval JSON", () => {
  test("prints the sampled hours for the step", async () => {
    const out: string[] = [];
    const log = spyOn(console, "log").mockImplementation(
      (...args: unknown[]) => {
        out.push(args.join(" "));
      },
    );
    const err = spyOn(console, "error").mockImplementation(() => {});
    const now = spyOn(Date, "now").mockReturnValue(NOW);
    const network = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(forecast(HOURLY_TIMES)), { status: 200 }),
    );

    try {
      await every(["35.69", "139.69"], { json: true }, {}, 6);
    } finally {
      network.mockRestore();
      log.mockRestore();
      err.mockRestore();
      now.mockRestore();
    }

    const parsed = JSON.parse(out.join("\n"));
    expect(parsed.location.latitude).toBe(35.69);
    expect(parsed.hours).toHaveLength(4);
    expect(parsed.hours[0].time).toBe("2026-10-10T05:00");
    expect(parsed.hours[1].time).toBe("2026-10-10T11:00");
    expect(parsed.hours[0].temperature).toBe(20);
  });
});

describe("interval short answers", () => {
  test("keeps whatever hours the API supplied", async () => {
    // Only a handful of hours from midnight, so the window is cut short rather
    // than the command inventing rows. The hourly step keeps all three hours
    // left after the 05:00 start.
    const times = HOURLY_TIMES.slice(0, 8);
    const { lines } = await withColorAsync(false, () => render(1, { times }));

    expect(lines[0]).toContain("3件");
    expect(lines.length).toBe(3 + 3);
  });
});

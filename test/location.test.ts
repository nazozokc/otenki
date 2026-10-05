import { describe, expect, test } from "bun:test";
import { LocationError, resolveLocation } from "../src/location.ts";
import { weatherIcon } from "../src/weather.icon.ts";
import { weatherLabel } from "../src/weather.label.ts";
import { MAX_FORECAST_DAYS } from "../src/forecast.ts";

describe("resolveLocation argument handling", () => {
  // These branches never reach the network, so they are safe to exercise.
  // Anything that resolves a name would need the geocoder stubbed below.

  test("treats two numbers as a coordinate pair", async () => {
    const location = await resolveLocation(["41.76879", "140.72917"]);

    expect(location.latitude).toBe(41.76879);
    expect(location.longitude).toBe(140.72917);
    expect(location.label).toBe("41.76879, 140.72917");
  });

  test("accepts negative coordinates for the southern and western hemispheres", async () => {
    const location = await resolveLocation(["-33.8688", "-151.2093"]);

    expect(location.latitude).toBe(-33.8688);
    expect(location.longitude).toBe(-151.2093);
  });

  test("accepts a comma separated pair in a single argument", async () => {
    const location = await resolveLocation(["35.69,139.69"]);

    expect(location.latitude).toBe(35.69);
    expect(location.longitude).toBe(139.69);
  });

  test("rejects a lone number instead of guessing", async () => {
    // `otenki today 41` is a typo far more often than it is a latitude.
    expect(resolveLocation(["41"])).rejects.toBeInstanceOf(LocationError);
  });

  test("rejects an empty location", async () => {
    expect(resolveLocation([])).rejects.toBeInstanceOf(LocationError);
    expect(resolveLocation(["   "])).rejects.toBeInstanceOf(LocationError);
  });
});

describe("weatherIcon", () => {
  test("maps every documented WMO code to an icon", () => {
    // WMO 4677 codes as published in the Open-Meteo documentation.
    const codes = [
      0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75,
      77, 80, 81, 82, 85, 86, 95, 96, 97, 99,
    ];

    for (const code of codes) {
      expect(weatherIcon(code)).not.toBe("❓");
    }
  });

  test("covers 97, which the icon table used to omit", () => {
    expect(weatherIcon(97)).toBe("⛈️");
  });

  test("falls back for an unknown code", () => {
    expect(weatherIcon(1234)).toBe("❓");
  });
});

describe("weatherLabel", () => {
  test("labels every documented WMO code", () => {
    const codes = [
      0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75,
      77, 80, 81, 82, 85, 86, 95, 96, 97, 99,
    ];

    for (const code of codes) {
      expect(weatherLabel(code)).not.toBe("不明");
    }
  });

  test("falls back for an unknown code", () => {
    expect(weatherLabel(1234)).toBe("不明");
  });
});

describe("MAX_FORECAST_DAYS", () => {
  test("matches the Forecast API ceiling", () => {
    // forecast_days=17 is rejected with "Allowed range 0 to 16".
    expect(MAX_FORECAST_DAYS).toBe(16);
  });
});
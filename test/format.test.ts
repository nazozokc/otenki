import { describe, expect, test } from "bun:test";
import {
  formatCoordinate,
  formatDateTime,
  formatDay,
  formatHumidity,
  formatPrecipitation,
  formatPrecipitationProbability,
  formatTemperature,
  formatTemperatureRange,
  formatWindSpeed,
} from "../src/format.ts";

describe("formatCoordinate", () => {
  test("keeps five decimals", () => {
    expect(formatCoordinate(41.775831, 140.736664)).toBe("41.77583, 140.73666");
  });

  test("pads a short coordinate", () => {
    expect(formatCoordinate(1, 2)).toBe("1.00000, 2.00000");
  });
});

describe("formatTemperature", () => {
  test("renders one decimal", () => {
    expect(formatTemperature(18.24)).toBe("18.2°C");
  });

  test("renders a missing value as a dash", () => {
    expect(formatTemperature(null)).toBe("-");
    expect(formatTemperature(undefined)).toBe("-");
    expect(formatTemperature(Number.NaN)).toBe("-");
  });
});

describe("formatTemperatureRange", () => {
  test("puts the minimum first", () => {
    expect(formatTemperatureRange(14.24, 21.36)).toBe("14.2°C ~ 21.4°C");
  });

  test("needs both ends", () => {
    expect(formatTemperatureRange(null, 21.36)).toBe("-");
    expect(formatTemperatureRange(14.24, null)).toBe("-");
  });
});

describe("numeric formatters", () => {
  test("formatWindSpeed appends km/h", () => {
    expect(formatWindSpeed(9.14)).toBe("9.1 km/h");
  });

  test("formatPrecipitation appends mm", () => {
    expect(formatPrecipitation(0)).toBe("0.0 mm");
  });

  test("both precipitation formatters round to whole percent", () => {
    expect(formatPrecipitationProbability(90.6)).toBe("91%");
    expect(formatHumidity(71.7)).toBe("72%");
  });

  test("all of them render a missing value as a dash", () => {
    expect(formatWindSpeed(null)).toBe("-");
    expect(formatPrecipitation(undefined)).toBe("-");
    expect(formatPrecipitationProbability(null)).toBe("-");
    expect(formatHumidity(null)).toBe("-");
  });
});

describe("formatDateTime", () => {
  test("replaces the ISO T separator", () => {
    expect(formatDateTime("2026-10-04T22:45")).toBe("2026-10-04 22:45");
  });

  test("drops a trailing :00", () => {
    expect(formatDateTime("2026-10-04T11:00")).toBe("2026-10-04 11");
  });
});

describe("formatDay", () => {
  test("appends the weekday", () => {
    expect(formatDay("2026-10-04")).toBe("10-04 (日)");
    expect(formatDay("2026-10-05")).toBe("10-05 (月)");
    expect(formatDay("2026-10-10")).toBe("10-10 (土)");
  });

  test("reads the date as UTC so the weekday cannot drift", () => {
    // A local-time parse would roll some dates into the neighbouring weekday.
    expect(formatDay("2026-01-01")).toBe("01-01 (木)");
  });
});
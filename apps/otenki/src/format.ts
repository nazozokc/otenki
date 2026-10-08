import type { Units } from "./config.ts";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

type Maybe = number | null | undefined;

const isMissing = (value: Maybe): value is null | undefined =>
  value === null || value === undefined || Number.isNaN(value);

/**
 * The API converts to the unit system with the query parameters (see
 * `forecast.ts`), so formatting here only has to label what it is given.
 * Imperial precipitation keeps two decimals because an inch is a bigger unit:
 * `0.0 in` and `0.4 in` differ as much as `0 mm` and `10 mm`.
 *
 * The degree sign is rendered as the single code point `℃` rather than `°C`:
 * Japanese terminals draw the unit glyph fullwidth while the two-letter form
 * follows the font's idea of `°`, which drifts the table columns by a cell.
 */
const temperatureUnit = (units: Units): string =>
  units === "imperial" ? "°F" : "℃";

const speedUnit = (units: Units): string =>
  units === "imperial" ? "mph" : "km/h";

const precipitationUnit = (units: Units): string =>
  units === "imperial" ? "in" : "mm";

export const formatCoordinate = (latitude: number, longitude: number): string =>
  `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

export const formatTemperature = (
  value: Maybe,
  units: Units = "metric",
): string =>
  isMissing(value) ? "-" : `${value.toFixed(1)}${temperatureUnit(units)}`;

export const formatTemperatureRange = (
  min: Maybe,
  max: Maybe,
  units: Units = "metric",
): string =>
  isMissing(min) || isMissing(max)
    ? "-"
    : `${min.toFixed(1)}${temperatureUnit(units)} ~ ${max.toFixed(1)}${temperatureUnit(units)}`;

export const formatWindSpeed = (
  value: Maybe,
  units: Units = "metric",
): string =>
  isMissing(value) ? "-" : `${value.toFixed(1)} ${speedUnit(units)}`;

export const formatPrecipitation = (
  value: Maybe,
  units: Units = "metric",
): string =>
  isMissing(value)
    ? "-"
    : `${value.toFixed(units === "imperial" ? 2 : 1)} ${precipitationUnit(units)}`;

export const formatHumidity = (value: Maybe): string =>
  isMissing(value) ? "-" : `${Math.round(value)}%`;

export const formatPrecipitationProbability = (value: Maybe): string =>
  isMissing(value) ? "-" : `${Math.round(value)}%`;

/** `2026-10-05T11:00` (already local time from the API) to `2026-10-05 11`. */
export const formatDateTime = (value: string): string =>
  value.replace("T", " ").replace(/:00$/, "");

/** `2026-10-05` to `10-05 (火)`. */
export const formatDay = (value: string): string => {
  const date = new Date(`${value}T00:00:00Z`);
  const weekday = WEEKDAYS[date.getUTCDay()] ?? "";
  return `${value.slice(5)} (${weekday})`;
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

type Maybe = number | null | undefined;

const isMissing = (value: Maybe): value is null | undefined =>
  value === null || value === undefined || Number.isNaN(value);

export const formatCoordinate = (latitude: number, longitude: number): string =>
  `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

export const formatTemperature = (value: Maybe): string =>
  isMissing(value) ? "-" : `${value.toFixed(1)}°C`;

export const formatTemperatureRange = (min: Maybe, max: Maybe): string =>
  isMissing(min) || isMissing(max)
    ? "-"
    : `${min.toFixed(1)}°C ~ ${max.toFixed(1)}°C`;

export const formatWindSpeed = (value: Maybe): string =>
  isMissing(value) ? "-" : `${value.toFixed(1)} km/h`;

export const formatPrecipitation = (value: Maybe): string =>
  isMissing(value) ? "-" : `${value.toFixed(1)} mm`;

export const formatHumidity = (value: Maybe): string =>
  isMissing(value) ? "-" : `${Math.round(value)}%`;

export const formatPrecipitationProbability = (value: Maybe): string =>
  isMissing(value) ? "-" : `${Math.round(value)}%`;

/** `2026-10-05T11:00` (already local time from the API) to `2026-10-05 11:00`. */
export const formatDateTime = (value: string): string =>
  value.replace("T", " ").replace(/:00$/, "");

/** `2026-10-05` to `10-05 (火)`. */
export const formatDay = (value: string): string => {
  const date = new Date(`${value}T00:00:00Z`);
  const weekday = WEEKDAYS[date.getUTCDay()] ?? "";
  return `${value.slice(5)} (${weekday})`;
};

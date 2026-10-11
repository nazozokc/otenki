import type { Units } from "./config.ts";
import { fetchJson } from "./http.ts";
import { sanitizeText } from "./sanitize.ts";
const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";

/** The Forecast API rejects `forecast_days` above 16. */
export const MAX_FORECAST_DAYS = 16;

export type CurrentWeather = {
  time: string;
  temperature: number;
  apparentTemperature: number | null;
  weatherCode: number;
  windSpeed: number | null;
  humidity: number | null;
  precipitation: number | null;
};

export type DailyWeather = {
  time: string;
  weatherCode: number;
  temperatureMax: number | null;
  temperatureMin: number | null;
  precipitationSum: number | null;
  precipitationProbabilityMax: number | null;
  windSpeedMax: number | null;
};

export type HourlyWeather = {
  time: string;
  temperature: number | null;
  weatherCode: number;
  precipitationProbability: number | null;
  windSpeed: number | null;
  precipitation: number | null;
};

type ForecastResponse = {
  reason?: string;
  /** The offset the API used for `time`, which is wall clock at the coordinates. */
  utc_offset_seconds?: number;
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number | null;
    weather_code?: number;
    wind_speed_10m?: number | null;
    relative_humidity_2m?: number | null;
    precipitation?: number | null;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    precipitation_sum?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
    wind_speed_10m_max?: (number | null)[];
  };
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    weather_code?: (number | null)[];
    precipitation_probability?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    precipitation?: (number | null)[];
  };
};

export class ForecastError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForecastError";
  }
}

const fetchForecast = async (url: URL): Promise<ForecastResponse> => {
  const data = await fetchJson<ForecastResponse>(url);
  if (data.reason !== undefined) {
    throw new ForecastError(`Weather API エラー: ${data.reason}`);
  }

  return data;
};

const buildUrl = (
  latitude: number,
  longitude: number,
  units: Units = "metric",
): URL => {
  const url = new URL(FORECAST_ENDPOINT);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  // `timezone` is mandatory as soon as daily variables are requested, and
  // `auto` resolves the zone from the coordinates instead of assuming JST.
  url.searchParams.set("timezone", "auto");
  // The API converts rather than the client rounding: a `°F` label on a
  // metric value would be a lie, and one conversion point is easier to trust.
  if (units === "imperial") {
    url.searchParams.set("temperature_unit", "fahrenheit");
    url.searchParams.set("wind_speed_unit", "mph");
    url.searchParams.set("precipitation_unit", "inch");
  }
  return url;
};

export const fetchCurrent = async (
  latitude: number,
  longitude: number,
  units: Units = "metric",
): Promise<CurrentWeather> => {
  const url = buildUrl(latitude, longitude, units);
  url.searchParams.set(
    "current",
    [
      "temperature_2m",
      "apparent_temperature",
      "weather_code",
      "wind_speed_10m",
      "relative_humidity_2m",
      "precipitation",
    ].join(","),
  );

  const current = (await fetchForecast(url)).current;
  if (current === undefined || current.time === undefined) {
    throw new ForecastError("Weather API が current データを返しませんでした");
  }

  // `time` is printed as output by every command that fetches it, and it
  // comes from the network: a compromised API could carry an OSC sequence or
  // a newline into the date column. Control characters never belong in an ISO
  // date, so both fetchCurrent and fetchDaily strip them at the source, the
  // way geocode.ts sanitizes the place fields.
  return {
    time: sanitizeText(current.time),
    temperature: current.temperature_2m ?? Number.NaN,
    apparentTemperature: current.apparent_temperature ?? null,
    weatherCode: current.weather_code ?? -1,
    windSpeed: current.wind_speed_10m ?? null,
    humidity: current.relative_humidity_2m ?? null,
    precipitation: current.precipitation ?? null,
  };
};

const clampDays = (days: number): number =>
  Math.min(Math.max(Math.trunc(days), 1), MAX_FORECAST_DAYS);

export const fetchDaily = async (
  latitude: number,
  longitude: number,
  days: number,
  units: Units = "metric",
): Promise<DailyWeather[]> => {
  const url = buildUrl(latitude, longitude, units);
  url.searchParams.set(
    "daily",
    [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "precipitation_probability_max",
      "wind_speed_10m_max",
    ].join(","),
  );
  url.searchParams.set("forecast_days", String(clampDays(days)));

  const daily = (await fetchForecast(url)).daily;
  if (daily?.time === undefined) {
    throw new ForecastError("Weather API が daily データを返しませんでした");
  }

  const at = <T>(values: T[] | undefined, index: number): T | null =>
    values?.[index] ?? null;

  return daily.time.map((time, index) => ({
    time: sanitizeText(time),
    weatherCode: at(daily.weather_code, index) ?? -1,
    temperatureMax: at(daily.temperature_2m_max, index),
    temperatureMin: at(daily.temperature_2m_min, index),
    precipitationSum: at(daily.precipitation_sum, index),
    precipitationProbabilityMax: at(daily.precipitation_probability_max, index),
    windSpeedMax: at(daily.wind_speed_10m_max, index),
  }));
};

/** How far ahead an interval view looks, and so how many raw hours it keeps. */
export const HOURLY_WINDOW_HOURS = 24;

/**
 * The next {@link HOURLY_WINDOW_HOURS} hours, hour by hour, for the interval
 * commands to sample down. The API always begins `hourly.time` at local
 * midnight whatever the wall clock says, so the window is found by shifting
 * the client clock into the coordinates' own timezone with the offset the
 * response reports, then taking the first entry at or after that hour.
 */
export const fetchHourly = async (
  latitude: number,
  longitude: number,
  units: Units = "metric",
): Promise<HourlyWeather[]> => {
  const url = buildUrl(latitude, longitude, units);
  url.searchParams.set(
    "hourly",
    [
      "temperature_2m",
      "weather_code",
      "precipitation_probability",
      "wind_speed_10m",
      "precipitation",
    ].join(","),
  );
  // Two days is the smallest request that still covers a full window that
  // starts at the current hour of day zero.
  url.searchParams.set("forecast_days", "2");

  const response = await fetchForecast(url);
  const hourly = response.hourly;
  if (hourly?.time === undefined) {
    throw new ForecastError("Weather API が hourly データを返しませんでした");
  }

  const offsetMs = (response.utc_offset_seconds ?? 0) * 1000;
  const from = `${new Date(Date.now() + offsetMs).toISOString().slice(0, 13)}:00`;
  const start = hourly.time.findIndex((time) => time >= from);

  if (start === -1) return [];

  const at = <T>(values: T[] | undefined, index: number): T | null =>
    values?.[index] ?? null;

  return hourly.time
    .slice(start, start + HOURLY_WINDOW_HOURS)
    .map((time, offset) => {
      const index = start + offset;
      // Search for the match on the raw string above, then clean the one that
      // is printed: the date rides the table straight to the terminal.
      return {
        time: sanitizeText(time),
        temperature: at(hourly.temperature_2m, index),
        weatherCode: at(hourly.weather_code, index) ?? -1,
        precipitationProbability: at(hourly.precipitation_probability, index),
        windSpeed: at(hourly.wind_speed_10m, index),
        precipitation: at(hourly.precipitation, index),
      };
    });
};

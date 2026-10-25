/**
 * The shared contract of the capture tools: types, URL builders and the
 * fixture path scheme. `capture.ts` and `preload.ts` must agree on the URL
 * string for every response; `make-cases.ts` must agree on the case shape.
 * One file keeps them from drifting apart.
 */

export type Units = "metric" | "imperial";

export type FixtureKind =
  | { kind: "geocode"; name: string; language: string; count?: number }
  | {
      kind: "forecast-current";
      latitude: number;
      longitude: number;
      units?: Units;
    }
  | {
      kind: "forecast-daily";
      latitude: number;
      longitude: number;
      units?: Units;
      days: number;
    }
  | {
      kind: "forecast-hourly";
      latitude: number;
      longitude: number;
      units?: Units;
    };

export type FixtureSpec = FixtureKind & {
  status?: number;
  body?: unknown;
  networkError?: boolean;
};

export type Case = {
  id: string;
  group: string;
  argv: string[];
  state?: {
    config?: object;
    configRaw?: string;
    /** Written to places.json; `savedAtDaysAgo` keys the TTL clock. */
    cache?: Record<string, { savedAtDaysAgo: number; results: unknown[] }>;
    cacheRaw?: string;
    /** Snapshot places.json after the run into the golden. */
    snapshot?: boolean;
  };
  /** Hand written responses, written to `api/` before the run. */
  fixtures?: FixtureSpec[];
};

/** What a recorded response looks like on disk (`api/<hash>.json`). */
export type Stored = {
  url: string;
  status: number;
  body: string;
  contentType?: string;
  /** A hand written fixture standing in for a connection failure. */
  networkError?: boolean;
};

// ── URL builders ────────────────────────────────────────────────────────────
// The `href` must match what the app builds, parameter for parameter: the
// preload keys both sides on the URL string, so a drift breaks a case the
// moment the app changes its queries instead of quietly comparing stale
// behaviour.

const geocodeUrl = (
  name: string,
  language: string,
  count: number = 10,
): string => {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", name);
  url.searchParams.set("count", String(count));
  url.searchParams.set("language", language);
  url.searchParams.set("format", "json");
  return url.href;
};

const CURRENT_PARAMS = [
  "temperature_2m",
  "apparent_temperature",
  "weather_code",
  "wind_speed_10m",
  "relative_humidity_2m",
  "precipitation",
].join(",");

const DAILY_PARAMS = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "precipitation_probability_max",
  "wind_speed_10m_max",
].join(",");

const HOURLY_PARAMS = [
  "temperature_2m",
  "weather_code",
  "precipitation_probability",
  "wind_speed_10m",
  "precipitation",
].join(",");

const forecastUrl = (
  latitude: number,
  longitude: number,
  units: Units = "metric",
): URL => {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("timezone", "auto");
  if (units === "imperial") {
    url.searchParams.set("temperature_unit", "fahrenheit");
    url.searchParams.set("wind_speed_unit", "mph");
    url.searchParams.set("precipitation_unit", "inch");
  }
  return url;
};

export const fixtureUrl = (spec: FixtureKind): string => {
  if (spec.kind === "geocode") {
    return geocodeUrl(spec.name, spec.language, spec.count);
  }

  const url = forecastUrl(spec.latitude, spec.longitude, spec.units);
  if (spec.kind === "forecast-current") {
    url.searchParams.set("current", CURRENT_PARAMS);
  }
  if (spec.kind === "forecast-daily") {
    url.searchParams.set("daily", DAILY_PARAMS);
    url.searchParams.set("forecast_days", String(spec.days));
  }
  if (spec.kind === "forecast-hourly") {
    url.searchParams.set("hourly", HOURLY_PARAMS);
    url.searchParams.set("forecast_days", "2");
    url.searchParams.set("timeformat", "unixtime");
  }
  return url.href;
};

/** The URL string is the canonical key; the hash gives the file a stable name. */
export const fixturePath = (fixturesRoot: string, href: string): string => {
  const hash = new Bun.CryptoHasher("sha256")
    .update(href)
    .digest("hex")
    .slice(0, 16);
  return `${fixturesRoot}/api/${hash}.json`;
};

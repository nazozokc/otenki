#!/usr/bin/env bun
// Emits cases.jsonl. Review the source here; run to rewrite the manifest:
//   bun rust/fixtures/capture/make-cases.ts [outdir]
// The manifest stays in the repo so `capture.ts` reads it without this script.

import { type Case } from "./contracts.ts";

const cases: Case[] = [];

const entry = (
  group: string,
  id: string,
  label: string,
  argv: string[],
  extra: Omit<Partial<Case>, "id" | "group" | "argv"> = {},
): void => {
  cases.push({ id: `${id}-${label}`, group, argv, ...extra });
};

const cli = (id: string, label: string, argv: string[]): void =>
  entry("cli", id, label, argv);

// ── Plain CLI surface: no network, no state ───────────────────────────────

cli("001", "help-root", ["-h"]);
cli("002", "help-token", ["help"]);
cli("003", "help-command", ["help", "3h"]);
cli("004", "help-unknown-target", ["help", "bogus"]);
cli("005", "version", ["--version"]);
cli("006", "no-args", []);
cli("007", "unknown-command", ["bogus"]);
cli("008", "unknown-option", ["today", "--bogus", "函館"]);
cli("009", "option-before-command", ["--json"]);
cli("010", "missing-location", ["today"]);
cli("011", "cache-missing-arg", ["cache"]);
cli("012", "locate-missing-arg", ["locate"]);

// ── today ─────────────────────────────────────────────────────────────────

entry("today", "020", "ascii", ["today", "Tokyo"]);
entry("today", "021", "json-ja", ["today", "--json", "東京"]);
entry("today", "022", "ja-bare", ["today", "函館"]);
entry("today", "023", "ja-composite", ["today", "横浜市", "神奈川"]);
entry("today", "024", "en-multiword", ["today", "Kansas", "City", "Missouri"]);

// An OK response without `current`. fixtures: coordinates on mars? no — 0,0.
entry("today", "025", "current-missing", ["today", "0", "0"], {
  fixtures: [
    {
      kind: "forecast-current",
      latitude: 0,
      longitude: 0,
      body: {
        utc_offset_seconds: 0,
        timezone: "Africa/Abidjan",
        daily: { time: [] },
      },
    },
  ],
});
entry("today", "026", "coords", ["today", "41.77,140.73"]);
entry("today", "027", "imperial", ["today", "東京"], {
  state: { config: { units: "imperial" } },
});

// ── tomorrow ──────────────────────────────────────────────────────────────

entry("tomorrow", "030", "ja", ["tomorrow", "函館"]);
entry("tomorrow", "031", "json", ["tomorrow", "--json", "東京"]);

// ── weekly / fortnight ────────────────────────────────────────────────────

entry("weekly", "040", "en", ["weekly", "London"]);
entry("weekly", "041", "json-ja", ["weekly", "--json", "東京"]);
entry("weekly", "042", "imperial", ["weekly", "London"], {
  state: { config: { units: "imperial" } },
});
entry("fortnight", "050", "days-5", ["fortnight", "東京"], {
  state: { config: { days: 5 } },
});

// ── hour views ────────────────────────────────────────────────────────────

entry("hourly", "060", "3h", ["3h", "東京"]);
entry("hourly", "061", "6h", ["6h", "東京"]);
entry("hourly", "062", "12h-ja", ["12h", "函館"]);
entry("hourly", "063", "24h-json", ["24h", "--json", "東京"]);

// A fixture with barely enough hours: the window wants 24 from 13:00 and only
// finds 11 on the first day, so heading and row count follow what the API had.
const shortHourly = (hours: number): unknown => ({
  latitude: 10.5,
  longitude: 52.0,
  utc_offset_seconds: 3600,
  timezone: "Europe/Berlin",
  hourly: {
    time: Array.from({ length: hours }, (_, i) => 1792886400 + i * 3_600),
    temperature_2m: Array.from({ length: hours }, (_, i) =>
      i % 7 === 3 ? null : 7.5 + i * 0.4,
    ),
    weather_code: Array.from(
      { length: hours },
      (_, i) => [0, 2, 3, 61, 80, 71, 95][i % 7],
    ),
    precipitation_probability: Array.from(
      { length: hours },
      (_, i) => (i % 6) * 15,
    ),
    wind_speed_10m: Array.from(
      { length: hours },
      (_, i) => 2.0 + (i % 9) * 1.3,
    ),
    precipitation: Array.from(
      { length: hours },
      (_, i) => [0, 0, 0.1, 1.2, 4.1, 0, 0.8][i % 7],
    ),
  },
});
entry("hourly", "064", "short", ["3h", "10.5", "52.0"], {
  fixtures: [
    {
      kind: "forecast-hourly",
      latitude: 10.5,
      longitude: 52.0,
      body: shortHourly(11),
    },
  ],
});

// The legacy shape: ISO strings instead of unix timestamps and no timezone,
// so windowing falls back to fixed-offset rendering.
const isoHourly = (): unknown => ({
  latitude: 10.6,
  longitude: 52.1,
  utc_offset_seconds: 3600,
  hourly: {
    time: Array.from({ length: 8 }, (_, i) => `2026-10-25T${13 + i}:00`),
    temperature_2m: Array.from({ length: 8 }, (_, i) => 7.5 + i * 0.4),
    weather_code: Array.from(
      { length: 8 },
      (_, i) => [0, 2, 3, 61, 80, 71, 95, 99][i],
    ),
    precipitation_probability: Array.from(
      { length: 8 },
      (_, i) => (i % 6) * 15,
    ),
    wind_speed_10m: Array.from({ length: 8 }, (_, i) => 2.0 + i * 1.3),
    precipitation: Array.from(
      { length: 8 },
      (_, i) => [0, 0, 0.1, 1.2, 4.1, 0, 0.8, 2.3][i],
    ),
  },
});
entry("hourly", "065", "iso-legacy", ["3h", "10.6", "52.1"], {
  fixtures: [
    {
      kind: "forecast-hourly",
      latitude: 10.6,
      longitude: 52.1,
      body: isoHourly(),
    },
  ],
});

// ── locate ────────────────────────────────────────────────────────────────

// `東京` degenerates to a single hit on the live API, so `--all` and
// `--pick` need a multi-candidate query (`London` returns several).
entry("locate", "070", "basic", ["locate", "東京"]);
entry("locate", "071", "all", ["locate", "London", "--all"]);
entry("locate", "072", "json", ["locate", "東京", "--json"]);
entry("locate", "073", "pick", ["locate", "London", "--pick"]);
entry("locate", "074", "miss", ["locate", "nosuchplace12345"]);
entry("locate", "075", "coords", ["locate", "41.77,140.73"]);
entry("locate", "076", "api-error", ["locate", "geocode-broken"], {
  fixtures: [
    {
      kind: "geocode",
      name: "geocode-broken",
      language: "en",
      body: { error: true, reason: "Broken upstream" },
    },
  ],
});

// Geocoder transport failures, seen from `today`.
entry("locate", "077", "http-404", ["today", "geocode-http404"], {
  fixtures: [
    {
      kind: "geocode",
      name: "geocode-http404",
      language: "en",
      status: 404,
      body: {},
    },
  ],
});
entry("locate", "078", "network-fail", ["today", "geocode-netfail"], {
  fixtures: [
    {
      kind: "geocode",
      name: "geocode-netfail",
      language: "en",
      networkError: true,
    },
  ],
});

// ── forecast transport failures ───────────────────────────────────────────

entry("errors", "080", "forecast-500", ["today", "51.0,139.0"], {
  fixtures: [
    {
      kind: "forecast-current",
      latitude: 51.0,
      longitude: 139.0,
      status: 500,
      body: "boom",
    },
  ],
});
entry("errors", "081", "forecast-400", ["today", "33.0,130.1"], {
  fixtures: [
    {
      kind: "forecast-current",
      latitude: 33.0,
      longitude: 130.1,
      status: 400,
      body: { error: true, reason: "Invalid coordinate" },
    },
  ],
});
entry("errors", "082", "forecast-reason", ["today", "33.0,130.2"], {
  fixtures: [
    {
      kind: "forecast-current",
      latitude: 33.0,
      longitude: 130.2,
      body: { reason: "Latitude 33.000000 is out of range" },
    },
  ],
});
entry("errors", "083", "forecast-netfail", ["today", "44.1,141.1"], {
  fixtures: [
    {
      kind: "forecast-current",
      latitude: 44.1,
      longitude: 141.1,
      networkError: true,
    },
  ],
});

// ── cache ─────────────────────────────────────────────────────────────────

const tokyoPlace = {
  id: 1850147,
  name: "東京",
  latitude: 35.6895,
  longitude: 139.6917,
  feature_code: "PPLC",
  country_code: "JP",
  country: "日本",
  admin1: "東京都",
  population: 8336599,
  timezone: "Asia/Tokyo",
};

const staleEntry = {
  id: 999,
  name: "古い東京",
  latitude: 1,
  longitude: 2,
};

entry("cache", "090", "clear", ["cache", "--clear"], {
  state: {
    cache: {
      "2:東京": { savedAtDaysAgo: 0.5, results: [tokyoPlace] },
      "2:函館": { savedAtDaysAgo: 40, results: [staleEntry] },
      "1:旧版": { savedAtDaysAgo: 1, results: [staleEntry] },
    },
    snapshot: true,
  },
});

entry("cache", "091", "hit", ["today", "東京"], {
  state: {
    cache: { "2:東京": { savedAtDaysAgo: 0.5, results: [tokyoPlace] } },
    snapshot: true,
  },
  fixtures: [
    {
      kind: "forecast-current",
      latitude: 35.6895,
      longitude: 139.6917,
      body: {
        current: {
          time: "2026-10-25T22:30",
          temperature_2m: 18.3,
          apparent_temperature: 16.9,
          weather_code: 3,
          wind_speed_10m: 15.2,
          relative_humidity_2m: 63,
          precipitation: 2.1,
        },
        utc_offset_seconds: 32400,
        timezone: "Asia/Tokyo",
      },
    },
  ],
});

entry("cache", "092", "expired", ["today", "東京"], {
  state: {
    cache: { "2:東京": { savedAtDaysAgo: 40, results: [staleEntry] } },
    snapshot: true,
  },
  fixtures: [
    {
      kind: "forecast-current",
      latitude: 35.6895,
      longitude: 139.6917,
      body: {
        current: {
          time: "2026-10-25T22:30",
          temperature_2m: 18.3,
          apparent_temperature: 16.9,
          weather_code: 3,
          wind_speed_10m: 15.2,
          relative_humidity_2m: 63,
          precipitation: 2.1,
        },
        utc_offset_seconds: 32400,
        timezone: "Asia/Tokyo",
      },
    },
  ],
});

entry("cache", "093", "poison", ["today", "東京"], {
  state: {
    cacheRaw: JSON.stringify({
      "2:東京": { savedAt: "not-a-number", results: [] },
      __proto__: { savedAt: 1, results: [staleEntry] },
      "2:呪い": { savedAt: 123, results: 42 },
    }),
    snapshot: true,
  },
  fixtures: [
    {
      kind: "forecast-current",
      latitude: 35.6895,
      longitude: 139.6917,
      body: {
        current: {
          time: "2026-10-25T22:30",
          temperature_2m: 18.3,
          apparent_temperature: 16.9,
          weather_code: 3,
          wind_speed_10m: 15.2,
          relative_humidity_2m: 63,
          precipitation: 2.1,
        },
        utc_offset_seconds: 32400,
        timezone: "Asia/Tokyo",
      },
    },
  ],
});

// ── config ────────────────────────────────────────────────────────────────

entry("config", "100", "location-array", ["today"], {
  state: { config: { location: [35.6895, 139.6917] } },
});
entry("config", "101", "location-name", ["today"], {
  state: { config: { location: "函館市" } },
});
entry("config", "102", "command-bare", [], {
  state: { config: { command: "weekly", location: "函館" } },
});
entry("config", "103", "command-unknown", [], {
  state: { config: { command: "nope" } },
});
entry("config", "104", "color-always", ["today", "東京"], {
  state: { config: { color: "always" } },
});
entry("config", "105", "color-never", ["today", "東京"], {
  state: { config: { color: "never" } },
});
entry("config", "106", "bad-units", [], {
  state: { config: { units: "fahrenheit" } },
});
entry("config", "107", "days-range", [], {
  state: { config: { days: 20 } },
});
entry("config", "108", "location-range", [], {
  state: { config: { location: [91, 10] } },
});
entry("config", "109", "invalid-json", [], {
  state: { configRaw: "{ broken" },
});
entry("config", "110", "unknown-key", [], {
  state: { config: { colo: "1" } },
});

// ── write ─────────────────────────────────────────────────────────────────

const out = cases.map((item) => JSON.stringify(item, null, 0)).join("\n");

const target = process.argv[2] ?? import.meta.dir;
const file = `${target}/cases.jsonl`;
await Bun.write(file, `${out}\n`);
console.log(`${cases.length} cases -> ${file}`);

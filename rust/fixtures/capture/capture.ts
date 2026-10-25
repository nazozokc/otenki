#!/usr/bin/env bun
/**
 * Runs every case in `cases.jsonl` and records what the current CLI does.
 *
 *   bun rust/fixtures/capture/capture.ts            # capture goldens (replay)
 *   bun rust/fixtures/capture/capture.ts --record   # same, networked where recordings are missing
 *   bun rust/fixtures/capture/capture.ts --verify   # compare against the goldens, no writes
 *
 * Cases are hermetic: each one gets its own `work/<id>` directory for
 * `XDG_STATE_HOME` / `XDG_CONFIG_HOME`, a frozen `Date.now` (`OTENKI_NOW`) and
 * a fetch router (`rust/fixtures/capture/preload.ts`). The goldens under
 * `goldens/` are the contract the Rust port is measured against.
 */

// The freeze point the whole battery shares. Everything concrete — hourly
// windows, cache TTLs, savedAt values — derives from this absolute instant.
const NOW = Date.parse("2026-10-25T13:30:00Z");

const VERSION = "0.3.1";

const repoRoot = new URL("../../../", import.meta.url).pathname;
const fixturesRoot = `${repoRoot}rust/fixtures`;
const captureDir = `${fixturesRoot}/capture`;
const workRoot = `${fixturesRoot}/work`;
const goldensRoot = `${fixturesRoot}/goldens`;
const apiRoot = `${fixturesRoot}/api`;

type Units = "metric" | "imperial";

type FixtureKind =
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

type FixtureSpec = FixtureKind & {
  status?: number;
  body?: unknown;
  networkError?: boolean;
};

type Case = {
  id: string;
  group: string;
  argv: string[];
  env?: Record<string, string>;
  /** Materialised for the run: the config file and the pre-seeded cache. */
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

type Stored = {
  url: string;
  status: number;
  body: string;
  contentType?: string;
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

const fixtureHref = (spec: FixtureKind): string => {
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

const writeFixtures = async (cases: Case[]): Promise<void> => {
  for (const item of cases) {
    for (const spec of item.fixtures ?? []) {
      const stored: Stored = {
        url: fixtureHref(spec),
        status: spec.status ?? 200,
        body:
          typeof spec.body === "string"
            ? spec.body
            : JSON.stringify(spec.body ?? {}),
        contentType: "application/json",
        networkError: spec.networkError,
      };
      const file = `${apiRoot}/${new Bun.CryptoHasher("sha256").update(stored.url).digest("hex").slice(0, 16)}.json`;
      await Bun.write(file, `${JSON.stringify(stored, null, 2)}\n`);
    }
  }
};

// ── Run ─────────────────────────────────────────────────────────────────────

const loadCases = async (): Promise<Case[]> => {
  const text = await Bun.file(`${captureDir}/cases.jsonl`).text();
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Case);
};

const prepareState = async (item: Case): Promise<string> => {
  const root = `${workRoot}/${item.id}`;
  const configRoot = `${root}/config`;
  const stateRoot = `${root}/state`;

  await Bun.$`rm -rf ${root}`.quiet();
  await Bun.$`mkdir -p ${configRoot}/otenki ${stateRoot}/otenki`.quiet();

  if (item.state?.config !== undefined) {
    await Bun.write(
      `${configRoot}/otenki/config.json`,
      `${JSON.stringify(item.state.config, null, 2)}\n`,
    );
  } else if (item.state?.configRaw !== undefined) {
    await Bun.write(`${configRoot}/otenki/config.json`, item.state.configRaw);
  }

  if (item.state?.cache !== undefined) {
    const entries: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(item.state.cache)) {
      entries[key] = {
        savedAt: NOW - Math.floor(value.savedAtDaysAgo * 24 * 3_600_000),
        results: value.results,
      };
    }
    await Bun.write(
      `${stateRoot}/otenki/places.json`,
      `${JSON.stringify(entries, null, 2)}\n`,
    );
  } else if (item.state?.cacheRaw !== undefined) {
    await Bun.write(`${stateRoot}/otenki/places.json`, item.state.cacheRaw);
  }

  return root;
};

const baseEnv = (
  mode: "record" | "replay",
  root: string,
): Record<string, string> => ({
  OTENKI_VERSION: VERSION,
  OTENKI_NOW: String(NOW),
  // The preload keys responses by URL under `<root>/api/<hash>.json`, so the
  // env points at the fixtures root, not the api directory itself.
  OTENKI_FIXTURE_DIR: fixturesRoot,
  OTENKI_FIXTURE_MODE: mode,
  TZ: "UTC",
  LC_ALL: "C.UTF-8",
  NO_COLOR: "1",
  XDG_CONFIG_HOME: `${root}/config`,
  XDG_STATE_HOME: `${root}/state`,
  PATH: `${captureDir}/bin:${process.env.PATH ?? ""}`,
});

/** `savedAt` is wall-clock dependent: freeze it so the file has no watermark. */
const normalizeState = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalizeState);
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = key === "savedAt" ? "{SAVED_AT}" : normalizeState(entry);
    }
    return out;
  }
  return value;
};

const normalize = (text: string, root: string): string =>
  text.replaceAll(repoRoot, "{REPO}").replaceAll(root, "{WORK}");

const runCase = async (
  item: Case,
  mode: "record" | "replay",
): Promise<{
  out: string;
  err: string;
  exit: number;
  state: string | null;
}> => {
  const root = await prepareState(item);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries({
    ...baseEnv(mode, root),
    ...(item.env ?? {}),
  })) {
    env[key] = value;
  }

  const child = Bun.spawn(
    [
      "bun",
      "--preload",
      `${captureDir}/preload.ts`,
      `${repoRoot}apps/otenki/src/index.ts`,
      ...item.argv,
    ],
    { cwd: repoRoot, env, stdout: "pipe", stderr: "pipe" },
  );
  const [out, err, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  let state: string | null = null;
  if (item.state?.snapshot === true) {
    const file = Bun.file(`${root}/state/otenki/places.json`);
    if (await file.exists()) {
      state = JSON.stringify(
        normalizeState(JSON.parse(await file.text())),
        null,
        2,
      );
    }
  }

  return {
    out: normalize(out, root),
    err: normalize(err, root),
    exit,
    state: state === null ? null : `${state}\n`,
  };
};

// ── Goldens ─────────────────────────────────────────────────────────────────

const golden = (item: Case) => {
  const dir = `${goldensRoot}/${item.group}`;
  return {
    dir,
    out: `${dir}/${item.id}.out`,
    err: `${dir}/${item.id}.err`,
    exit: `${dir}/${item.id}.exit`,
    state: `${dir}/${item.id}.state`,
  };
};

const capture = async (
  item: Case,
  mode: "record" | "replay",
): Promise<string> => {
  const run = await runCase(item, mode);
  const paths = golden(item);
  await Bun.$`mkdir -p ${paths.dir}`.quiet();
  await Bun.write(paths.out, run.out);
  await Bun.write(paths.err, run.err);
  await Bun.write(paths.exit, `${run.exit}\n`);
  if (run.state === null) await Bun.$`rm -f ${paths.state}`.quiet();
  else await Bun.write(paths.state, run.state);
  return `${item.id}: exit ${run.exit}, out ${run.out.length}B, err ${run.err.length}B`;
};

const diffText = (name: string, want: string, got: string): string | null => {
  if (want === got) return null;
  const lines: string[] = [`${name} differs from the golden`];
  const wantLines = want.split("\n");
  const gotLines = got.split("\n");
  for (let i = 0; i < Math.max(wantLines.length, gotLines.length); i++) {
    if (wantLines[i] !== gotLines[i]) {
      lines.push(
        `  line ${i + 1}: want ${JSON.stringify(wantLines[i])}, got ${JSON.stringify(gotLines[i])}`,
      );
    }
  }
  return lines.join("\n");
};

const verify = async (item: Case): Promise<string> => {
  const run = await runCase(item, "replay");
  const paths = golden(item);
  const problems = [
    diffText(
      "exit",
      (await Bun.file(paths.exit).text()).trim(),
      String(run.exit),
    ),
    diffText("stdout", await Bun.file(paths.out).text(), run.out),
    diffText("stderr", await Bun.file(paths.err).text(), run.err),
  ];

  const wantsState = await Bun.file(paths.state).exists();
  if (!wantsState && run.state !== null) {
    problems.push("state: no golden, but the run wrote places.json");
  }
  if (wantsState && run.state === null) {
    problems.push("state: golden exists, but the run wrote no places.json");
  }
  if (wantsState && run.state !== null) {
    problems.push(
      diffText("state", await Bun.file(paths.state).text(), run.state),
    );
  }

  const flat = problems.filter((problem) => problem !== null);
  return flat.length === 0
    ? `${item.id}: ok`
    : `${item.id}: FAIL\n${flat.join("\n")}`;
};

// ── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  const wantVerify = process.argv.includes("--verify");
  const record = process.argv.includes("--record");
  const items = await loadCases();

  if (record) await writeFixtures(items);

  let failed = 0;
  for (const item of items) {
    try {
      const result = wantVerify
        ? await verify(item)
        : await capture(item, record ? "record" : "replay");
      if (result.includes("FAIL")) failed++;
      console.log(result);
    } catch (error: unknown) {
      failed++;
      console.error(
        `${item.id}: ERROR ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log(
    `${items.length} cases ${wantVerify ? "verified" : "captured"}, ${failed} failed`,
  );
  if (failed > 0) process.exit(1);
};

await main();

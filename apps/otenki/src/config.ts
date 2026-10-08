import { MAX_FORECAST_DAYS } from "./forecast.ts";
import { homedir } from "node:os";
import { isAbsolute } from "node:path";

/**
 * The config file: `$XDG_CONFIG_HOME/otenki/config.json`, falling back to
 * `~/.config/otenki/config.json` exactly the way the state directory resolves
 * for the cache. Every key is optional — an absent file, an absent key and an
 * explicit default all mean the same thing, so the CLI works untouched until
 * there is a reason to configure it.
 */

/** How temperatures, wind and precipitation are asked for and printed. */
export type Units = "metric" | "imperial";

/** Overrides the TTY and `NO_COLOR` detection: `auto` is the detection. */
export type ColorMode = "auto" | "always" | "never";

/** A place name (`函館`, `横浜市 神奈川`) or a `[latitude, longitude]` pair. */
export type DefaultLocation = string | [number, number];

export type Config = {
  /** Where commands that take a location go when the argument is omitted. */
  location?: DefaultLocation;
  /** The command a bare `otenki` runs. */
  command?: string;
  /** Colour policy. `auto` follows TTY and `NO_COLOR`. */
  color?: ColorMode;
  /** Unit system for the API query and the rendered numbers. */
  units?: Units;
  /** Forecast days for `weekly` and `fortnight`, 1 to 16. */
  days?: number;
};

/** A config file the user can fix: unreadable, malformed, out of range. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const configDir = (): string => {
  // A relative XDG_CONFIG_HOME is ignored per the XDG spec, and `homedir()`
  // rather than `process.env.HOME` so an unset HOME cannot build a relative
  // path out of `undefined`.
  const xdg = process.env.XDG_CONFIG_HOME;
  const home =
    xdg !== undefined && xdg !== "" && isAbsolute(xdg)
      ? xdg
      : `${homedir()}/.config`;
  return `${home}/otenki`;
};

export const configPath = (): string => `${configDir()}/config.json`;

/** The one escape hatch: skip the config file entirely. */
export const NO_CONFIG_FLAG = "--no-config";

/**
 * Pulls `--no-config` out of the arguments before the command parser sees it,
 * so the flag works in every position without the parser, the help text and
 * the command table each having to know about it. After `--` every token is
 * positional: a place named `--no-config` stays a place.
 */
export const stripNoConfig = (
  argv: readonly string[],
): { argv: string[]; noConfig: boolean } => {
  const out: string[] = [];
  let noConfig = false;
  let literal = false;

  for (const token of argv) {
    if (literal) {
      out.push(token);
      continue;
    }

    if (token === "--") {
      literal = true;
      out.push(token);
      continue;
    }

    if (token === NO_CONFIG_FLAG) {
      noConfig = true;
      continue;
    }

    out.push(token);
  }

  return { argv: out, noConfig };
};

const KEYS = ["location", "command", "color", "units", "days"] as const;

// The explicit variable annotation is load-bearing: TypeScript only treats a
// call as never-returning (and narrows the code after it) when the callee is a
// const with a written-out type, so `if (bad) fail(...)` really does end the
// branch instead of merging `unknown` back into the flow.
const fail: (path: string, detail: string) => never = (path, detail): never => {
  throw new ConfigError(`config: ${path}: ${detail}`);
};

const validateLocation = (path: string, value: unknown): DefaultLocation => {
  if (typeof value === "string") {
    if (value.trim() === "") fail(path, "location must not be empty");
    return value;
  }

  if (Array.isArray(value)) {
    const [latitude, longitude] = value;
    if (
      value.length !== 2 ||
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      fail(path, "location must be two finite numbers [latitude, longitude]");
    }

    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      fail(
        path,
        `location out of range: ${latitude}, ${longitude} (latitude -90..90, longitude -180..180)`,
      );
    }

    return [latitude, longitude];
  }

  return fail(path, "location must be a place name or [latitude, longitude]");
};

const validateEnum = <T extends string>(
  path: string,
  key: string,
  value: unknown,
  allowed: readonly T[],
): T => {
  if (
    typeof value !== "string" ||
    !(allowed as readonly string[]).includes(value)
  ) {
    fail(
      path,
      `${key} must be ${allowed.slice(0, -1).join(", ")} or ${allowed[allowed.length - 1]}`,
    );
  }

  return value as T;
};

const validateString = (path: string, key: string, value: unknown): string => {
  if (typeof value !== "string" || value.trim() === "") {
    fail(path, `${key} must be a non-empty string`);
  }

  return value;
};

/** Structural validation: keys, types, ranges. Command names belong to the CLI. */
const validate = (path: string, raw: unknown): Config => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail(path, "expected a JSON object");
  }

  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!(KEYS as readonly string[]).includes(key)) {
      fail(path, `unknown key '${key}'`);
    }
  }

  const config: Config = {};

  if (record.location !== undefined) {
    config.location = validateLocation(path, record.location);
  }

  if (record.command !== undefined) {
    config.command = validateString(path, "command", record.command);
  }

  if (record.color !== undefined) {
    config.color = validateEnum(path, "color", record.color, [
      "auto",
      "always",
      "never",
    ] as const);
  }

  if (record.units !== undefined) {
    config.units = validateEnum(path, "units", record.units, [
      "metric",
      "imperial",
    ] as const);
  }

  if (record.days !== undefined) {
    const days = record.days;
    if (
      typeof days !== "number" ||
      !Number.isInteger(days) ||
      days < 1 ||
      days > MAX_FORECAST_DAYS
    ) {
      fail(path, `days must be an integer from 1 to ${MAX_FORECAST_DAYS}`);
    }

    config.days = days;
  }

  return config;
};

/**
 * Reads and validates the config file. A missing file is `{}` — not an error,
 * because a config-less install is the default state. A file that exists but
 * does not understand is an error with the path in it: silently ignoring a
 * typo would make the CLI appear to ignore the user on purpose.
 *
 * `path` defaults to `configPath()` and exists for the tests.
 */
export const loadConfig = async (
  path: string = configPath(),
): Promise<Config> => {
  const file = Bun.file(path);
  if (!(await file.exists())) return {};

  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch (failure: unknown) {
    const detail = failure instanceof Error ? failure.message : String(failure);
    fail(path, `invalid JSON (${detail})`);
  }

  return validate(path, raw);
};

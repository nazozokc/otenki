import type { GeocodeResult } from "./geocode.ts";
import { homedir } from "node:os";
import { isAbsolute } from "node:path";

/**
 * XDG state directory, resolved the same way every other tool does. Kept in
 * `state` rather than `cache` so a cache purge does not silently send the user
 * back to the network for a place they look up every morning.
 *
 * `homedir()` instead of `process.env.HOME`: an unset HOME turned
 * `${HOME}/.local/state` into a relative `undefined/.local/state` path that
 * landed in whatever directory the command ran in (and once, in git). A
 * relative XDG_STATE_HOME is ignored per the XDG spec for the same reason.
 */
const stateDir = (): string => {
  const xdg = process.env.XDG_STATE_HOME;
  const home =
    xdg !== undefined && xdg !== "" && isAbsolute(xdg)
      ? xdg
      : `${homedir()}/.local/state`;
  return `${home}/otenki`;
};

const cacheFile = (): string => `${stateDir()}/places.json`;

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

type Entry = {
  /** Places do not move, but the geocoder's result set can change. */
  savedAt: number;
  results: GeocodeResult[];
};

/**
 * The cache file lives outside this process's control: a hand-edited or
 * poisoned entry must degrade to a cache miss, never to a crash or to a
 * place the user did not ask for. Only the fields consumers read are
 * checked; optional strings are tolerated as absent rather than audited
 * one by one.
 */
const isEntry = (value: unknown): value is Entry => {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.savedAt !== "number" || !Number.isFinite(entry.savedAt)) {
    return false;
  }
  if (!Array.isArray(entry.results)) return false;

  return entry.results.every((result) => {
    if (typeof result !== "object" || result === null) return false;
    const place = result as Record<string, unknown>;
    return (
      typeof place.name === "string" &&
      typeof place.latitude === "number" &&
      Number.isFinite(place.latitude) &&
      typeof place.longitude === "number" &&
      Number.isFinite(place.longitude)
    );
  });
};

const readCache = async (): Promise<Record<string, Entry>> => {
  try {
    const file = Bun.file(cacheFile());
    if (!(await file.exists())) return {};

    const parsed: unknown = await file.json();
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    const valid: Record<string, Entry> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isEntry(value)) valid[key] = value;
    }
    return valid;
  } catch {
    // A corrupt or unreadable cache must never break a lookup.
    return {};
  }
};

const writeCache = async (cache: Record<string, Entry>): Promise<void> => {
  try {
    await Bun.write(cacheFile(), JSON.stringify(cache, null, 2));
  } catch {
    // Read-only home directory, for instance. Not worth failing the command.
  }
};

export const cachedGeocode = async (
  query: string,
  load: () => Promise<GeocodeResult[]>,
): Promise<GeocodeResult[]> => {
  const key = query.trim();
  const cache = await readCache();
  const hit = cache[key];

  if (hit !== undefined && Date.now() - hit.savedAt < TTL_MS) {
    return hit.results;
  }

  const results = await load();
  if (results.length === 0) return results;

  cache[key] = { savedAt: Date.now(), results };

  // Drop stale entries on write so the file cannot grow without bound.
  const kept: Record<string, Entry> = {};
  for (const [cachedKey, entry] of Object.entries(cache)) {
    if (Date.now() - entry.savedAt < TTL_MS) kept[cachedKey] = entry;
  }

  await writeCache(kept);
  return results;
};

export const clearCache = async (): Promise<void> => {
  try {
    await Bun.write(cacheFile(), "{}");
  } catch {
    // writeCache is background saving and swallows; this is the command's
    // whole job, so a read-only location must surface as a readable failure
    // rather than a stack trace — and never as a false success.
    throw new Error(
      "キャッシュの消去に失敗しました（書き込み権限を確認してください）",
    );
  }
};

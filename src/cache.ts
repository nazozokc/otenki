import type { GeocodeResult } from "./geocode.ts";

/**
 * XDG state directory, resolved the same way every other tool does. Kept in
 * `state` rather than `cache` so a cache purge does not silently send the user
 * back to the network for a place they look up every morning.
 */
const stateDir = (): string => {
  const home = process.env.XDG_STATE_HOME ?? `${process.env.HOME}/.local/state`;
  return `${home}/otenki`;
};

const cacheFile = (): string => `${stateDir()}/places.json`;

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

type Entry = {
  /** Places do not move, but the geocoder's result set can change. */
  savedAt: number;
  results: GeocodeResult[];
};

const readCache = async (): Promise<Record<string, Entry>> => {
  try {
    const file = Bun.file(cacheFile());
    if (!(await file.exists())) return {};

    return (await file.json()) as Record<string, Entry>;
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
  await Bun.write(cacheFile(), "{}");
};

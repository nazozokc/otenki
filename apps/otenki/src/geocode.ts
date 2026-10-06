import { cachedGeocode } from "./cache.ts";
import { fetchJson } from "./http.ts";
import { sanitizeText } from "./sanitize.ts";

const GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";

/** Suffixes appended when a bare name (e.g. 函館) returns nothing. */
const EXPAND_SUFFIXES = ["県", "都", "府", "市", "町", "村"] as const;

const TRAILING_SUFFIX = /[県都府市町村]+$/;

/** Queries written in Japanese need the suffix ladder; romaji does not. */
const JAPANESE_SCRIPT = /[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff]/;

const DEFAULT_COUNT = 10;

export type GeocodeResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  feature_code?: string;
  country_code?: string;
  country?: string;
  admin1?: string;
  admin2?: string;
  population?: number | null;
  timezone?: string;
};

type GeocodeResponse = {
  results?: GeocodeResult[];
  error?: boolean;
  reason?: string;
};

export class GeocodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocodeError";
  }
}

/** GeoNames feature codes: populated places are what a weather lookup wants. */
const FEATURE_RANK: Record<string, number> = {
  PPLC: 0,
  PPLA: 1,
  PPLA2: 1,
  PPL: 2,
  PPLX: 2,
  PPLL: 2,
};

const featureRank = (featureCode: string | undefined): number => {
  if (featureCode === undefined) return 9;
  const known = FEATURE_RANK[featureCode];
  if (known !== undefined) return known;
  if (featureCode.startsWith("PPL")) return 3;
  if (featureCode.startsWith("PRL")) return 4;
  if (featureCode.startsWith("P")) return 5;
  return 8;
};

/** Exported for tests: both are pure and carry the trickiest logic here. */
export const rankCandidates = (places: GeocodeResult[]): GeocodeResult[] =>
  [...places].sort(
    (a, b) =>
      featureRank(a.feature_code) - featureRank(b.feature_code) ||
      (b.population ?? 0) - (a.population ?? 0) ||
      a.name.localeCompare(b.name, "ja"),
  );

/**
 * The Geocoding API indexes one name per GeoNames record and matches on a
 * prefix, so Japanese input misses the same place depending on whether the
 * suffix is spelled out: 函館 and 仙台市 return nothing while 函館市 and 仙台
 * succeed. Walk the suffixes in both directions until something dominant turns
 * up. A query that already ends in a suffix tries the bare form first, since
 * that is the cheaper miss to correct. Only Japanese script needs the ladder;
 * appending 県 to "Tokyo" would be nonsense.
 */
export const candidateQueries = (query: string): string[] => {
  const trimmed = query.trim();
  if (!JAPANESE_SCRIPT.test(trimmed)) return [trimmed];

  const stripped = trimmed.replace(TRAILING_SUFFIX, "");
  const bases =
    stripped !== "" && stripped !== trimmed ? [stripped, trimmed] : [trimmed];

  return bases.flatMap((base) => [
    base,
    ...EXPAND_SUFFIXES.map((suffix) => base + suffix),
  ]);
};

const search = async (
  name: string,
  count: number,
): Promise<GeocodeResult[]> => {
  const url = new URL(GEOCODING_ENDPOINT);
  url.searchParams.set("name", name);
  url.searchParams.set("count", String(count));
  url.searchParams.set("language", "ja");
  url.searchParams.set("format", "json");
  // Deliberately no countryCode filter. Kanji is shared with Chinese and kana
  // turns up in Korean names, so scoping to JP hides 上海 and 서울 entirely.
  // Homonyms are handled by ranking instead, which keeps 横浜 pointing at
  // 横浜市 in Kanagawa rather than the 4,412 person 横浜 in Aomori.

  const data = await fetchJson<GeocodeResponse>(url);
  if (data.error === true) {
    throw new GeocodeError(
      `Geocoding API エラー: ${data.reason ?? "不明な理由"}`,
    );
  }

  return data.results ?? [];
};

/** Optional string fields: absent stays absent, a non-string is dropped. */
const clean = (value: unknown): string | undefined =>
  typeof value === "string" ? sanitizeText(value) : undefined;

/**
 * Control characters never belong in a place name, but a compromised API or
 * cache file could carry them, and every consumer prints these fields raw.
 * Sanitizing at the source covers the table, fzf, labels and JSON alike.
 */
const sanitizePlace = (place: GeocodeResult): GeocodeResult => ({
  ...place,
  name:
    typeof place.name === "string"
      ? sanitizeText(place.name)
      : String(place.name),
  feature_code: clean(place.feature_code),
  country_code: clean(place.country_code),
  country: clean(place.country),
  admin1: clean(place.admin1),
  admin2: clean(place.admin2),
  timezone: clean(place.timezone),
});

/** All candidates for a place name, best match first. */
export const geocode = async (
  query: string,
  count: number = DEFAULT_COUNT,
): Promise<GeocodeResult[]> => {
  const results = await cachedGeocode(query, async () => {
    // The variants are independent, so issue them at once rather than paying a
    // round trip each: the full ladder is otherwise up to 14 sequential requests.
    const responses = await Promise.all(
      candidateQueries(query).map((name) => search(name, count)),
    );

    const found = new Map<number, GeocodeResult>();
    for (const places of responses) {
      for (const place of places) found.set(place.id, place);
    }

    return rankCandidates([...found.values()]);
  });

  // After the cache, not just after the fetch: a hit returns whatever is on
  // disk, and disk is outside this process's control.
  return results.map(sanitizePlace);
};

/** Best single match. Throws when the name matches nothing. */
export const geocodeOne = async (query: string): Promise<GeocodeResult> => {
  const places = await geocode(query);
  const best = places[0];
  if (best === undefined) {
    throw new GeocodeError(`"${query}" の場所が見つかりませんでした`);
  }
  return best;
};

export const placeLabel = (place: GeocodeResult): string =>
  [place.name, place.admin1]
    .filter((part) => part !== undefined && part !== "")
    .join(" ");

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

/**
 * Whitespace turns one argument into a place name plus the filters that narrow
 * it down: `横浜市 神奈川` is a name and a prefecture, not one long name. The
 * API only indexes a single name per record, so a joined query matches
 * nothing at all and has to be taken apart here.
 *
 * Exported for tests: the split is the whole contract with resolveLocation.
 */
export const queryTokens = (query: string): string[] =>
  query
    .trim()
    .split(/\s+/)
    .filter((token) => token !== "");

/**
 * Fields a filter token is allowed to appear in. The API returns these in the
 * requested language, so `country` is 日本 under `language=ja` and Japan under
 * `language=en`; matching against every field keeps either spelling working.
 * Exported for tests.
 */
const filterFields = (place: GeocodeResult): string[] =>
  [
    place.name,
    place.admin1,
    place.admin2,
    place.country,
    place.country_code,
  ].filter((field): field is string => field !== undefined && field !== "");

/**
 * A token matches when it is contained in a field or the other way round:
 * `神奈川` has to reach `神奈川県` and `神奈川県` has to reach `神奈川`, since
 * the caller and the index disagree about whether the suffix is spelled out.
 * Case folding only affects ASCII, so `Tokyo` and `tokyo` compare equal.
 * Exported for tests.
 */
export const matchesTokens = (
  place: GeocodeResult,
  tokens: string[],
): boolean =>
  tokens.every((token) => {
    const needle = token.toLowerCase();
    return filterFields(place).some((field) => {
      const hay = field.toLowerCase();
      return hay.includes(needle) || needle.includes(hay);
    });
  });

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

/** Every ladder variant at once, deduplicated and ranked. */
const ladder = async (
  name: string,
  count: number,
): Promise<GeocodeResult[]> => {
  // The variants are independent, so issue them at once rather than paying a
  // round trip each: the full ladder is otherwise up to 14 sequential requests.
  const responses = await Promise.all(
    candidateQueries(name).map((query) => search(query, count)),
  );

  const found = new Map<number, GeocodeResult>();
  for (const places of responses) {
    for (const place of places) found.set(place.id, place);
  }

  return rankCandidates([...found.values()]);
};

/**
 * The two orders worth trying: the name first (`横浜市 神奈川`), then the
 * documented swap (`神奈川 横浜市`). Two passes cap the cost whatever the
 * caller typed — a twenty token typo would otherwise walk the ladder once per
 * token. Only called for a multi token query, so both tokens exist.
 */
const passes = (tokens: string[]): { primary: string; filters: string[] }[] => {
  const head = tokens[0];
  const second = tokens[1];
  if (head === undefined || second === undefined) return [];

  const byName = { primary: head, filters: tokens.slice(1) };
  if (second === head) return [byName];

  return [
    byName,
    { primary: second, filters: tokens.filter((_, index) => index !== 1) },
  ];
};

/**
 * All candidates for a place name, best match first. A whitespace separated
 * query is read as name plus filters, so `横浜市 神奈川` narrows the ladder's
 * output to Kanagawa instead of asking the API to index both words at once.
 */
export const geocode = async (
  query: string,
  count: number = DEFAULT_COUNT,
): Promise<GeocodeResult[]> => {
  const results = await cachedGeocode(query, async () => {
    const tokens = queryTokens(query);
    if (tokens.length < 2) return ladder(query, count);

    // Both orders are searched and the survivors pooled rather than returning
    // whichever pass answers first: `神奈川 横浜市` has to reach 横浜市 even
    // though the swap's first token also names a district inside it, and the
    // ranker already knows a PPLA city outranks a PPL. The filters still do
    // the narrowing — the swap only widens what is on offer, never the answer
    // to a query that matched nothing.
    const searches = passes(tokens);

    // Plus the phrase exactly as typed: `New York` is a name with a space in
    // it, and neither half is one, so only the joined form can find it. This
    // is also every result the split ever produced before, unfiltered, which
    // is what keeps the new path from losing a match the old one had. A
    // Japanese phrase matches nothing at all (the bug this replaced) so it is
    // not worth the ladder batch.
    if (!JAPANESE_SCRIPT.test(query)) {
      searches.push({ primary: query.trim(), filters: [] });
    }

    const found = new Map<number, GeocodeResult>();
    for (const { primary, filters } of searches) {
      for (const place of await ladder(primary, count)) {
        if (matchesTokens(place, filters)) found.set(place.id, place);
      }
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

/**
 * `name` and `admin1` are the same string for 東京都 and 北海道, and printing it
 * twice reads like a copy-paste mistake rather than as emphasis.
 */
export const placeLabel = (place: GeocodeResult): string => {
  const name = place.name.trim();
  const admin1 = (place.admin1 ?? "").trim();

  if (name === "") return admin1;
  if (admin1 === "" || name.toLowerCase() === admin1.toLowerCase()) return name;
  return `${name} ${admin1}`;
};

import { describe, expect, test } from "bun:test";
import {
  candidateQueries,
  matchesTokens,
  placeLabel,
  queryTokens,
  rankCandidates,
  type GeocodeResult,
} from "../src/geocode.ts";

const place = (over: Partial<GeocodeResult>): GeocodeResult => ({
  id: 1,
  name: "x",
  latitude: 0,
  longitude: 0,
  ...over,
});

describe("candidateQueries", () => {
  test("expands a bare Japanese name with every administrative suffix", () => {
    expect(candidateQueries("函館")).toEqual([
      "函館",
      "函館県",
      "函館都",
      "函館府",
      "函館市",
      "函館町",
      "函館村",
    ]);
  });

  test("strips a trailing suffix and tries the bare form first", () => {
    // 仙台市 returns nothing on the geocoder while 仙台 resolves, so the
    // stripped form has to be attempted before re-expanding.
    const queries = candidateQueries("仙台市");

    expect(queries[0]).toBe("仙台");
    expect(queries).toContain("仙台市");
    expect(queries.at(-1)).toBe("仙台市村");
  });

  test("keeps both the stripped and original bases for a suffixed query", () => {
    const queries = candidateQueries("横浜市");

    expect(queries).toContain("横浜");
    expect(queries).toContain("横浜市");
  });

  test("does not walk the ladder for non-Japanese input", () => {
    // Appending 県 to "Tokyo" would only produce noise.
    expect(candidateQueries("Tokyo")).toEqual(["Tokyo"]);
    expect(candidateQueries("Cape Town")).toEqual(["Cape Town"]);
  });

  test("walks the ladder for kanji Chinese input", () => {
    // Kanji is shared with Japanese even though 上海 is not a Japanese place.
    expect(candidateQueries("上海").length).toBeGreaterThan(1);
  });

  test("trims surrounding whitespace", () => {
    expect(candidateQueries("  函館  ")[0]).toBe("函館");
  });

  test("never emits an empty or suffix-only query for a suffix-only input", () => {
    // Stripping 市 from 市 yields an empty string that matches nothing, so the
    // original form stays as the base and gets expanded instead.
    const queries = candidateQueries("市");

    expect(queries[0]).toBe("市");
    expect(queries.every((query) => query.length > 0)).toBe(true);
    expect(queries).toContain("市県");
  });
});

describe("queryTokens", () => {
  test("separates the place name from its filters", () => {
    // The API indexes one name per record, so 横浜市 神奈川 can never arrive
    // there intact: the split is what makes the documented query work.
    expect(queryTokens("横浜市 神奈川")).toEqual(["横浜市", "神奈川"]);
  });

  test("collapses every run of whitespace and trims the ends", () => {
    expect(queryTokens("  函館   北海道 ")).toEqual(["函館", "北海道"]);
    expect(queryTokens("　　　")).toEqual([]);
  });

  test("treats an ideographic space as a separator too", () => {
    // A Japanese keyboard produces U+3000 between two arguments often enough.
    expect(queryTokens("横浜市　神奈川")).toEqual(["横浜市", "神奈川"]);
  });

  test("keeps a single name in one token", () => {
    expect(queryTokens("函館市")).toEqual(["函館市"]);
  });
});

describe("matchesTokens", () => {
  test("reaches a prefecture spelled without its suffix", () => {
    // The caller writes 神奈川 while the index answers 神奈川県.
    const candidate = place({ name: "横浜市", admin1: "神奈川県" });

    expect(matchesTokens(candidate, ["神奈川"])).toBe(true);
  });

  test("reaches a place whose name dropped the suffix the filter kept", () => {
    const candidate = place({ name: "横浜", admin1: "神奈川県" });

    expect(matchesTokens(candidate, ["横浜市"])).toBe(true);
  });

  test("rejects a same named place in another prefecture", () => {
    const candidate = place({ name: "横浜", admin1: "福岡県" });

    expect(matchesTokens(candidate, ["神奈川"])).toBe(false);
  });

  test("matches against the country as well", () => {
    const candidate = place({
      name: "東京都",
      admin1: "東京都",
      country: "日本",
      country_code: "JP",
    });

    expect(matchesTokens(candidate, ["日本"])).toBe(true);
  });

  test("folds case for latin input", () => {
    expect(matchesTokens(place({ name: "Tokyo" }), ["tokyo"])).toBe(true);
  });

  test("requires every filter to match", () => {
    const candidate = place({ name: "横浜市", admin1: "神奈川県" });

    expect(matchesTokens(candidate, ["横浜市", "神奈川"])).toBe(true);
    expect(matchesTokens(candidate, ["横浜市", "青森"])).toBe(false);
  });

  test("keeps everything when there is nothing to filter by", () => {
    expect(matchesTokens(place({ name: "x" }), [])).toBe(true);
  });

  test("does not reach a place through its country code", () => {
    // The code behind `today Los Angeles` answering Lagos: "Angeles" contains
    // Lagos' `NG`, and the reverse direction asked the token to contain the
    // field rather than the other way round.
    const lagos = place({
      name: "ラゴス",
      country: "尼日利亚",
      country_code: "NG",
    });

    expect(matchesTokens(lagos, ["Angeles"])).toBe(false);
  });

  test("still narrows by an ISO country code", () => {
    const paris = place({
      name: "Paris",
      country: "France",
      country_code: "FR",
    });

    expect(matchesTokens(paris, ["fr"])).toBe(true);
    expect(matchesTokens(paris, ["France"])).toBe(true);
  });
});

describe("rankCandidates", () => {
  test("prefers a populated place over a park or station", () => {
    const ranked = rankCandidates([
      place({ id: 1, name: "函館市市民の森", feature_code: "PRK" }),
      place({
        id: 2,
        name: "函館市",
        feature_code: "PPLA2",
        population: 275730,
      }),
    ]);

    expect(ranked[0]?.name).toBe("函館市");
  });

  test("prefers the larger city over a same-named hamlet", () => {
    // The bare query 横浜 resolves to a 4,412 person hamlet in Aomori and
    // 横浜市 in Kanagawa only shows up once the suffix ladder adds it.
    const ranked = rankCandidates([
      place({
        id: 1,
        name: "横浜",
        feature_code: "PPL",
        admin1: "青森県",
        population: 4412,
      }),
      place({
        id: 2,
        name: "横浜市",
        feature_code: "PPLA",
        admin1: "神奈川県",
        population: 3777491,
      }),
    ]);

    expect(ranked[0]?.name).toBe("横浜市");
    expect(ranked[0]?.admin1).toBe("神奈川県");
  });

  test("ranks a capital above a same-named ordinary city", () => {
    const ranked = rankCandidates([
      place({
        id: 1,
        name: "ボーン",
        feature_code: "PPLA",
        population: 900000,
      }),
      place({ id: 2, name: "ボーン", feature_code: "PPLC", population: 100 }),
    ]);

    expect(ranked[0]?.feature_code).toBe("PPLC");
  });

  test("sorts a null population as zero instead of throwing", () => {
    // GeoNames leaves population null for many Japanese entries, so a null has
    // to compare as 0 rather than blow up or outrank every real figure.
    const ranked = rankCandidates([
      place({ id: 1, name: "松山市", feature_code: "PPL", population: null }),
      place({ id: 2, name: "松", feature_code: "PPL", population: 10 }),
    ]);

    expect(ranked.map((entry) => entry.name)).toEqual(["松", "松山市"]);
  });

  test("keeps population ahead of an exact name match", () => {
    // 高崎 exactly matches five results outside Gunma, all with a null
    // population, while 高崎市 holds the real 372,973. Population has to win or
    // the query lands in the wrong prefecture.
    const ranked = rankCandidates([
      place({ id: 1, name: "高崎", feature_code: "PPL", admin1: "新潟県" }),
      place({
        id: 2,
        name: "高崎市",
        feature_code: "PPLA2",
        admin1: "群馬県",
        population: 372973,
      }),
    ]);

    expect(ranked[0]?.name).toBe("高崎市");
  });

  test("keeps population ahead of the feature code", () => {
    // York, Nebraska is an admin seat and New York a plain PPL: the code used
    // to decide first, which handed `New York` a town of 7,864.
    const ranked = rankCandidates([
      place({ id: 1, name: "York", feature_code: "PPLA2", population: 7864 }),
      place({
        id: 2,
        name: "New York",
        feature_code: "PPL",
        population: 8804190,
      }),
    ]);

    expect(ranked[0]?.name).toBe("New York");
  });

  test("keeps a park below a populated place whatever the figures", () => {
    const ranked = rankCandidates([
      place({
        id: 1,
        name: "函館市市民の森",
        feature_code: "PRK",
        population: 999999,
      }),
      place({
        id: 2,
        name: "函館市",
        feature_code: "PPLA2",
        population: 275730,
      }),
    ]);

    expect(ranked[0]?.name).toBe("函館市");
  });

  test("does not mutate its input", () => {
    const input = [
      place({ id: 1, name: "b", feature_code: "PPL" }),
      place({ id: 2, name: "a", feature_code: "PPLC" }),
    ];
    const snapshot = input.map((entry) => entry.name);

    rankCandidates(input);

    expect(input.map((entry) => entry.name)).toEqual(snapshot);
  });

  test("returns an empty list unchanged", () => {
    expect(rankCandidates([])).toEqual([]);
  });
});

describe("placeLabel", () => {
  test("drops an admin1 that just repeats the name", () => {
    // 東京都 and 北海道 are both the name and the admin1 in the geocoder's
    // answer, and printing either twice reads like a mistake.
    expect(placeLabel(place({ name: "東京都", admin1: "東京都" }))).toBe(
      "東京都",
    );
    expect(placeLabel(place({ name: "北海道", admin1: "北海道" }))).toBe(
      "北海道",
    );
  });

  test("keeps an admin1 that adds something", () => {
    expect(placeLabel(place({ name: "横浜市", admin1: "神奈川県" }))).toBe(
      "横浜市 神奈川県",
    );
  });

  test("omits an admin1 that is missing or blank", () => {
    expect(placeLabel(place({ name: "函館市" }))).toBe("函館市");
    expect(placeLabel(place({ name: "函館市", admin1: "  " }))).toBe("函館市");
  });

  test("ignores surrounding whitespace before comparing", () => {
    expect(placeLabel(place({ name: " 東京都 ", admin1: "東京都" }))).toBe(
      "東京都",
    );
  });

  test("treats a case difference as the same word", () => {
    expect(placeLabel(place({ name: "Tokyo", admin1: "tokyo" }))).toBe("Tokyo");
  });
});

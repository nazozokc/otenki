import { describe, expect, test } from "bun:test";
import { fzfChoices, matchChoice } from "../src/locate.ts";
import type { GeocodeResult } from "../src/geocode.ts";

const place = (over: Partial<GeocodeResult>): GeocodeResult => ({
  id: 1,
  name: "横浜",
  latitude: 35.43333,
  longitude: 139.65,
  ...over,
});

const yokohama: GeocodeResult = place({
  id: 2,
  name: "横浜市",
  admin1: "神奈川県",
  country: "日本",
  feature_code: "PPLA",
  population: 3777491,
});

const aomori: GeocodeResult = place({
  id: 1,
  name: "横浜",
  admin1: "青森県",
  country: "日本",
  feature_code: "PPL",
  population: 4412,
  latitude: 41.08333,
  longitude: 141.25,
});

describe("fzfChoices", () => {
  test("preserves candidate order so an index maps back", () => {
    expect(fzfChoices([yokohama, aomori])).toHaveLength(2);
    expect(fzfChoices([yokohama, aomori])[0]).toContain("横浜市");
  });

  test("renders coordinates at five decimals", () => {
    expect(fzfChoices([yokohama])[0]).toContain("35.43333,139.65000");
  });

  test("omits admin fields the geocoder left out", () => {
    const sparse = place({
      name: "無名",
      admin1: undefined,
      country: undefined,
      latitude: 0,
      longitude: 0,
    });
    const line = fzfChoices([sparse])[0] ?? "";

    expect(line).toBe("無名    0.00000,0.00000");
  });

  test("returns nothing for no candidates", () => {
    expect(fzfChoices([])).toEqual([]);
  });
});

describe("matchChoice", () => {
  test("maps the selected line back to its place", () => {
    const places = [yokohama, aomori];

    expect(matchChoice(places, fzfChoices(places)[1] ?? "")?.admin1).toBe(
      "青森県",
    );
    expect(matchChoice(places, fzfChoices(places)[0] ?? "")?.admin1).toBe(
      "神奈川県",
    );
  });

  test("tolerates the trailing newline fzf emits", () => {
    const places = [yokohama, aomori];
    const line = fzfChoices(places)[1] ?? "";

    expect(matchChoice(places, `${line}\n`)).toBeDefined();
  });

  test("returns undefined when the caller cancels", () => {
    expect(matchChoice([yokohama, aomori], "")).toBeUndefined();
    expect(matchChoice([yokohama, aomori], "   ")).toBeUndefined();
  });

  test("returns undefined for output that is not one of the lines", () => {
    expect(matchChoice([yokohama], "somewhere else")).toBeUndefined();
  });
});
import { describe, expect, test } from "bun:test";
import { jsonPayload } from "../src/locate.ts";

const yokohama = { name: "横浜市", admin1: "神奈川県" };
const aomori = { name: "横浜", admin1: "青森県" };
const places = [yokohama, aomori];

describe("jsonPayload", () => {
  test("answers with the best candidate by default", () => {
    expect(jsonPayload({}, places, aomori)).toBe(aomori);
  });

  test("answers with the whole list when --all is given", () => {
    expect(jsonPayload({ all: true }, places, aomori)).toBe(places);
  });

  test("answers with the interactive choice when --pick is given", () => {
    expect(jsonPayload({ pick: true }, places, aomori)).toBe(aomori);
  });

  test("never lets --all discard an interactive choice", () => {
    // The bug: `--all --pick --json` printed every candidate and dropped the
    // one the person at the keyboard had just picked.
    expect(jsonPayload({ all: true, pick: true }, places, yokohama)).toBe(
      yokohama,
    );
  });
});

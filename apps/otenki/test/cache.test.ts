import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cachedGeocode, clearCache } from "../src/cache.ts";

const stateHome = mkdtempSync(join(tmpdir(), "otenki-cache-"));
const stateDir = join(stateHome, "otenki");
const cacheFile = join(stateDir, "places.json");
const originalXdg = process.env.XDG_STATE_HOME;

beforeAll(() => {
  process.env.XDG_STATE_HOME = stateHome;
  mkdirSync(stateDir, { recursive: true });
});

afterAll(() => {
  if (originalXdg === undefined) delete process.env.XDG_STATE_HOME;
  else process.env.XDG_STATE_HOME = originalXdg;
  rmSync(stateHome, { recursive: true, force: true });
});

beforeEach(() => {
  writeFileSync(cacheFile, "{}");
});

const place = {
  id: 1,
  name: "函館市",
  latitude: 41.77583,
  longitude: 140.73666,
};

const entry = (results: unknown, savedAt = Date.now()): string =>
  JSON.stringify({ 函館: { savedAt, results } });

const fresh = async (): Promise<string[]> => {
  const seen: string[] = [];
  const results = await cachedGeocode("函館", async () => {
    seen.push("loaded");
    return [{ id: 2, name: "fresh", latitude: 0, longitude: 0 }];
  });
  expect(results.map((result) => result.name)).toContain("fresh");
  return seen;
};

describe("cachedGeocode", () => {
  test("serves a fresh entry without calling the loader", async () => {
    writeFileSync(cacheFile, entry([place]));

    let called = false;
    const results = await cachedGeocode("函館", async () => {
      called = true;
      return [];
    });

    expect(called).toBe(false);
    expect(results[0]?.name).toBe("函館市");
  });

  test("treats an expired entry as a miss", async () => {
    const stale = Date.now() - 31 * 24 * 60 * 60 * 1000;
    writeFileSync(cacheFile, entry([place], stale));

    expect(await fresh()).toEqual(["loaded"]);
  });

  test("treats a wrong-shaped entry as a miss instead of crashing", async () => {
    // name as a number: `localeCompare` and `toFixed` would throw downstream.
    writeFileSync(cacheFile, entry([{ ...place, name: 42 }]));

    expect(await fresh()).toEqual(["loaded"]);
  });

  test("treats non-numeric coordinates as a miss", async () => {
    writeFileSync(
      cacheFile,
      entry([{ ...place, latitude: "41.7", longitude: null }]),
    );

    expect(await fresh()).toEqual(["loaded"]);
  });

  test("treats a non-object entry and corrupt JSON as empty", async () => {
    writeFileSync(cacheFile, JSON.stringify({ 函館: "oops" }));
    expect(await fresh()).toEqual(["loaded"]);

    writeFileSync(cacheFile, "{not json");
    expect(await fresh()).toEqual(["loaded"]);

    writeFileSync(cacheFile, JSON.stringify([1, 2, 3]));
    expect(await fresh()).toEqual(["loaded"]);
  });

  test("keeps valid entries when a poisoned one is dropped", async () => {
    writeFileSync(
      cacheFile,
      JSON.stringify({
        函館: { savedAt: Date.now(), results: [place] },
        横浜: { savedAt: Date.now(), results: [{ name: 1 }] },
      }),
    );

    let called = false;
    await cachedGeocode("函館", async () => {
      called = true;
      return [];
    });

    expect(called).toBe(false);
  });
});

describe("clearCache", () => {
  test("empties the file", async () => {
    writeFileSync(cacheFile, entry([place]));

    await clearCache();

    expect(await Bun.file(cacheFile).json()).toEqual({});
  });
});

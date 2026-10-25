/**
 * Golden capture preload, run before the CLI entry point:
 *
 *   bun --preload rust/fixtures/capture/preload.ts apps/otenki/src/index.ts ...
 *
 * The CLI has two sources of nondeterminism the harness cannot getenv its way
 * around, and both are closed here rather than in the CLI itself so the fixture
 * env stays a test-only contract:
 *
 * - `OTENKI_NOW` freezes `Date.now` for the hourly window and the cache TTLs.
 * - `OTENKI_FIXTURE_DIR` + `OTENKI_FIXTURE_MODE` route every fetch through the
 *   recorded responses in `rust/fixtures/api`, hashing URLs to stable file
 *   names, so the same command gets the same answer today and in five years.
 *
 * With neither variable set the preload is inert and the CLI runs against the
 * real network, so `bun run start` keeps its natural behaviour.
 */

import { fixturePath, type Stored } from "./contracts.ts";

const NOT_SET = "OTENKI_FIXTURE_DIR is not set";

const fixtureDir = (): string => {
  const dir = process.env.OTENKI_FIXTURE_DIR;
  if (dir === undefined || dir === "") throw new Error(NOT_SET);
  return dir;
};

const mode = (): "record" | "replay" => {
  switch (process.env.OTENKI_FIXTURE_MODE) {
    case "record":
      return "record";
    case "replay":
    case undefined:
    case "":
      return "replay";
    default:
      throw new Error(
        `OTENKI_FIXTURE_MODE is invalid: '${process.env.OTENKI_FIXTURE_MODE}'`,
      );
  }
};

const store = async (path: string, stored: Stored): Promise<void> => {
  await Bun.write(path, JSON.stringify(stored, null, 2));
};

const load = async (path: string): Promise<Stored> => {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`fixture not found: ${path}`);
  }
  return (await file.json()) as Stored;
};

/** A Response the way the real network delivered the recorded body. */
const serve = (stored: Stored): Response => {
  const body = new Response(stored.body, {
    status: stored.status,
    headers: { "content-type": stored.contentType ?? "application/json" },
  });
  // `Response.prototype.json` would work as-is, but the CLI is supposed to be
  // looking at fresh bytes every time: a consumed body cannot be read twice,
  // and the retry path is exactly what a second read would exercise.
  return body.clone();
};

const realFetch = globalThis.fetch;

/**
 * `fetch` in record mode goes to the live endpoint and writes the response
 * down; a fetch that already has a fixture is served from it, so recording the
 * whole battery twice changes nothing.
 */
if (
  process.env.OTENKI_FIXTURE_DIR !== undefined &&
  process.env.OTENKI_FIXTURE_DIR !== ""
) {
  globalThis.fetch = async (
    input: URL | RequestInfo,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = input instanceof URL ? input : new URL(String(input));
    const path = fixturePath(fixtureDir(), url.href);
    const run = mode();

    if (await Bun.file(path).exists()) {
      const stored = await load(path);
      // A hand written network-error fixture stands in for a dead socket; the
      // rejection is what the retry ladder in the CLI actually catches, and
      // its message is what ends up on screen, so keep it the real one.
      if (stored.networkError === true)
        return Promise.reject(new TypeError("fetch failed"));
      return serve(stored);
    }

    // A recorded network error has no response to write down, so it left no
    // file: replay must refuse the URL instead of silently going live.
    if (run === "replay") {
      throw new Error(
        `fixture mode is replay but nothing is recorded for: ${url.href}`,
      );
    }

    const response = await realFetch(url, init);
    const text = await response.text();
    await store(path, {
      url: url.href,
      status: response.status,
      body: text,
      contentType: response.headers.get("content-type") ?? undefined,
    });
    return new Response(text, { status: response.status });
  };
}

/**
 * `OTENKI_NOW` freezes every `Date.now` the CLI makes, in process order: hourly
 * windows, cache TTL checks and cache writes all see the same instant.
 */
const frozen = process.env.OTENKI_NOW;
if (frozen !== undefined && frozen !== "") {
  const now = Number(frozen);
  if (!Number.isInteger(now) || now < 0) {
    throw new Error(`OTENKI_NOW is not an epoch in ms: '${frozen}'`);
  }
  Date.now = (): number => now;
}

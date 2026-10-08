import { afterEach, describe, expect, test } from "bun:test";
import { version } from "../src/version.ts";

const original = process.env.OTENKI_VERSION;

afterEach(() => {
  if (original === undefined) delete process.env.OTENKI_VERSION;
  else process.env.OTENKI_VERSION = original;
});

describe("version", () => {
  test("strips control sequences baked into OTENKI_VERSION", async () => {
    // The environment is outside this process's control the way argv is,
    // and `--version` prints the answer straight to the terminal.
    process.env.OTENKI_VERSION = "1.2.3\u001B]0;pwn\u0007";

    expect(await version()).toBe("1.2.3");
  });

  test("leaves a well formed baked version untouched", async () => {
    process.env.OTENKI_VERSION = "1.2.3-rc.1+build.5";

    expect(await version()).toBe("1.2.3-rc.1+build.5");
  });
});

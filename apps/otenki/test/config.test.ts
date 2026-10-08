import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  configPath,
  ConfigError,
  loadConfig,
  stripNoConfig,
} from "../src/config.ts";
import { setColorMode, styled } from "../src/style.ts";
import { withColor } from "./support.ts";

let dir: string;
let file: string;
const originalXdg = process.env.XDG_CONFIG_HOME;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "otenki-config-"));
  file = join(dir, "config.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalXdg;
  // The override is module state: leaking it would repaint every colour
  // assertion in the files that run after this one.
  setColorMode(undefined);
});

describe("loadConfig", () => {
  test("reads nothing when the file is missing", async () => {
    expect(await loadConfig(join(dir, "absent.json"))).toEqual({});
  });

  test("reads every key", async () => {
    writeFileSync(
      file,
      JSON.stringify({
        location: "函館",
        command: "weekly",
        color: "always",
        units: "imperial",
        days: 5,
      }),
    );

    expect(await loadConfig(file)).toEqual({
      location: "函館",
      command: "weekly",
      color: "always",
      units: "imperial",
      days: 5,
    });
  });

  test("reads a coordinate pair as a location", async () => {
    writeFileSync(file, JSON.stringify({ location: [35.69, 139.69] }));

    expect(await loadConfig(file)).toEqual({ location: [35.69, 139.69] });
  });

  test("names the file when the JSON does not parse", async () => {
    writeFileSync(file, "{not json");

    await expect(loadConfig(file)).rejects.toThrow(ConfigError);
    await expect(loadConfig(file)).rejects.toThrow(
      `config: ${file}: invalid JSON`,
    );
  });

  test("expects an object, not a bare value", async () => {
    for (const body of ["[]", "42", '"函館"', "null"]) {
      writeFileSync(file, body);
      await expect(loadConfig(file)).rejects.toThrow("expected a JSON object");
    }
  });

  test("rejects a key it does not know", async () => {
    // Silent acceptance would make a typo look like the CLI ignoring the config.
    writeFileSync(file, JSON.stringify({ colo: "always" }));

    await expect(loadConfig(file)).rejects.toThrow("unknown key 'colo'");
  });

  test("rejects values outside the allowed sets", async () => {
    writeFileSync(file, JSON.stringify({ color: "rainbow" }));
    await expect(loadConfig(file)).rejects.toThrow(
      "color must be auto, always or never",
    );

    writeFileSync(file, JSON.stringify({ units: "kelvin" }));
    await expect(loadConfig(file)).rejects.toThrow(
      "units must be metric or imperial",
    );
  });

  test("keeps days within the Forecast API's range", async () => {
    for (const days of [0, 17, 1.5, "5", null]) {
      writeFileSync(file, JSON.stringify({ days }));
      await expect(loadConfig(file)).rejects.toThrow(
        "days must be an integer from 1 to 16",
      );
    }

    writeFileSync(file, JSON.stringify({ days: 1 }));
    expect((await loadConfig(file)).days).toBe(1);
    writeFileSync(file, JSON.stringify({ days: 16 }));
    expect((await loadConfig(file)).days).toBe(16);
  });

  test("rejects a location that could not name a place", async () => {
    writeFileSync(file, JSON.stringify({ location: "  " }));
    await expect(loadConfig(file)).rejects.toThrow(
      "location must not be empty",
    );

    writeFileSync(file, JSON.stringify({ location: ["a", 1] }));
    await expect(loadConfig(file)).rejects.toThrow(
      "two finite numbers [latitude, longitude]",
    );

    writeFileSync(file, JSON.stringify({ location: [91, 0] }));
    await expect(loadConfig(file)).rejects.toThrow("location out of range");

    writeFileSync(file, JSON.stringify({ location: true }));
    await expect(loadConfig(file)).rejects.toThrow(
      "place name or [latitude, longitude]",
    );
  });

  test("rejects a command that is not a name", async () => {
    writeFileSync(file, JSON.stringify({ command: "" }));
    await expect(loadConfig(file)).rejects.toThrow(
      "command must be a non-empty string",
    );

    writeFileSync(file, JSON.stringify({ command: 7 }));
    await expect(loadConfig(file)).rejects.toThrow(
      "command must be a non-empty string",
    );
  });

  test("loads from the XDG location when no path is given", async () => {
    process.env.XDG_CONFIG_HOME = dir;
    mkdirSync(join(dir, "otenki"), { recursive: true });
    writeFileSync(join(dir, "otenki", "config.json"), '{"command":"today"}');

    expect(await loadConfig()).toEqual({ command: "today" });
  });
});

describe("configPath", () => {
  test("uses XDG_CONFIG_HOME when it is absolute", () => {
    process.env.XDG_CONFIG_HOME = dir;

    expect(configPath()).toBe(join(dir, "otenki", "config.json"));
  });

  test("ignores a relative XDG_CONFIG_HOME", () => {
    // The XDG spec says a relative value is to be ignored; following it would
    // read a config from wherever the process happened to start.
    process.env.XDG_CONFIG_HOME = "relative/config";

    expect(configPath()).toBe(
      join(homedir(), ".config", "otenki", "config.json"),
    );
  });

  test("falls back to the home config directory when unset", () => {
    delete process.env.XDG_CONFIG_HOME;

    expect(configPath()).toBe(
      join(homedir(), ".config", "otenki", "config.json"),
    );
  });
});

describe("stripNoConfig", () => {
  test("leaves arguments alone when the flag is absent", () => {
    expect(stripNoConfig([])).toEqual({ argv: [], noConfig: false });
    expect(stripNoConfig(["today", "横浜"])).toEqual({
      argv: ["today", "横浜"],
      noConfig: false,
    });
  });

  test("pulls the flag out wherever it sits", () => {
    expect(stripNoConfig(["--no-config"])).toEqual({
      argv: [],
      noConfig: true,
    });
    expect(stripNoConfig(["today", "横浜", "--no-config"])).toEqual({
      argv: ["today", "横浜"],
      noConfig: true,
    });
    expect(stripNoConfig(["--no-config", "weekly"])).toEqual({
      argv: ["weekly"],
      noConfig: true,
    });
  });

  test("keeps a place named --no-config after the literal marker", () => {
    expect(stripNoConfig(["--", "--no-config"])).toEqual({
      argv: ["--", "--no-config"],
      noConfig: false,
    });
    expect(stripNoConfig(["today", "--", "--no-config"])).toEqual({
      argv: ["today", "--", "--no-config"],
      noConfig: false,
    });
  });
});

describe("setColorMode", () => {
  test("always beats NO_COLOR", () => {
    withColor(false, () => {
      setColorMode("always");
      try {
        expect(styled()).toBe(true);
      } finally {
        setColorMode(undefined);
      }
    });
  });

  test("never beats a terminal", () => {
    withColor(true, () => {
      setColorMode("never");
      try {
        expect(styled()).toBe(false);
      } finally {
        setColorMode(undefined);
      }
    });
  });

  test("auto follows the detection it was given", () => {
    withColor(true, () => {
      setColorMode("auto");
      try {
        expect(styled()).toBe(true);
      } finally {
        setColorMode(undefined);
      }
    });
    withColor(false, () => {
      setColorMode("auto");
      try {
        expect(styled()).toBe(false);
      } finally {
        setColorMode(undefined);
      }
    });
  });
});

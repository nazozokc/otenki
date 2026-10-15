import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const runCliWithMalformedConfig = async (
  ...args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> => {
  const dir = mkdtempSync(join(tmpdir(), "otenki-cli-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, "otenki"));
  writeFileSync(join(dir, "otenki", "config.json"), "{not json");

  const child = Bun.spawn(
    [
      process.execPath,
      "run",
      new URL("../src/index.ts", import.meta.url).pathname,
      ...args,
    ],
    {
      env: { ...process.env, XDG_CONFIG_HOME: dir },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { code, stdout, stderr };
};

describe("CLI informational options with malformed config", () => {
  test("prints root help without reading the config", async () => {
    const result = await runCliWithMalformedConfig("--help");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage: otenki <command>");
    expect(result.stderr).not.toContain("invalid JSON");
  });

  test("still reports a malformed config for a normal command", async () => {
    const result = await runCliWithMalformedConfig("today", "函館");

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("invalid JSON");
  });

  test("prints the version without reading the config", async () => {
    const result = await runCliWithMalformedConfig("--version");

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect(result.stderr).not.toContain("invalid JSON");
  });

  test("also handles command-specific help and version", async () => {
    const help = await runCliWithMalformedConfig("today", "--help");
    const version = await runCliWithMalformedConfig("today", "--version");

    expect(help.code).toBe(0);
    expect(help.stdout).toContain("Usage: otenki today");
    expect(help.stderr).not.toContain("invalid JSON");
    expect(version.code).toBe(0);
    expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect(version.stderr).not.toContain("invalid JSON");
  });
});

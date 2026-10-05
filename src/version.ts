import { readFile } from "node:fs/promises";

type PackageJson = {
  version?: string;
};

const UNKNOWN = "0.0.0-unknown";

/**
 * OTENKI_VERSION wins because a bundled single-file build has no package.json
 * next to it to walk up to; the Nix build bakes the version in this way.
 */
export const version = async (): Promise<string> => {
  const baked = process.env.OTENKI_VERSION;
  if (baked !== undefined && baked !== "") return baked;

  try {
    const text = await readFile(
      new URL("../package.json", import.meta.url),
      "utf-8",
    );
    const parsed = JSON.parse(text) as PackageJson;

    return parsed.version ?? UNKNOWN;
  } catch {
    return UNKNOWN;
  }
};
import { readFile } from "node:fs/promises";
import { sanitizeText } from "./sanitize.ts";

type PackageJson = {
  version?: string;
};

const UNKNOWN = "0.0.0-unknown";

/**
 * OTENKI_VERSION wins because a bundled single-file build has no package.json
 * next to it to walk up to; the Nix build bakes the version in this way.
 *
 * The answer is printed straight to stdout, and an environment variable is
 * outside this process's control the same way argv is — `OTENKI_VERSION` can
 * carry an escape sequence that would redraw the terminal on `--version`. So
 * every path through here leaves with the same pass argv error messages get.
 */
export const version = async (): Promise<string> => {
  const baked = process.env.OTENKI_VERSION;
  if (baked !== undefined && baked !== "") return sanitizeText(baked);

  try {
    const text = await readFile(
      new URL("../package.json", import.meta.url),
      "utf-8",
    );
    const parsed = JSON.parse(text) as PackageJson;

    return sanitizeText(parsed.version ?? UNKNOWN);
  } catch {
    return UNKNOWN;
  }
};

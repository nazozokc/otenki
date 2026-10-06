import type { GeocodeResult } from "./geocode.ts";
import { sanitizeText } from "./sanitize.ts";

/**
 * Everything that talks to fzf: the one line per candidate it is shown, the
 * match that maps its answer back, and the process itself. The choice of
 * whether to ask at all stays with the command.
 */

const adminLine = (place: GeocodeResult): string =>
  [place.admin1, place.country]
    .filter((part) => part !== undefined && part !== "")
    .join(", ");

/** Exported for tests: one display line per candidate, in candidate order. */
export const fzfChoices = (places: GeocodeResult[]): string[] =>
  places.map(
    (place) =>
      `${place.name}  ${adminLine(place)}  ${place.latitude.toFixed(5)},${place.longitude.toFixed(5)}`,
  );

/**
 * Exported for tests. fzf echoes back the line it selected, so match on the
 * exact string rather than trusting that the order survived the round trip.
 * Returns undefined when the output matches nothing, including on cancel.
 */
export const matchChoice = (
  places: GeocodeResult[],
  output: string,
): GeocodeResult | undefined => {
  const selected = output.trim();
  if (selected === "") return undefined;

  const index = fzfChoices(places).indexOf(selected);
  return index === -1 ? undefined : places[index];
};

const hasFzf = async (): Promise<boolean> => {
  try {
    const child = Bun.spawn(["fzf", "--version"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    return (await child.exited) === 0;
  } catch {
    // Bun.spawn throws synchronously when the executable is not in PATH, so a
    // missing fzf arrives as an exception rather than as a non-zero exit, and
    // the exit code check above would never see it.
    return false;
  }
};

/**
 * Hands the candidates to fzf and returns the line the user highlighted.
 * Returns undefined on cancel so the caller can fall back to the best match,
 * and throws when fzf is missing, which is a setup problem rather than a
 * cancelation.
 */
export const pickFromFzf = async (
  query: string,
  places: GeocodeResult[],
): Promise<GeocodeResult | undefined> => {
  if (!(await hasFzf())) {
    throw new Error("fzf がインストールされていません");
  }

  const child = Bun.spawn(
    [
      "fzf",
      "--reverse",
      "--prompt",
      // The query is argv, not geocode output, so it needs its own pass.
      `${sanitizeText(query)} > `,
      "--height",
      "40%",
      "--info",
      "inline-right",
    ],
    {
      stdin: new TextEncoder().encode(fzfChoices(places).join("\n")),
      stdout: "pipe",
      stderr: "ignore",
    },
  );

  const output = await new Response(child.stdout).text();
  if ((await child.exited) !== 0) return undefined;

  return matchChoice(places, output);
};

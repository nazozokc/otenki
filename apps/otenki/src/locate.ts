import { formatCoordinate } from "./format.ts";
import { geocode, placeLabel, type GeocodeResult } from "./geocode.ts";
import { bold, dim, temperature } from "./style.ts";
import { renderTable, type Column } from "./table.ts";

const population = (place: GeocodeResult): string =>
  place.population === null || place.population === undefined
    ? dim("-")
    : `${place.population.toLocaleString("ja-JP")}人`;

const detail = (place: GeocodeResult): string =>
  [
    place.feature_code,
    place.admin1,
    place.country,
    place.elevation === undefined
      ? null
      : `標高${Math.round(place.elevation)}m`,
  ]
    .filter((part) => part !== null && part !== undefined && part !== "")
    .join(" · ");

/** Names and codes read left to right; the three measurements line up on the right. */
const COLUMNS: Column[] = [
  { header: "name" },
  { header: "admin1" },
  { header: "lat", align: "right" },
  { header: "lon", align: "right" },
  { header: "feature" },
  { header: "pop", align: "right" },
];

const renderPlaces = (places: GeocodeResult[]): string =>
  renderTable(
    COLUMNS,
    places.map((place) => [
      place.name,
      place.admin1 ?? "-",
      place.latitude.toFixed(5),
      place.longitude.toFixed(5),
      place.feature_code ?? "-",
      population(place),
    ]),
  );

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

/**
 * A bare name can match a dozen places: 横浜 exists in Aomori, Fukuoka and
 * Kumamoto as well as Kanagawa. The ranking picks the biggest, but when the
 * caller asks to choose, hand the list to fzf rather than guessing for them.
 */
const pickWithFzf = async (
  query: string,
  places: GeocodeResult[],
): Promise<GeocodeResult | undefined> => {
  const lines = fzfChoices(places);

  const child = Bun.spawn(
    [
      "fzf",
      "--reverse",
      "--prompt",
      `${query} > `,
      "--height",
      "40%",
      "--info",
      "inline-right",
    ],
    {
      stdin: new TextEncoder().encode(lines.join("\n")),
      stdout: "pipe",
      stderr: "ignore",
    },
  );

  const output = await new Response(child.stdout).text();
  if ((await child.exited) !== 0) return undefined;

  return matchChoice(places, output);
};

const hasFzf = async (): Promise<boolean> => {
  const child = Bun.spawn(["fzf", "--version"], {
    stdout: "ignore",
    stderr: "ignore",
  });
  return (await child.exited) === 0;
};

export const locate = async (
  args: string[],
  options: { json?: boolean; all?: boolean; pick?: boolean },
): Promise<void> => {
  const query = args.join(" ").trim();
  if (query === "") {
    throw new Error("場所が指定されていません。地名を入力してください");
  }

  const places = await geocode(query);
  const best = places[0];
  if (best === undefined) {
    throw new Error(`"${query}" の場所が見つかりませんでした`);
  }

  let chosen = best;
  if (options.pick === true && places.length > 1) {
    if (!(await hasFzf())) {
      throw new Error("fzf がインストールされていません");
    }

    const picked = await pickWithFzf(query, places);
    // A cancelled fzf exits non-zero; fall back to the best match rather than
    // failing, so Ctrl-C still yields an answer.
    chosen = picked ?? best;
  }

  if (options.json === true) {
    console.log(
      JSON.stringify(options.all === true ? places : chosen, null, 2),
    );
    return;
  }

  console.log(bold(placeLabel(chosen)));
  console.log(temperature(formatCoordinate(chosen.latitude, chosen.longitude)));
  console.log(dim(detail(chosen)));

  if (options.all === true && places.length > 1) {
    console.log("");
    console.log(renderPlaces(places));
  }
};

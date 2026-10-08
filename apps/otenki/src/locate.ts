import { pickFromFzf } from "./fzf.ts";
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
  { header: "地名" },
  { header: "都道府県" },
  { header: "緯度", align: "right" },
  { header: "経度", align: "right" },
  { header: "種別" },
  { header: "人口", align: "right" },
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

/**
 * What `--json` prints. `--all` swaps the single best answer for the candidate
 * list, but an interactive choice is the caller's own answer and outranks it:
 * without that, `--all --pick --json` would hand back every candidate and drop
 * the one the person at the keyboard just picked.
 */
export const jsonPayload = <T>(
  options: { all?: boolean; pick?: boolean },
  places: readonly T[],
  chosen: T,
): T | readonly T[] =>
  options.pick === true ? chosen : options.all === true ? places : chosen;

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
  // A bare name can match a dozen places: 横浜 exists in Aomori, Fukuoka and
  // Kumamoto as well as Kanagawa. The ranking picks the biggest, but when the
  // caller asks to choose, hand the list to fzf rather than guessing for them.
  if (options.pick === true && places.length > 1) {
    const picked = await pickFromFzf(query, places);
    // A cancelled fzf exits non-zero; fall back to the best match rather than
    // failing, so Ctrl-C still yields an answer.
    chosen = picked ?? best;
  }

  if (options.json === true) {
    console.log(JSON.stringify(jsonPayload(options, places, chosen), null, 2));
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

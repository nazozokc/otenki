import type { Config, Units } from "./config.ts";
import { weatherCell } from "./daily.ts";
import {
  formatDateTime,
  formatPrecipitation,
  formatPrecipitationProbability,
  formatTemperature,
  formatWindSpeed,
} from "./format.ts";
import { fetchHourly, type HourlyWeather } from "./forecast.ts";
import { resolveLocation } from "./location.ts";
import { bold, dim, temperature, wet } from "./style.ts";
import { renderTable, type Column } from "./table.ts";

/**
 * The same shape as the daily table: the time on the left, the weather beside
 * it, then the numbers a reader compares, right aligned so their digits stack.
 * The icon rides inside the weather column rather than owning one of its own.
 */
const COLUMNS: Column[] = [
  { header: "日時" },
  { header: "天気" },
  { header: "気温", align: "right" },
  { header: "降水", align: "right" },
  { header: "確率", align: "right" },
  { header: "風速", align: "right" },
];

const renderInterval = (hours: HourlyWeather[], units: Units): string =>
  renderTable(
    COLUMNS,
    hours.map((hour, index) => [
      // Row 0 is the current hour: the bold time marks where the window opens.
      index === 0 ? bold(formatDateTime(hour.time)) : formatDateTime(hour.time),
      weatherCell(hour.weatherCode),
      temperature(formatTemperature(hour.temperature, units)),
      wet(formatPrecipitation(hour.precipitation, units)),
      wet(formatPrecipitationProbability(hour.precipitationProbability)),
      formatWindSpeed(hour.windSpeed, units),
    ]),
  );

/**
 * The next 24 hours sampled every `interval` hours, one row per step. The
 * window is fixed at a day, so a larger step just means fewer rows: `24h`
 * reports the single hour a day out.
 */
export const every = async (
  args: string[],
  options: { json?: boolean },
  config: Config = {},
  interval: number,
): Promise<void> => {
  const units = config.units ?? "metric";
  const location = await resolveLocation(args);
  const hours = await fetchHourly(location.latitude, location.longitude, units);
  const sampled = hours.filter((_, index) => index % interval === 0);

  if (options.json === true) {
    console.log(JSON.stringify({ location, hours: sampled }, null, 2));
    return;
  }

  // Counted from the rows the API actually supplied, the way the daily heading
  // counts its days, so a short answer never overclaims.
  console.log(
    `${bold(location.label)} ${dim(`— ${interval}時間おき（${sampled.length}件）`)}`,
  );
  console.log(renderInterval(sampled, units));
};

import type { Config, Units } from "./config.ts";
import {
  formatDay,
  formatPrecipitation,
  formatPrecipitationProbability,
  formatTemperature,
  formatTemperatureRange,
  formatWindSpeed,
} from "./format.ts";
import { fetchDaily, type DailyWeather } from "./forecast.ts";
import { resolveLocation } from "./location.ts";
import { bold, dim, heavy, temperature, thunder, wet } from "./style.ts";
import { renderTable, type Column } from "./table.ts";
import { weatherIcon } from "./weather.icon.ts";
import { weatherSeverity, weatherLabel } from "./weather.label.ts";

/**
 * The icon rides inside the weather column rather than keeping one of its own:
 * a whole column for a two-cell glyph buys nothing and adds an alignment the
 * renderer can get wrong. Temperatures are split into the two numbers a table
 * exists to compare, so each column can be right aligned down to its decimal
 * point instead of carrying a `~` range as one opaque cell.
 */
const COLUMNS: Column[] = [
  { header: "日付" },
  { header: "天気" },
  { header: "最低", align: "right" },
  { header: "最高", align: "right" },
  { header: "降水", align: "right" },
  { header: "確率", align: "right" },
  { header: "風速", align: "right" },
];

/** The one cell whose colour carries meaning about the day itself. */
const weatherCell = (weatherCode: number): string => {
  const text = `${weatherIcon(weatherCode)} ${weatherLabel(weatherCode)}`;

  switch (weatherSeverity(weatherCode)) {
    case "thunder":
      return thunder(text);
    case "heavy":
      return heavy(text);
    default:
      return text;
  }
};

const renderForecast = (days: DailyWeather[], units: Units): string =>
  renderTable(
    COLUMNS,
    days.map((day, index) => [
      // Row 0 is today on both `weekly` and `fortnight`: the bold date marks
      // where the forecast starts reading from.
      index === 0 ? bold(formatDay(day.time)) : formatDay(day.time),
      weatherCell(day.weatherCode),
      formatTemperature(day.temperatureMin, units),
      temperature(formatTemperature(day.temperatureMax, units)),
      wet(formatPrecipitation(day.precipitationSum, units)),
      wet(formatPrecipitationProbability(day.precipitationProbabilityMax)),
      formatWindSpeed(day.windSpeedMax, units),
    ]),
  );

/** `tomorrow` reports the second forecast day; day 0 is today. */
export const tomorrow = async (
  args: string[],
  options: { json?: boolean },
  config: Config = {},
): Promise<void> => {
  const units = config.units ?? "metric";
  const location = await resolveLocation(args);
  const days = await fetchDaily(
    location.latitude,
    location.longitude,
    2,
    units,
  );
  const day = days[1] ?? days[0];

  if (day === undefined) {
    throw new Error("明日の予報を取得できませんでした");
  }

  if (options.json === true) {
    console.log(JSON.stringify({ location, ...day }, null, 2));
    return;
  }

  // The same three levels as `today`: place, reading, supporting facts.
  console.log(bold(location.label));
  console.log(
    `${weatherIcon(day.weatherCode)} ${weatherLabel(day.weatherCode)}  ${temperature(formatTemperatureRange(day.temperatureMin, day.temperatureMax, units))}`,
  );
  console.log(
    dim(
      `${formatDay(day.time)} · 降水 ${formatPrecipitation(day.precipitationSum, units)}（確率 ${formatPrecipitationProbability(day.precipitationProbabilityMax)}） · 風 ${formatWindSpeed(day.windSpeedMax, units)}`,
    ),
  );
};

export const weekly = async (
  args: string[],
  options: { json?: boolean },
  config: Config = {},
): Promise<void> => {
  const units = config.units ?? "metric";
  const location = await resolveLocation(args);
  const days = await fetchDaily(
    location.latitude,
    location.longitude,
    config.days ?? 7,
    units,
  );

  if (options.json === true) {
    console.log(JSON.stringify({ location, days }, null, 2));
    return;
  }

  // Counted from what came back, not from the name of the command: the API
  // may return fewer days than were asked for, and a heading that lies about
  // the rows below it is worse than one that looks odd.
  console.log(`${bold(location.label)} ${dim(`— ${days.length}日間予報`)}`);
  console.log(renderForecast(days, units));
};

/** Two weeks, kept under the Forecast API's ceiling of 16 forecast days. */
export const fortnight = async (
  args: string[],
  options: { json?: boolean },
  config: Config = {},
): Promise<void> => {
  const units = config.units ?? "metric";
  const location = await resolveLocation(args);
  const days = await fetchDaily(
    location.latitude,
    location.longitude,
    config.days ?? 14,
    units,
  );

  if (options.json === true) {
    console.log(JSON.stringify({ location, days }, null, 2));
    return;
  }

  console.log(`${bold(location.label)} ${dim(`— ${days.length}日間予報`)}`);
  console.log(renderForecast(days, units));
};

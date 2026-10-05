import {
  formatDay,
  formatPrecipitation,
  formatPrecipitationProbability,
  formatTemperatureRange,
  formatWindSpeed,
} from "./format.ts";
import {
  fetchDaily,
  MAX_FORECAST_DAYS,
  type DailyWeather,
} from "./forecast.ts";
import { resolveLocation } from "./location.ts";
import { bold, dim, temperature } from "./style.ts";
import { renderTable, type Column } from "./table.ts";
import { weatherIcon } from "./weather.icon.ts";
import { weatherLabel } from "./weather.label.ts";

/** Every measurement is a number, so every column but the first three is right aligned. */
const COLUMNS: Column[] = [
  { header: "date" },
  { header: "icon" },
  { header: "weather" },
  { header: "temp", align: "right" },
  { header: "precip", align: "right" },
  { header: "prob", align: "right" },
  { header: "wind", align: "right" },
];

const renderForecast = (days: DailyWeather[]): string =>
  renderTable(
    COLUMNS,
    days.map((day) => [
      formatDay(day.time),
      weatherIcon(day.weatherCode),
      weatherLabel(day.weatherCode),
      temperature(
        formatTemperatureRange(day.temperatureMin, day.temperatureMax),
      ),
      formatPrecipitation(day.precipitationSum),
      formatPrecipitationProbability(day.precipitationProbabilityMax),
      formatWindSpeed(day.windSpeedMax),
    ]),
  );

/** `tomorrow` reports the second forecast day; day 0 is today. */
export const tomorrow = async (
  args: string[],
  options: { json?: boolean },
): Promise<void> => {
  const location = await resolveLocation(args);
  const days = await fetchDaily(location.latitude, location.longitude, 2);
  const day = days[1] ?? days[0];

  if (day === undefined) {
    throw new Error("明日の予報を取得できませんでした");
  }

  if (options.json === true) {
    console.log(JSON.stringify({ location, ...day }, null, 2));
    return;
  }

  console.log(
    `${weatherIcon(day.weatherCode)} ${temperature(formatTemperatureRange(day.temperatureMin, day.temperatureMax))}  ${bold(location.label)}`,
  );
  console.log(
    dim(
      `${formatDay(day.time)} · ${weatherLabel(day.weatherCode)} · 降水 ${formatPrecipitation(day.precipitationSum)} (確率 ${formatPrecipitationProbability(day.precipitationProbabilityMax)}) · 風 ${formatWindSpeed(day.windSpeedMax)}`,
    ),
  );
};

export const weekly = async (
  args: string[],
  options: { json?: boolean },
): Promise<void> => {
  const location = await resolveLocation(args);
  const days = await fetchDaily(location.latitude, location.longitude, 7);

  if (options.json === true) {
    console.log(JSON.stringify({ location, days }, null, 2));
    return;
  }

  console.log(`${bold(location.label)} ${dim("— 7日間予報")}`);
  console.log(renderForecast(days));
};

export const monthly = async (
  args: string[],
  options: { json?: boolean },
): Promise<void> => {
  const location = await resolveLocation(args);
  const days = await fetchDaily(
    location.latitude,
    location.longitude,
    MAX_FORECAST_DAYS,
  );

  if (options.json === true) {
    console.log(JSON.stringify({ location, days }, null, 2));
    return;
  }

  // A month is not reachable: the Forecast API refuses forecast_days above 16.
  console.log(
    `${bold(location.label)} ${dim(`— ${days.length}日間予報 (API上限 ${MAX_FORECAST_DAYS}日)`)}`,
  );
  console.log(renderForecast(days));
};

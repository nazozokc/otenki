import Table from "cli-table3";
import {
  formatDateTime,
  formatHumidity,
  formatPrecipitation,
  formatTemperature,
  formatWindSpeed,
} from "./format.ts";
import { fetchCurrent } from "./forecast.ts";
import { resolveLocation } from "./location.ts";
import { bold, dim, heading, temperature } from "./style.ts";
import { weatherIcon } from "./weather.icon.ts";
import { weatherLabel } from "./weather.label.ts";

export const today = async (
  args: string[],
  options: { json?: boolean },
): Promise<void> => {
  const location = await resolveLocation(args);
  const current = await fetchCurrent(location.latitude, location.longitude);

  if (options.json === true) {
    console.log(JSON.stringify({ location, ...current }, null, 2));
    return;
  }

  console.log(
    `${weatherIcon(current.weatherCode)} ${temperature(formatTemperature(current.temperature))}  ${bold(location.label)}`,
  );
  console.log(
    dim(
      `${formatDateTime(current.time)} · 体感 ${formatTemperature(current.apparentTemperature)} · 風 ${formatWindSpeed(current.windSpeed)} · 湿度 ${formatHumidity(current.humidity)} · 降水 ${formatPrecipitation(current.precipitation)}`,
    ),
  );

  const table = new Table({
    head: ["time", "temp", "weather", "wind_speed"].map(heading),
  });

  table.push([
    current.time,
    formatTemperature(current.temperature),
    `${weatherIcon(current.weatherCode)} ${weatherLabel(current.weatherCode)}`,
    formatWindSpeed(current.windSpeed),
  ]);

  console.log(table.toString());
};
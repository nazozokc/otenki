import {
  formatDateTime,
  formatHumidity,
  formatPrecipitation,
  formatTemperature,
  formatWindSpeed,
} from "./format.ts";
import { fetchCurrent } from "./forecast.ts";
import { resolveLocation } from "./location.ts";
import { bold, dim, temperature } from "./style.ts";
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
  // One line per fact group rather than a table: a single row of `time`,
  // `temp`, `weather` and `wind_speed` repeated what the two lines above
  // already said, and two screens of box drawing for four numbers is a bad
  // trade in a terminal.
  console.log(
    dim(
      `${formatDateTime(current.time)} · ${weatherLabel(current.weatherCode)} · 体感 ${formatTemperature(current.apparentTemperature)} · 風 ${formatWindSpeed(current.windSpeed)} · 湿度 ${formatHumidity(current.humidity)} · 降水 ${formatPrecipitation(current.precipitation)}`,
    ),
  );
};

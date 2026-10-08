import type { Config } from "./config.ts";
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
  config: Config = {},
): Promise<void> => {
  const units = config.units ?? "metric";
  const location = await resolveLocation(args);
  const current = await fetchCurrent(
    location.latitude,
    location.longitude,
    units,
  );

  if (options.json === true) {
    console.log(JSON.stringify({ location, ...current }, null, 2));
    return;
  }

  // Three lines, one level each: the place to look first, the reading it is
  // about, then the supporting facts. A table would spend two lines of box
  // drawing on four numbers, and the old single `·`-joined line made the
  // reader weigh all six facts at once.
  console.log(bold(location.label));
  console.log(
    `${weatherIcon(current.weatherCode)} ${weatherLabel(current.weatherCode)}  ${temperature(formatTemperature(current.temperature, units))}  ${dim(`体感 ${formatTemperature(current.apparentTemperature, units)}`)}`,
  );
  console.log(
    dim(
      `風 ${formatWindSpeed(current.windSpeed, units)} · 湿度 ${formatHumidity(current.humidity)} · 降水 ${formatPrecipitation(current.precipitation, units)} · ${formatDateTime(current.time)}`,
    ),
  );
};

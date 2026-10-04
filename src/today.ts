import Table from "cli-table3";
import { weatherIcon } from "./weather.icon.ts";

type WeatherData = {
  daily: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
  };
};

export const today = async (Ido: number, Keido: number): Promise<void> => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${Ido}&longitude=${Keido}&current=temperature_2m,weather_code,wind_speed_10m&timezone=Asia%2FTokyo`,
  );

  const data = (await response.json()) as WeatherData;

  const table = new Table({
    head: ["temp", "weather"],
  });

  table.push([
    `${data.daily.temperature_2m_min[0]}°C ~ ${data.daily.temperature_2m_max[0]}°C`,
    weatherIcon(data.daily.weather_code[0]!),
  ]);

  console.log(table.toString());
};

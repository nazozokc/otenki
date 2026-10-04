import Table from "cli-table3";
import { weatherIcon } from "./weather.icon.ts";

type WeatherData = {
  current: {
    temperature_2m: number;
    weather_code: number;
    wind_speed_10m: number;
    time: string;
  };
};

export const today = async (Ido: number, Keido: number): Promise<void> => {
  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${Ido}&longitude=${Keido}&current=temperature_2m,weather_code,wind_speed_10m&timezone=Asia%2FTokyo`,
  );

  const data = (await response.json()) as WeatherData;

  const table = new Table({
    head: ["time", "temp", "weather", "wind_speed"],
  });

  table.push([
    data.current.time,
    `${data.current.temperature_2m}°C`,
    weatherIcon(data.current.weather_code),
    `${data.current.wind_speed_10m} km/h`,
  ]);

  console.log(table.toString());
};

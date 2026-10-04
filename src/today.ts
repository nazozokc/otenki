import Table from "cli-table3";
import { weatherIcon } from "./weather.icon.ts";

export const today = async (Ido: number, Keido: number): Promise<void> => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate() + 1;
  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${Ido}&longitude=${Keido}&start_date=${year}-${month}-${day}&end_date=${year}-${month}-${day}&daily=temperature_2m_max,temperature_2m_min,weather_code`,
  );

  const data = await response.json();

  const table = new Table({
    head: ["temp", "weather", "wind_speed"],
  });

  table.push([
    data.current.temperature_2m,
    weatherIcon(data.current.weather_code),
    data.current.wind_speed_10m,
  ]);

  console.log(table.toString());
};

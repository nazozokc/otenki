import { geocodeOne, placeLabel } from "./geocode.ts";

export class LocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocationError";
  }
}

export type Location = {
  latitude: number;
  longitude: number;
  /** Human readable origin, either the place name or the raw coordinates. */
  label: string;
};

const NUMBER = /^[+-]?\d+(?:\.\d+)?$/;

const isNumber = (value: string | undefined): value is string =>
  value !== undefined && NUMBER.test(value);

/**
 * Accepts either a coordinate pair (`41.77 140.73`, `41.77,140.73`) or a place
 * name (`函館`, `横浜市 神奈川`). A lone number is rejected: `otenki today 41`
 * is far more likely a typo than a latitude.
 */
export const resolveLocation = async (args: string[]): Promise<Location> => {
  const query = args.join(" ").trim();

  if (args.length === 1 && args[0]?.includes(",") === true) {
    const [latitude, longitude] = args[0].split(",");
    if (isNumber(latitude) && isNumber(longitude)) {
      return {
        latitude: Number(latitude),
        longitude: Number(longitude),
        label: `${latitude}, ${longitude}`,
      };
    }
  }

  if (args.length === 2 && isNumber(args[0]) && isNumber(args[1])) {
    const [latitude, longitude] = args as [string, string];
    return {
      latitude: Number(latitude),
      longitude: Number(longitude),
      label: `${latitude}, ${longitude}`,
    };
  }

  if (query === "") {
    throw new LocationError(
      "場所が指定されていません。地名または緯度経度を指定してください",
    );
  }

  if (args.every((arg) => NUMBER.test(arg))) {
    throw new LocationError(
      `座標の指定が不正です: ${query}（緯度と経度を2つ指定してください）`,
    );
  }

  const place = await geocodeOne(query);
  return {
    latitude: place.latitude,
    longitude: place.longitude,
    label: placeLabel(place),
  };
};

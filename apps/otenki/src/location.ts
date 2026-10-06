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

/**
 * A coordinate pair with any spacing around the separator, checked on the
 * arguments once they are joined: `41.77 140.73`, `41.77,140.73`,
 * `41.77, 140.73`, even `41.77 ,140.73` are all the same two numbers, and
 * however the shell split them should not change the answer. A lone number
 * never matches, so `otenki today 41` still reaches the error below.
 */
const COORD_PAIR = /^([+-]?\d+(?:\.\d+)?)\s*[,\s]\s*([+-]?\d+(?:\.\d+)?)$/;

/**
 * Accepts either a coordinate pair (`41.77 140.73`, `41.77,140.73`) or a place
 * name (`函館`, `横浜市 神奈川`). A lone number is rejected: `otenki today 41`
 * is far more likely a typo than a latitude.
 */
export const resolveLocation = async (args: string[]): Promise<Location> => {
  const query = args.join(" ").trim();

  const coordinates = COORD_PAIR.exec(query);
  const latitude = coordinates?.[1];
  const longitude = coordinates?.[2];

  if (latitude !== undefined && longitude !== undefined) {
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

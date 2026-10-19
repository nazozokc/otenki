/**
 * Select and format the next hourly window independently from the API
 * transport. Open-Meteo's ISO timestamps use one fixed offset for the whole
 * response, so Unix timestamps are needed to cross DST transitions correctly.
 */
export const hourlyWindow = (
  times: readonly (string | number)[],
  now: number,
  timezone: string | undefined,
  offsetSeconds: number | undefined,
  length: number,
): { index: number; time: string }[] => {
  const from = Math.floor(now / 3_600_000) * 3_600_000;
  const localFrom = new Date(from + (offsetSeconds ?? 0) * 1000)
    .toISOString()
    .slice(0, 13);
  const start = times.findIndex((time) =>
    typeof time === "number" ? time * 1000 >= from : time >= localFrom,
  );

  if (start === -1) return [];

  return times.slice(start, start + length).flatMap((timestamp, offset) => {
    const index = start + offset;
    if (typeof timestamp === "string") return [{ index, time: timestamp }];
    if (!Number.isFinite(timestamp)) return [];

    const date = new Date(timestamp * 1000);
    if (timezone === undefined) {
      // Older or mocked API responses may omit the zone. Preserve fixed-offset
      // rendering rather than failing the forecast.
      return [
        {
          index,
          time: new Date(date.getTime() + (offsetSeconds ?? 0) * 1000)
            .toISOString()
            .slice(0, 16),
        },
      ];
    }

    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const values = Object.fromEntries(
      parts.map(({ type, value }) => [type, value]),
    );
    return [
      {
        index,
        time: `${values.year}-${values.month}-${values.day}T${values.hour}:00`,
      },
    ];
  });
};

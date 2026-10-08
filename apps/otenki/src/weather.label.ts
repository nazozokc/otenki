/** WMO 4677 weather interpretation codes, as documented by Open-Meteo. */
const LABELS: Record<number, string> = {
  0: "快晴",
  1: "晴れ",
  2: "晴れ時々くもり",
  3: "曇り",
  45: "霧",
  48: "霧氷",
  51: "弱い霧雨",
  53: "霧雨",
  55: "強い霧雨",
  56: "着氷性の霧雨",
  57: "強い着氷性の霧雨",
  61: "弱い雨",
  63: "雨",
  65: "大雨",
  66: "着氷性の雨",
  67: "強い着氷性の雨",
  71: "弱い雪",
  73: "雪",
  75: "大雪",
  77: "霧雪",
  80: "にわか雨",
  81: "強いにわか雨",
  82: "激しいにわか雨",
  85: "にわか雪",
  86: "強いにわか雪",
  95: "雷雨",
  96: "雷雨と弱い雹",
  97: "激しい雷雨",
  99: "雷雨と強い雹",
};

export const weatherLabel = (weatherCode: number): string =>
  LABELS[weatherCode] ?? "不明";

const THUNDER_CODES = [95, 96, 97, 99];
const HEAVY_CODES = [65, 66, 67, 75, 82, 86];

export type Severity = "thunder" | "heavy";

/**
 * Which codes deserve a raised voice: thunderstorms read magenta, heavy rain
 * and heavy snow read bold red, everything else stays plain. The codes live
 * next to the labels so a renderer never has to look them up twice.
 */
export const weatherSeverity = (weatherCode: number): Severity | null => {
  if (THUNDER_CODES.includes(weatherCode)) return "thunder";
  if (HEAVY_CODES.includes(weatherCode)) return "heavy";
  return null;
};

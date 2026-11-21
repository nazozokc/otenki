import type { ColorMode, ThemeMode } from "./config.ts";

/**
 * Minimal ANSI styling. `NO_COLOR` and a non-TTY stdout both disable colour, and
 * every helper returns plain text in that case, so callers never have to care.
 *
 * The palette is the terminal's own ANSI colours rather than fixed RGB. That is
 * deliberate: the same code means a light shade on a dark theme and a dark
 * shade on a light one, so one set of helpers stays readable in both. The 3x
 * codes are for light backgrounds and the 9x (bright) codes for dark ones — a
 * plain blue or yellow on black is a classic unreadable pairing. `theme` in the
 * config pins the choice when the terminal does not report its background.
 *
 * Colour is never the only signal: every coloured cell also says what it is in
 * words (`降水`, `雷雨`, `✗`), so the output survives greyscale and colour-blind
 * readers. See https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum
 * and https://jfly.uni-koeln.de/color for the reasoning.
 */

/**
 * The config's `color` key, when it says `always` or `never`, beats both the
 * TTY detection and `NO_COLOR`: an explicit choice in the file is the one
 * thing a detection heuristic should not override. `auto` and no key at all
 * fall back to the detection below.
 */
let colorOverride: ColorMode | undefined;

export const setColorMode = (mode: ColorMode | undefined): void => {
  colorOverride = mode === "auto" ? undefined : mode;
};

/** `auto` and no key both mean "detect", so only explicit themes are stored. */
let themeOverride: "dark" | "light" | undefined;

export const setTheme = (mode: ThemeMode | undefined): void => {
  themeOverride = mode === "auto" ? undefined : mode;
};

/**
 * `COLORFGBG` is `foreground;background` (e.g. `15;0` in a dark terminal).
 * Only terminals that publish it can be detected; most do not, and a dark
 * terminal is the common case, so that is the fallback. No terminal query:
 * probing OSC 11 would cost more latency than this whole CLI takes to start.
 */
const darkBackground = (): boolean => {
  const hint = process.env.COLORFGBG;
  if (hint === undefined || hint === "") return true;

  const background = Number(hint.split(";").at(-1));
  return Number.isFinite(background) ? background < 8 : true;
};

/** The ANSI variants in use right now, exposed for the tests. */
export const colorTheme = (): "dark" | "light" =>
  themeOverride ?? (darkBackground() ? "dark" : "light");

type Palette = { accent: string; wet: string; thunder: string; alert: string };

/** Bright variants on dark, base variants on light; see the header comment. */
const PALETTES: Record<"dark" | "light", Palette> = {
  dark: {
    accent: "\u001B[93m",
    wet: "\u001B[96m",
    thunder: "\u001B[95m",
    alert: "\u001B[91m",
  },
  light: {
    accent: "\u001B[33m",
    wet: "\u001B[36m",
    thunder: "\u001B[35m",
    alert: "\u001B[31m",
  },
};

const enabled = (): boolean => {
  if (colorOverride !== undefined) return colorOverride === "always";
  return process.env.NO_COLOR === undefined && process.stdout.isTTY === true;
};

const RESET = "\u001B[0m";

const BOLD = "\u001B[1m";

/** Bright black, which every theme renders as its own readable grey. */
const MUTED = "\u001B[90m";

const paint = (text: string, code: string): string =>
  enabled() ? `${code}${text}${RESET}` : text;

/** The headline: place name and table headers. */
export const bold = (text: string): string => paint(text, BOLD);

/** Rules, missing values and the credit footnote. Incidental text only. */
export const dim = (text: string): string => paint(text, MUTED);

/** Temperature, the one number worth pulling the eye to. */
export const temperature = (text: string): string =>
  paint(text, PALETTES[colorTheme()].accent);

/** Errors on stderr. */
export const error = (text: string): string =>
  paint(text, PALETTES[colorTheme()].alert);

/** Precipitation and the chance of it, the wet end of every forecast row. */
export const wet = (text: string): string =>
  paint(text, PALETTES[colorTheme()].wet);

/** Thunderstorms: rare enough in a forecast that the colour can mean one thing. */
export const thunder = (text: string): string =>
  paint(text, PALETTES[colorTheme()].thunder);

/** Heavy rain and heavy snow: bold red, the warning end of the palette. */
export const heavy = (text: string): string =>
  paint(text, BOLD + PALETTES[colorTheme()].alert);

/**
 * The credit every command prints on stderr once its output is done: where the
 * place names come from and where the forecast does. Muted so it reads as the
 * footnote it is, and on stderr so `--json` and piped stdout never see it.
 */
export const credits = (): string =>
  dim(
    "Get Locate: https://www.geonames.org/\nGet Weather: https://open-meteo.com/",
  );

/** True when the helpers above actually emit escape sequences. */
export const styled = (): boolean => enabled();

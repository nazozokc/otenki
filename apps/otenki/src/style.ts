import type { ColorMode } from "./config.ts";

/**
 * Minimal ANSI styling. `NO_COLOR` and a non-TTY stdout both disable colour, and
 * every helper returns plain text in that case, so callers never have to care.
 *
 * The palette is the terminal's own ANSI 16 colours rather than fixed RGB. The
 * actual shades behind `31`..`37` are whatever the user's theme maps them to,
 * which is what keeps the output readable on a light background and a dark one
 * alike. Hex codes would look identical everywhere and illegible on half of
 * them, so nothing here names a colour outright.
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

const enabled = (): boolean => {
  if (colorOverride !== undefined) return colorOverride === "always";
  return process.env.NO_COLOR === undefined && process.stdout.isTTY === true;
};

const RESET = "\u001B[0m";

const BOLD = "\u001B[1m";

/** Bright black, which every theme renders as its own readable grey. */
const MUTED = "\u001B[90m";

/** The theme's yellow, the warm accent that reads as sunlight. */
const ACCENT = "\u001B[33m";

const ALERT = "\u001B[31m";

/** The theme's cyan, which every theme renders as water: rain and its odds. */
const WET = "\u001B[36m";

/** The theme's magenta, saved for thunderstorms. */
const THUNDER = "\u001B[35m";

const paint = (text: string, code: string): string =>
  enabled() ? `${code}${text}${RESET}` : text;

/** The headline: place name and table headers. */
export const bold = (text: string): string => paint(text, BOLD);

/** Units and secondary detail, kept out of the way of the numbers. */
export const dim = (text: string): string => paint(text, MUTED);

/** Temperature, the one number worth pulling the eye to. */
export const temperature = (text: string): string => paint(text, ACCENT);

/** Errors on stderr. */
export const error = (text: string): string => paint(text, ALERT);

/** Precipitation and the chance of it, the wet end of every forecast row. */
export const wet = (text: string): string => paint(text, WET);

/** Thunderstorms: rare enough in a forecast that the colour can mean one thing. */
export const thunder = (text: string): string => paint(text, THUNDER);

/** Heavy rain and heavy snow: bold red, the warning end of the palette. */
export const heavy = (text: string): string => paint(text, BOLD + ALERT);

/**
 * The API link that produced the shown forecast, kept muted so the numbers
 * stay the story and the link is the footnote. Printed on stderr, where it
 * can be clicked or piped away without touching the output on stdout.
 */
export const apiLink = (url: URL): string => dim(`API: ${url}`);

/** True when the helpers above actually emit escape sequences. */
export const styled = (): boolean => enabled();

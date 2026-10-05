/**
 * Minimal ANSI styling. `NO_COLOR` and a non-TTY stdout both disable colour, and
 * every helper returns plain text in that case, so callers never have to care.
 */
const enabled = (): boolean =>
  process.env.NO_COLOR === undefined && process.stdout.isTTY === true;

const RESET = "\u001B[0m";

const paint = (text: string, color: string): string =>
  enabled() ? `${Bun.color(color, "ansi")}${text}${RESET}` : text;

/** The headline: place name and coordinates. */
export const bold = (text: string): string => paint(text, "#ffffff");

/** Units and secondary detail, kept out of the way of the numbers. */
export const dim = (text: string): string => paint(text, "#8a8a8a");

/** Temperature, the one number worth pulling the eye to. */
export const temperature = (text: string): string => paint(text, "#ff9e64");

/** Errors on stderr. */
export const error = (text: string): string => paint(text, "#f7768e");

/** Highlighted table header. */
export const heading = (text: string): string => paint(text, "#7aa2f7");
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
const enabled = (): boolean =>
  process.env.NO_COLOR === undefined && process.stdout.isTTY === true;

const RESET = "\u001B[0m";

const BOLD = "\u001B[1m";

/** Bright black, which every theme renders as its own readable grey. */
const MUTED = "\u001B[90m";

/** The theme's yellow, the warm accent that reads as sunlight. */
const ACCENT = "\u001B[33m";

const ALERT = "\u001B[31m";

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

/** True when the helpers above actually emit escape sequences. */
export const styled = (): boolean => enabled();

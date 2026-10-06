/**
 * Strips terminal control sequences from text that arrives from outside this
 * process (the geocoder, fzf, argv). Place names print straight to the
 * terminal, and a name carrying an OSC or CSI sequence could redraw the
 * screen, recolour the output or rewrite the clipboard. Legitimate names
 * never contain control characters, so removal loses nothing.
 *
 * Newlines and tabs go as well: a field that spans lines would break the
 * table and fzf's one-line-per-candidate contract.
 */

// CSI (colour, cursor movement), OSC (titles, clipboard: BEL or ST ended),
// then every other two-character escape. Order matters: the specific forms
// must match before the catch-all eats only the ESC and a bracket.
const SEQUENCES =
  /\u001B\[[0-9;:?]*[ -\/]*[@-~]|\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)|\u001B[\x30-\x7E]/g;

// Whatever is left: C0 controls, DEL, and the C1 block.
const CONTROLS = /[\u0000-\u001F\u007F-\u009F]/g;

export const sanitizeText = (text: string): string =>
  text.replace(SEQUENCES, "").replace(CONTROLS, "");

/**
 * Terminal cell measurement. Nothing here knows about tables: it answers one
 * question, "how many columns does this string occupy in a monospace cell",
 * which layout code then pads against.
 */

/**
 * CSI sequences are colour, not glyphs, so they must not count towards a cell's
 * width. Callers colour their strings before measuring, which makes stripping
 * them here cheaper than threading a paint step through every call site.
 */
const ANSI = /\u001B\[[0-9;]*m/g;

/**
 * East Asian Wide and Fullwidth code points below U+FFFF, transcribed from the
 * Unicode EastAsianWidth data. Astral code points are wide by definition, so
 * they are handled arithmetically rather than listed.
 */
const WIDE: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], // Hangul Jamo
  // U+2103 ℃: East Asian Ambiguous rather than Wide, yet Japanese terminals
  // render the unit glyph fullwidth. The table has to measure what the
  // terminal draws, so it joins the wide list over the spec's objection.
  [0x2103, 0x2103], // ℃
  [0x231a, 0x231b], // ⌚ ⌛
  [0x2329, 0x232a], // ⟨ ⟩
  [0x23e9, 0x23ec], // ⏩ ⏪ ⏫ ⏬
  [0x23f0, 0x23f0], // ⏰
  [0x23f3, 0x23f3], // ⏳
  [0x25fd, 0x25fe], // ◽ ◾
  [0x2614, 0x2615], // ☔ ☕
  [0x261d, 0x261d], // ☝
  [0x2648, 0x2653], // ♈ ♉ ♊ ♋ ♌ ♍
  [0x267f, 0x267f], // ♿
  [0x2693, 0x2693], // ⚓
  [0x26a1, 0x26a1], // ⚡
  [0x26aa, 0x26ab], // ⚪ ⚫
  [0x26bd, 0x26be], // ⚽ ⚾
  [0x26c4, 0x26c5], // ⛄ ⛅
  [0x26ce, 0x26ce], // ⛎
  [0x26d4, 0x26d4], // ⛔
  [0x26ea, 0x26ea], // ⛺
  [0x26f2, 0x26f3], // ⛲ ⛳
  [0x26f5, 0x26f5], // ⛵
  [0x26f9, 0x26fa], // ⛹ ⛺
  [0x26fd, 0x26fd], // ⛽
  [0x2705, 0x2705], // ✅
  [0x270a, 0x270d], // ✊ ✋ ✌ ✍
  [0x2728, 0x2728], // ✨
  [0x274c, 0x274c], // ❌
  [0x274e, 0x274e], // ❎
  [0x2753, 0x2755], // ❓ ❔ ❕
  [0x2757, 0x2757], // ❗
  [0x2795, 0x2797], // ➕ ➖ ➗
  [0x27b0, 0x27b0], // ➰
  [0x27bf, 0x27bf], // ➿
  [0x2b1b, 0x2b1c], // ⬛ ⬜
  [0x2b50, 0x2b50], // ⭐
  [0x2b55, 0x2b55], // ⭕
  [0x2e80, 0x303e], // CJK radicals, Kangxi, CJK symbols and punctuation
  [0x3040, 0x3247], // Hiragana through CJK unified ideographs extension F
  [0x3250, 0x33ff], // CJK compatibility
  [0x3400, 0x4dbf], // CJK unified ideographs extension A
  [0x4e00, 0xa4c6], // CJK unified ideographs and Yi
  [0xa960, 0xa97c], // Hangul Jamo extended A
  [0xac00, 0xd7a3], // Hangul syllables
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0xfe10, 0xfe19], // Vertical forms
  [0xfe30, 0xfe6b], // CJK compatibility forms
  [0xff01, 0xff60], // Fullwidth forms
  [0xffe0, 0xffe6], // Fullwidth signs
];

/**
 * Combining marks, variation selectors, the joiner and the control characters.
 * These attach to the glyph before them or draw nothing at all.
 */
const ZERO_WIDTH: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x001f], // C0 controls
  [0x007f, 0x009f], // delete and C1 controls
  [0x0300, 0x036f], // combining diacritical marks
  [0x1ab0, 0x1aff], // combining marks for symbols
  [0x200b, 0x200f], // zero width space through right-to-left mark
  [0x20d0, 0x20ff], // combining marks for symbols
  [0xfe00, 0xfe0f], // variation selectors
  [0x1f3fb, 0x1f3ff], // emoji skin tone modifiers
];

const inRanges = (
  code: number,
  ranges: ReadonlyArray<readonly [number, number]>,
): boolean => ranges.some(([start, end]) => code >= start && code <= end);

const charWidth = (code: number): number => {
  if (inRanges(code, ZERO_WIDTH)) return 0;
  if (code > 0xffff) return 2;

  return inRanges(code, WIDE) ? 2 : 1;
};

const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

const EMOJI_PRESENTATION = "\uFE0F";

/**
 * Terminal cells a string occupies. A font draws an emoji two cells wide even
 * when its bare code point is a narrow symbol, so width has to be measured per
 * grapheme cluster: padding by code point length would drift the moment a `☀`
 * picked up its variation selector.
 */
export const displayWidth = (text: string): number => {
  let width = 0;

  for (const { segment } of segmenter.segment(text.replace(ANSI, ""))) {
    if (segment.includes(EMOJI_PRESENTATION)) {
      width += 2;
      continue;
    }

    let cells = 0;
    for (const char of segment) {
      cells = Math.max(cells, charWidth(char.codePointAt(0) ?? 0));
    }

    width += cells;
  }

  return width;
};

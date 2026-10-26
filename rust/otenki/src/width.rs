//! Terminal cell measurement, the mirror of `width.ts`. Nothing here knows
//! about tables: it answers one question — "how many columns does this string
//! occupy in a monospace cell" — which layout code then pads against.
//!
//! Segmentation is the UAX #29 subset this CLI's data can reach: a base with
//! its Extend run attached (variation selectors, combining marks, skin tones,
//! the joiner) plus the CR-LF pair. ZWJ emoji chains and regional indicator
//! pairs don't appear in any output the battery produces, and the golden
//! battery is the arbiter of whether that stays true.

/// CSI colour runs (`\u001B\[[0-9;]*m`) are style, not glyphs, so they must
/// not count towards a cell's width. Callers colour their strings before
/// measuring, which makes stripping them here cheaper than threading a paint
/// step through every call site.
fn strip_sgr(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut index = 0;
    while index < chars.len() {
        if chars[index] != '\u{001B}' {
            out.push(chars[index]);
            index += 1;
            continue;
        }
        let mut cursor = index + 1;
        if chars.get(cursor) != Some(&'[') {
            out.push('\u{001B}');
            index += 1;
            continue;
        }
        cursor += 1;
        while matches!(chars.get(cursor), Some('0'..='9' | ';')) {
            cursor += 1;
        }
        if chars.get(cursor) == Some(&'m') {
            index = cursor + 1; // style run dropped
        } else {
            out.push('\u{001B}');
            index += 1; // this regex would not match either
        }
    }
    out
}

/// East Asian Wide and Fullwidth code points below U+FFFF, transcribed from
/// the Unicode EastAsianWidth data exactly as `width.ts` lists them. Astral
/// code points are wide by definition, so they are handled arithmetically.
const WIDE: &[(u32, u32)] = &[
    (0x1100, 0x115f), // Hangul Jamo
    // U+2103 ℃ is East Asian Ambiguous rather than Wide, yet Japanese
    // terminals render the unit glyph fullwidth. Measure what the terminal
    // draws: the table outranks the spec here on purpose.
    (0x2103, 0x2103),
    (0x231a, 0x231b),
    (0x2329, 0x232a),
    (0x23e9, 0x23ec),
    (0x23f0, 0x23f0),
    (0x23f3, 0x23f3),
    (0x25fd, 0x25fe),
    (0x2614, 0x2615),
    (0x261d, 0x261d),
    (0x2648, 0x2653),
    (0x267f, 0x267f),
    (0x2693, 0x2693),
    (0x26a1, 0x26a1),
    (0x26aa, 0x26ab),
    (0x26bd, 0x26be),
    (0x26c4, 0x26c5),
    (0x26ce, 0x26ce),
    (0x26d4, 0x26d4),
    (0x26ea, 0x26ea),
    (0x26f2, 0x26f3),
    (0x26f5, 0x26f5),
    (0x26f9, 0x26fa),
    (0x26fd, 0x26fd),
    (0x2705, 0x2705),
    (0x270a, 0x270d),
    (0x2728, 0x2728),
    (0x274c, 0x274c),
    (0x274e, 0x274e),
    (0x2753, 0x2755),
    (0x2757, 0x2757),
    (0x2795, 0x2797),
    (0x27b0, 0x27b0),
    (0x27bf, 0x27bf),
    (0x2b1b, 0x2b1c),
    (0x2b50, 0x2b50),
    (0x2b55, 0x2b55),
    (0x2e80, 0x303e),
    (0x3040, 0x3247),
    (0x3250, 0x33ff),
    (0x3400, 0x4dbf),
    (0x4e00, 0xa4c6),
    (0xa960, 0xa97c),
    (0xac00, 0xd7a3),
    (0xf900, 0xfaff),
    (0xfe10, 0xfe19),
    (0xfe30, 0xfe6b),
    (0xff01, 0xff60),
    (0xffe0, 0xffe6),
];
/// Combining marks, variation selectors, joiners and controls: these attach
/// to the glyph before them or draw nothing at all, so they contribute zero.
const ZERO_WIDTH: [(u32, u32); 8] = [
    (0x0000, 0x001f), // C0 controls (CR and LF excluded below)
    (0x007f, 0x009f), // delete and C1 controls
    (0x0300, 0x036f),
    (0x1ab0, 0x1aff),
    (0x200b, 0x200f),
    (0x20d0, 0x20ff),
    (0xfe00, 0xfe0f),
    (0x1f3fb, 0x1f3ff), // emoji skin tone modifiers
];

fn in_ranges(code: u32, ranges: &[(u32, u32)]) -> bool {
    ranges
        .iter()
        .any(|(start, end)| code >= *start && code <= *end)
}

fn char_width(code: u32) -> usize {
    if in_ranges(code, &ZERO_WIDTH) {
        return 0;
    }
    if code > 0xffff {
        return 2;
    }
    if in_ranges(code, &WIDE) {
        2
    } else {
        1
    }
}

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Cr,
    Lf,
    Extend,
    Other,
}

fn kind_of(c: char) -> Kind {
    match c {
        '\r' => Kind::Cr,
        '\n' => Kind::Lf,
        other if is_extend(other) => Kind::Extend,
        _ => Kind::Other,
    }
}

/// Grapheme_Extend members this CLI's strings can carry: combining marks,
/// variation selectors (U+FE0F and friends), emoji skin tone modifiers, and
/// the joiner family (ZWJ at U+200D, ZWNJ/LRM/RLM around it).
fn is_extend(c: char) -> bool {
    matches!(
        c,
        '\u{0300}'..='\u{036F}'
            | '\u{1AB0}'..='\u{1AFF}'
            | '\u{200C}'..='\u{200F}'
            | '\u{20D0}'..='\u{20FF}'
            | '\u{FE00}'..='\u{FE0F}'
            | '\u{1F3FB}'..='\u{1F3FF}'
    )
}

/// Terminal cells a string occupies. A font draws an emoji two cells wide even
/// when its bare code point is a narrow symbol, so width is measured per
/// grapheme cluster: padding by code point length would drift the moment a
/// `☀` picked up its variation selector.
pub fn display_width(text: &str) -> usize {
    let stripped = strip_sgr(text);
    let mut width = 0usize;
    let mut cluster = String::new();
    let mut prev = None;
    for c in stripped.chars() {
        let kind = kind_of(c);
        let break_before = match (prev, kind) {
            (None, _) => false,
            // GB3: the CR-LF pair is one cluster.
            (Some(Kind::Cr), Kind::Lf) => false,
            // GB4/GB5: line break characters stand alone.
            (Some(Kind::Cr) | Some(Kind::Lf), _) => true,
            // GB9: an Extend attaches to whatever precedes.
            (_, Kind::Extend) => false,
            _ => true,
        };
        if break_before {
            width += cluster_width(&cluster);
            cluster.clear();
        }
        cluster.push(c);
        prev = Some(kind);
    }
    width += cluster_width(&cluster);
    width
}

fn cluster_width(cluster: &str) -> usize {
    // A font draws emoji-presentation sequences (the cluster picked up a
    // U+FE0F) two cells wide even when the base itself is a narrow symbol.
    if cluster.contains('\u{FE0F}') {
        return 2;
    }
    cluster
        .chars()
        .map(|c| char_width(u32::from(c)))
        .max()
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn weather_icons_take_two_cells() {
        for icon in ["☀️", "🌤️", "☁️", "🌫️", "🌦️", "🌧️", "🌨️", "⛈️"]
        {
            assert_eq!(display_width(icon), 2, "{icon}");
        }
    }

    #[test]
    fn bare_wide_glyphs_measure_themselves() {
        assert_eq!(display_width("❓"), 2);
        assert_eq!(display_width("℃"), 2);
        assert_eq!(display_width("東京"), 4);
        assert_eq!(display_width("Nagano"), 6);
        assert_eq!(display_width(""), 0);
    }

    #[test]
    fn colour_codes_are_not_glyphs() {
        assert_eq!(display_width("\u{001B}[31m赤\u{001B}[0m"), 2);
        assert_eq!(display_width("\u{001B}[1mx"), 1);
        // A stray ESC without an SGR stays put: a control glyph measures zero
        // cells, as the zero-width table says.
        assert_eq!(display_width("\u{001B}"), 0);
        assert_eq!(display_width("a\u{001B}b"), 2);
    }

    #[test]
    fn combining_and_selector_clusters() {
        assert_eq!(display_width("e\u{0301}"), 1);
        // ☀ without its selector is narrow; with it the cluster draws wide.
        assert_eq!(display_width("☀"), 1);
        assert_eq!(display_width("☀\u{FE0F}"), 2);
        assert_eq!(display_width("水\u{FE0F}\u{FE0F}"), 2);
        // A leading selector gets its own two-cell cluster, like Intl does.
        assert_eq!(display_width("\u{FE0F}x"), 3);
    }

    #[test]
    fn cjk_and_latin_mix() {
        // 東京 25℃ = 2+2+1+1+1+2
        assert_eq!(display_width("東京 25℃"), 9);
        // 北浜 12km/h = 2+2+1+2+2+1+1
        assert_eq!(display_width("北浜 12km/h"), 11);
    }
}

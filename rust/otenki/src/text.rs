//! The JavaScript string behaviors the port leans on: trimming, `\s`-splitting
//! and lowercasing, which Bun provides via ECMAScript rules the Rust standard
//! library spells differently.
//!
//! The differences that actually matter:
//! - `String.prototype.trim` also strips U+FEFF; Rust's `trim` does not.
//! - `/\s+/` treats those same characters, including U+FEFF, as separators.
//! - `toLowerCase` maps U+0130 to `i` + combining dot (full Unicode casing).

/// ECMAScript's `WhiteSpace` plus `LineTerminator`, which is exactly the set
/// `String.prototype.trim` strips from both ends and `/s` in regexes matches.
/// U+FEFF rides along in both, per the spec's `ZWNBScape` note.
fn is_js_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{000B}' | '\u{000C}' | '\r' | ' ' | '\u{00A0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200A}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202F}'
                | '\u{205F}'
                | '\u{3000}'
                | '\u{FEFF}'
    )
}

/// `text.trim()`.
pub fn js_trim(text: &str) -> &str {
    text.trim_matches(is_js_space)
}

/// `query.trim().split(/\s+/).filter(Boolean)` in one pass: separators are the
/// JS `\s` set (a run is one), the output never contains empty strings, and a
/// whole-whitespace input yields nothing rather than `[""]`.
pub fn js_split_words(text: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut current = String::new();
    for c in text.chars() {
        if is_js_space(c) {
            if !current.is_empty() {
                words.push(std::mem::take(&mut current));
            }
        } else {
            current.push(c);
        }
    }
    if !current.is_empty() {
        words.push(current);
    }
    words
}

/// `text.toLowerCase()` for the comparisons this CLI makes. Rust already
/// implements the same full Unicode folding for the codepoints place names,
/// config values and filter tokens realistically hold, so delegate is exact.
pub fn js_to_lower(text: &str) -> String {
    text.to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_the_js_set() {
        assert_eq!(js_trim("\u{FEFF}東京\u{00A0}"), "東京");
        assert_eq!(js_trim(" \t x \r\n"), "x");
        assert_eq!(js_trim("x"), "x");
        assert_eq!(js_trim(""), "");
        // Rust's own trim keeps U+FEFF, the JS one does not.
        assert_eq!("\u{FEFF}x".trim(), "\u{FEFF}x");
        assert_eq!(js_trim("\u{FEFF}x"), "x");
    }

    #[test]
    fn splits_on_runs_of_js_space() {
        assert_eq!(js_split_words(" 神奈川\t横浜市 "), vec!["神奈川", "横浜市"]);
        assert_eq!(js_split_words("a  b"), vec!["a", "b"]);
        assert_eq!(js_split_words(""), Vec::<String>::new());
        assert_eq!(js_split_words("   "), Vec::<String>::new());
        assert_eq!(js_split_words("a\u{FEFF}b"), vec!["a", "b"]);
    }

    #[test]
    fn lowercases_like_js() {
        assert_eq!(js_to_lower("St. Louis"), "st. louis");
        assert_eq!(js_to_lower(" Washington DC "), " washington dc ");
        assert_eq!(js_to_lower("İ"), "i\u{0307}");
        assert_eq!(js_to_lower("ẞ"), "ß");
    }
}

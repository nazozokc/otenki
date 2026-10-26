//! Terminal control sequences, stripped the way `sanitizeText` does.
//!
//! Place names print straight to the terminal, so anything that arrives from
//! outside this process (geocoder, cache file, fzf, argv) has its ESC
//! sequences removed first: CSI for colour and cursor movement, OSC for
//! titles and the clipboard, then every other two-character escape. Whatever
//! control characters survive get removed wholesale — newlines break the
//! table contract. Legitimate place names carry none of these.

/// One pass mirroring the SEQUENCES regex: at each ESC, try CSI, then OSC,
/// then the catch-all two-character form, exactly in the source's order.
fn strip_sequences(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut index = 0;
    while index < chars.len() {
        if chars[index] != '\u{001B}' {
            out.push(chars[index]);
            index += 1;
            continue;
        }
        // index still on the ESC; consumeLen counts past what matched.
        let mut step: Option<usize> = None;
        if let Some(rest) = chars.get(index + 1) {
            step = match rest {
                '[' => match take_csi(&chars[index + 2..]) {
                    Some(consumed) => Some(2 + consumed),
                    None => Some(2), // ESC + '[' fall to the catch-all
                },
                ']' => match take_osc(&chars[index + 2..]) {
                    Some(consumed) => Some(2 + consumed),
                    None => Some(2), // ESC + ']' likewise
                },
                other if ('\u{0030}'..='\u{007E}').contains(other) => Some(2),
                _ => None,
            };
        }
        match step {
            Some(step) => index += step, // dropped, never copied
            // No alternative claims this ESC and its neighbour; the ESC itself
            // survives into the control pass.
            None => {
                out.push('\u{001B}');
                index += 1;
            }
        }
    }
    out
}

/// `\u001B\[[0-9;:?]*[ -\/]*[@-~]`: params, intermediates, one final byte.
/// Missing finals can't be backtracked into by the whole-expression, which is
/// why ESC + '[' alone reduces to the two-character escape.
fn take_csi(rest: &[char]) -> Option<usize> {
    let mut index = 0;
    while matches!(rest.get(index), Some('0'..='9' | ';' | ':' | '?')) {
        index += 1;
    }
    while matches!(rest.get(index), Some(' '..='/')) {
        index += 1;
    }
    matches!(rest.get(index), Some('@'..='~')).then_some(index + 1)
}

/// `\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)`: OSC terminated by BEL or
/// by ESC backslash.
fn take_osc(rest: &[char]) -> Option<usize> {
    let mut index = 0;
    while matches!(rest.get(index), Some(c) if *c != '\u{0007}' && *c != '\u{001B}') {
        index += 1;
    }
    match rest.get(index) {
        Some('\u{0007}') => Some(index + 1),
        Some('\u{001B}') => matches!(rest.get(index + 1), Some('\\')).then_some(index + 2),
        _ => None,
    }
}

/// C0 controls, DEL and the whole C1 block go, after the sequences already did.
fn strip_controls(text: &str) -> String {
    text.chars()
        .filter(|c| !matches!(c, '\u{0000}'..='\u{001F}' | '\u{007F}'..='\u{009F}'))
        .collect()
}

/// `sanitizeText`. Two ordered passes: sequences first — the catch-all would
/// otherwise eat a bracket that belonged to a longer construct — then controls.
pub fn sanitize_text(text: &str) -> String {
    strip_controls(&strip_sequences(text))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sequences(input: &str) -> String {
        strip_sequences(input)
    }

    #[test]
    fn csi_sequences_go() {
        assert_eq!(sequences("東京\u{001B}[31m赤\u{001B}[0m"), "東京赤");
        assert_eq!(sequences("\u{001B}[?25h"), "");
        assert_eq!(sequences("\u{001B}[38;5;196mX"), "X");
        // The first ESC can only start a sequence, and it doesn't here
        // (ESC is no final byte), so it survives the sequence pass.
        assert_eq!(sequences("\u{001B}\u{001B}[31m"), "\u{001B}");
        // Params and intermediates consume in order; a well-formed final byte
        // is matched, whatever characters precede it.
        assert_eq!(sanitize_text("\u{001B}[ \tm"), " m");
        assert_eq!(sanitize_text("\u{001B}[1 mX"), "X");
    }

    #[test]
    fn osc_sequences_go_only_with_a_terminator() {
        assert_eq!(sequences("\u{001B}]0;title\u{0007}rest"), "rest");
        assert_eq!(sequences("\u{001B}]8;;https://x\u{001B}\\Y"), "Y");
        // Unterminated: the OSC alternative fails, so the two-character
        // escape eats just the bracket.
        assert_eq!(sequences("\u{001B}]8;;link"), "8;;link");
        // An ESC inside the body ends the body; with no backslash after it,
        // the OSC cannot match and the two-char escape eats only the bracket.
        assert_eq!(sequences("\u{001B}]a\u{001B}b"), "a");
    }

    #[test]
    fn two_char_escapes_and_bare_esc_go() {
        assert_eq!(sequences("a\u{001B}Mb"), "ab");
        // 'x' is the catch-all's final byte, so both characters go.
        assert_eq!(sequences("\u{001B}x"), "");
        assert_eq!(strip_controls("\u{001B}"), "");
        // ESC followed by a non-escape control stays until the control pass.
        assert_eq!(sanitize_text("\u{001B}\u{0009}静岡"), "静岡");
    }

    #[test]
    fn controls_go_after_sequences() {
        assert_eq!(strip_controls("a\u{0007}b\u{0085}c"), "abc");
        assert_eq!(strip_controls("東\u{000B}京\u{007F}"), "東京");
        // 0x9F is C1; 0xA0 is a printable space and stays.
        assert_eq!(strip_controls("\u{009F}x\u{00A0}"), "x\u{00A0}");
    }

    #[test]
    fn names_pass_through() {
        assert_eq!(sanitize_text("Washington D.C."), "Washington D.C.");
        // An apostrophe is plain text to this sanitizer.
        assert_eq!(sanitize_text("’štěstí"), "’štěstí");
    }
}

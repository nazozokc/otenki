//! Minimal ANSI styling, the mirror of `style.ts`. `NO_COLOR` and a non-TTY
//! stdout both disable colour, and every helper returns plain text then, so
//! callers never have to care.
//!
//! The palette is the terminal's own ANSI 16 colours rather than fixed RGB:
//! the shades behind `31`..`37` are whatever the user's theme maps them to,
//! which keeps the output readable on light and dark backgrounds alike.

use crate::config::ColorMode;
use std::cell::Cell;
use std::io::IsTerminal;

thread_local! {
    /// The config's `color` key, when it says `always` or `never`, beats both
    /// the TTY detection and `NO_COLOR`: an explicit choice in the file is the
    /// one thing a detection heuristic should not override. `auto` and no key
    /// at all fall back to the detection.
    static COLOR_OVERRIDE: Cell<Option<ColorMode>> = const { Cell::new(None) };
}

/// `setColorMode`: `auto` clears the override, leaving detection in charge.
pub fn set_color_mode(mode: Option<ColorMode>) {
    COLOR_OVERRIDE.with(|cell| cell.set(mode.filter(|m| *m != ColorMode::Auto)));
}

fn paint_enabled() -> bool {
    match COLOR_OVERRIDE.with(Cell::get) {
        Some(mode) => matches!(mode, ColorMode::Always),
        None => std::env::var_os("NO_COLOR").is_none() && std::io::stdout().is_terminal(),
    }
}

/// True when the helpers below actually emit escape sequences.
pub fn styled() -> bool {
    paint_enabled()
}

/// `\u001B[0m`.
pub const RESET: &str = "\u{1B}[0m";

const BOLD: &str = "\u{1B}[1m";

/// Bright black, which every theme renders as its own readable grey.
const MUTED: &str = "\u{1B}[90m";

/// The theme's yellow, the warm accent that reads as sunlight.
const ACCENT: &str = "\u{1B}[33m";

const ALERT: &str = "\u{1B}[31m";

/// The theme's cyan, which every theme renders as water: rain and its odds.
const WET: &str = "\u{1B}[36m";

/// The theme's magenta, saved for thunderstorms.
const THUNDER: &str = "\u{1B}[35m";

fn paint(text: &str, code: &str) -> String {
    if paint_enabled() {
        format!("{code}{text}{RESET}")
    } else {
        text.to_string()
    }
}

/// The headline: place name and table headers.
pub fn bold(text: &str) -> String {
    paint(text, BOLD)
}

/// Units and secondary detail, kept out of the way of the numbers.
pub fn dim(text: &str) -> String {
    paint(text, MUTED)
}

/// Temperature, the one number worth pulling the eye to.
pub fn temperature(text: &str) -> String {
    paint(text, ACCENT)
}

/// Errors on stderr.
pub fn alert(text: &str) -> String {
    paint(text, ALERT)
}

/// Precipitation and the chance of it, the wet end of every forecast row.
pub fn wet(text: &str) -> String {
    paint(text, WET)
}

/// Thunderstorms: rare enough in a forecast that the colour can mean one thing.
pub fn thunder(text: &str) -> String {
    paint(text, THUNDER)
}

/// Heavy rain and heavy snow: bold red, the warning end of the palette.
pub fn heavy(text: &str) -> String {
    paint(text, &format!("{BOLD}{ALERT}"))
}

/// The credit every command prints on stderr once its output is done: where
/// the place names come from and where the forecast does. Muted so it reads
/// as the footnote it is, and on stderr so `--json` and piped stdout never
/// see it.
pub fn credits() -> String {
    dim("Get Locate: https://www.geonames.org/\nGet Weather: https://open-meteo.com/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn override_always_paints_even_without_a_tty() {
        set_color_mode(Some(ColorMode::Always));
        assert_eq!(bold("東京"), "\u{1B}[1m東京\u{1B}[0m");
        assert_eq!(heavy("大雨"), "\u{1B}[1m\u{1B}[31m大雨\u{1B}[0m");
        assert_eq!(credits(), "\u{1B}[90mGet Locate: https://www.geonames.org/\nGet Weather: https://open-meteo.com/\u{1B}[0m");
        set_color_mode(None);
    }

    #[test]
    fn override_never_wins_over_a_tty() {
        set_color_mode(Some(ColorMode::Never));
        assert_eq!(temperature("25"), "25");
        assert_eq!(wet("40%"), "40%");
        assert_eq!(thunder("⛈"), "⛈");
        set_color_mode(None);
    }

    #[test]
    fn auto_redetects_each_call() {
        // Test stdout is not a terminal, so auto paints nothing.
        set_color_mode(Some(ColorMode::Auto));
        set_color_mode(None);
        assert_eq!(dim("hPa"), "hPa");
        assert!(!styled());
    }
}

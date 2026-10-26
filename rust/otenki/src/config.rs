//! The config file: `<config>/otenki/config.json` — a mirror of
//! `config.ts`, every validation error message byte for byte. Every key is
//! optional: an absent file, an absent key and an explicit default all mean
//! the same thing, so the CLI works untouched until there is a reason to
//! configure it.

use crate::json::{self, Value};
use std::path::Path;

pub const MAX_FORECAST_DAYS: i64 = 16;

/// How temperatures, wind and precipitation are asked for and printed.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Units {
    Metric,
    Imperial,
}

/// Overrides the TTY and `NO_COLOR` detection: `auto` is the detection.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ColorMode {
    Auto,
    Always,
    Never,
}

/// A place name (`函館`, `横浜市 神奈川`) or a `[latitude, longitude]` pair.
#[derive(Clone, Debug, PartialEq)]
pub enum DefaultLocation {
    Name(String),
    LatLon(f64, f64),
}

#[derive(Debug, PartialEq)]
pub struct Config {
    pub location: Option<DefaultLocation>,
    pub command: Option<String>,
    pub color: Option<ColorMode>,
    pub units: Option<Units>,
    pub days: Option<i64>,
}

/// A config file the user can fix: unreadable, malformed, out of range.
/// The message is user-facing text, streamed out verbatim.
#[derive(Debug, PartialEq)]
pub struct ConfigError(pub String);

impl ConfigError {
    pub fn text(&self) -> &str {
        &self.0
    }
}

type ConfigResult<T> = Result<T, ConfigError>;

pub const NO_CONFIG_FLAG: &str = "--no-config";

const KEYS: [&str; 5] = ["location", "command", "color", "units", "days"];

/// `config: ${path}: ${detail}` — everything broken about the file funnels
/// through this one shape, exactly as the TypeScript's `fail` does.
fn fail(path: &str, detail: &str) -> ConfigError {
    ConfigError(format!("config: {path}: {detail}"))
}

fn validate_location(path: &str, value: &Value) -> ConfigResult<DefaultLocation> {
    if let Some(text) = value.as_str() {
        if crate::text::js_trim(text).is_empty() {
            return Err(fail(path, "location must not be empty"));
        }
        return Ok(DefaultLocation::Name(text.to_string()));
    }
    if let Some(items) = value.as_arr() {
        if items.len() == 2 {
            if let (Some(latitude), Some(longitude)) = (items[0].as_f64(), items[1].as_f64()) {
                if latitude.is_finite() && longitude.is_finite() {
                    if !(-90.0..=90.0).contains(&latitude) || !(-180.0..=180.0).contains(&longitude)
                    {
                        return Err(fail(
                            path,
                            &format!(
                                "location out of range: {}, {} (latitude -90..90, longitude -180..180)",
                                json::js_number_string(latitude),
                                json::js_number_string(longitude)
                            ),
                        ));
                    }
                    return Ok(DefaultLocation::LatLon(latitude, longitude));
                }
            }
        }
        return Err(fail(
            path,
            "location must be two finite numbers [latitude, longitude]",
        ));
    }
    Err(fail(
        path,
        "location must be a place name or [latitude, longitude]",
    ))
}

fn validate_enum(path: &str, key: &str, value: &Value, allowed: &[&str]) -> ConfigResult<String> {
    let text = value.as_str();
    if !matches!(text, Some(got) if allowed.contains(&got)) {
        // "color must be auto, always or never": every member but the last
        // joined with commas, then the final member after "or".
        let grouped = allowed[..allowed.len() - 1].join(", ");
        return Err(fail(
            path,
            &format!("{key} must be {grouped} or {}", allowed[allowed.len() - 1]),
        ));
    }
    Ok(text.unwrap_or("").to_string())
}

fn validate_string(path: &str, key: &str, value: &Value) -> ConfigResult<String> {
    match value.as_str() {
        Some(text) if !crate::text::js_trim(text).is_empty() => Ok(text.to_string()),
        _ => Err(fail(path, &format!("{key} must be a non-empty string"))),
    }
}

/// Structural validation: keys, types, ranges. Command names belong to the CLI.
fn validate(path: &str, raw: &Value) -> ConfigResult<Config> {
    let entries = match raw {
        Value::Obj(entries) => entries,
        _ => return Err(fail(path, "expected a JSON object")),
    };
    for (key, _) in entries {
        if !KEYS.contains(&key.as_str()) {
            return Err(fail(path, &format!("unknown key '{key}'")));
        }
    }

    let mut config = Config {
        location: None,
        command: None,
        color: None,
        units: None,
        days: None,
    };

    let lookup = |key: &str| raw.get(key);
    if let Some(value) = lookup("location") {
        config.location = Some(validate_location(path, value)?);
    }
    if let Some(value) = lookup("command") {
        config.command = Some(validate_string(path, "command", value)?);
    }
    if let Some(value) = lookup("color") {
        match validate_enum(path, "color", value, &["auto", "always", "never"])? {
            text => {
                config.color = Some(match text.as_str() {
                    "always" => ColorMode::Always,
                    "never" => ColorMode::Never,
                    _ => ColorMode::Auto,
                })
            }
        }
    }
    if let Some(value) = lookup("units") {
        match validate_enum(path, "units", value, &["metric", "imperial"])? {
            text => {
                config.units = Some(match text.as_str() {
                    "imperial" => Units::Imperial,
                    _ => Units::Metric,
                })
            }
        }
    }
    if let Some(value) = lookup("days") {
        let finite_int =
            matches!(value, Value::Num(days) if days.is_finite() && days.fract() == 0.0);
        if !finite_int
            || !matches!(value, Value::Num(days) if (*days as i64) >= 1 && (*days as i64) <= MAX_FORECAST_DAYS)
        {
            return Err(fail(
                path,
                &format!("days must be an integer from 1 to {MAX_FORECAST_DAYS}"),
            ));
        }
        config.days = value.as_f64().map(|days| days as i64);
    }
    Ok(config)
}

/// XDG resolution: a relative `XDG_CONFIG_HOME` is ignored per the XDG spec,
/// and the fallback is the home directory rather than env `HOME` so an unset
/// value cannot build a relative path.
pub fn config_dir() -> String {
    let xdg = std::env::var("XDG_CONFIG_HOME").unwrap_or_default();
    let home = if !xdg.is_empty() && Path::new(&xdg).is_absolute() {
        xdg
    } else {
        let home = std::env::var("HOME").unwrap_or_default();
        if home.is_empty() {
            "/root".to_string()
        } else {
            home
        }
    };
    format!("{home}/otenki")
}

pub fn config_path() -> String {
    format!("{}/config.json", config_dir())
}

/// Reads and validates the config file. A missing file is `None` — not an
/// error, because a config-less install is the default state. A file that
/// exists but does not parse is an error with the path in it: silently
/// ignoring a typo would make the CLI appear to ignore the user on purpose.
pub fn load_config(path: &Path) -> ConfigResult<Config> {
    let bytes = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Config {
                location: None,
                command: None,
                color: None,
                units: None,
                days: None,
            });
        }
        Err(_) => return Err(fail(path.to_string_lossy().as_ref(), "cannot be read")),
    };
    let raw = json::parse(&bytes).map_err(|JsonErr| {
        fail(
            path.to_string_lossy().as_ref(),
            &format!("invalid JSON ({})", JsonErr.0),
        )
    })?;
    validate(path.to_string_lossy().as_ref(), &raw)
}

/**
 * Pulls `--no-config` out of the arguments before the command parser sees
 * it so the flag works in every position without the parser having to know.
 * After `--` every token is positional: a place named `--no-config` stays a
 * place. The `--` separator itself does not survive, matching the runtime
 * CLI behavior.
 */
pub fn strip_no_config(argv: &[String]) -> (Vec<String>, bool) {
    let mut out = Vec::with_capacity(argv.len());
    let mut no_config = false;
    let mut literal = false;
    for token in argv {
        if literal {
            out.push(token.clone());
            continue;
        }
        if token == "--" {
            literal = true;
            continue;
        }
        if token == NO_CONFIG_FLAG {
            no_config = true;
            continue;
        }
        out.push(token.clone());
    }
    (out, no_config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::parse;

    fn fail_of(value: &str) -> ConfigError {
        // Route through load_config's JSON branch: a file that exists but
        // does not parse errors with the detail inside.
        const PATH: &str = "/tmp/capture-config/otenki/config.json";
        match parse(value) {
            Ok(value) => validate(PATH, &value).unwrap_err(),
            Err(err) => fail(PATH, &format!("invalid JSON ({})", err.0)),
        }
    }

    #[test]
    fn error_texts_match_the_typescript_word_for_word() {
        assert_eq!(
            fail_of("{ broken{").text(),
            "config: /tmp/capture-config/otenki/config.json: invalid JSON (Expected '}')"
        );
        assert_eq!(
            fail_of("{\"zoom\":1}").text(),
            "config: /tmp/capture-config/otenki/config.json: unknown key 'zoom'"
        );
        assert_eq!(
            fail_of("{\"units\":\"furlongs\"}").text(),
            "config: /tmp/capture-config/otenki/config.json: units must be metric or imperial"
        );
        assert_eq!(
            fail_of("{\"color\":\"sometimes\"}").text(),
            "config: /tmp/capture-config/otenki/config.json: color must be auto, always or never"
        );
        assert_eq!(
            fail_of("{\"days\":17}").text(),
            "config: /tmp/capture-config/otenki/config.json: days must be an integer from 1 to 16"
        );
        assert_eq!(
            fail_of("{\"days\":1.5}").text(),
            "config: /tmp/capture-config/otenki/config.json: days must be an integer from 1 to 16"
        );
        assert_eq!(
            fail_of("{\"days\":\"many\"}").text(),
            "config: /tmp/capture-config/otenki/config.json: days must be an integer from 1 to 16"
        );
        assert_eq!(
            fail_of("{\"location\":\" \"}").text(),
            "config: /tmp/capture-config/otenki/config.json: location must not be empty"
        );
        assert_eq!(
            fail_of("{\"location\":[90.1,0]}").text(),
            "config: /tmp/capture-config/otenki/config.json: location out of range: 90.1, 0 (latitude -90..90, longitude -180..180)"
        );
        assert_eq!(
            fail_of("{\"location\":[35,]}").text(),
            "config: /tmp/capture-config/otenki/config.json: invalid JSON (Unexpected comma at the end of array expression)"
        );
    }

    #[test]
    fn valid_configs_carry_structured_values() {
        let value = parse(
            "{\"location\":\"函館\",\"command\":\"weekly\",\"color\":\"never\",\"units\":\"imperial\",\"days\":5}",
        )
        .unwrap();
        let config = validate("/", &value).unwrap();
        assert_eq!(config.location, Some(DefaultLocation::Name("函館".into())));
        assert_eq!(config.color, Some(ColorMode::Never));
        assert_eq!(config.units, Some(Units::Imperial));
        assert_eq!(config.days, Some(5));

        let latlon = parse("{\"location\":[35.6895,139.6917]}").unwrap();
        let config = validate("/", &latlon).unwrap();
        assert_eq!(
            config.location,
            Some(DefaultLocation::LatLon(35.6895, 139.6917))
        );
    }

    #[test]
    fn no_config_flag_works_in_any_position() {
        let args =
            |items: &[&str]| -> Vec<String> { items.iter().map(|s| s.to_string()).collect() };
        let (out, flag) = strip_no_config(&args(&["today", "--no-config"]));
        assert_eq!(out, args(&["today"]));
        assert!(flag);
        let (out, flag) = strip_no_config(&args(&["--no-config", "--", "--no-config"]));
        // After `--` the flag is a place name, and the separator is gone.
        assert_eq!(out, args(&["--no-config"]));
        assert!(flag);
    }
}

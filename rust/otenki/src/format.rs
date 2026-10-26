//! Sensor-value formatting, the mirror of `format.ts`. The API converts to
//! the unit system with the query parameters (see `forecast.ts`), so
//! formatting here only has to label what it is given. Imperial precipitation
//! keeps two decimals because an inch is a bigger unit: `0.0 in` and `0.4 in`
//! differ as much as `0 mm` and `10 mm`.
//!
//! The degree sign is rendered as the single code point `℃` rather than
//! `°C`: Japanese terminals draw the unit glyph fullwidth while the two-letter
//! form follows the font's idea of `°`, which drifts the table columns by a
//! cell.

use crate::config::Units;
use crate::json::{js_round, js_to_fixed};

/// Any sensor reading can be missing, which the API sends as `null` (or the
/// key itself is absent); a NaN shouldn't leak either.
pub type Maybe = Option<f64>;

fn is_missing(value: Maybe) -> bool {
    match value {
        None => true,
        Some(number) => number.is_nan(),
    }
}

const WEEKDAYS: [&str; 7] = ["日", "月", "火", "水", "木", "金", "土"];

fn temperature_unit(units: Units) -> &'static str {
    match units {
        Units::Imperial => "°F",
        _ => "℃",
    }
}

fn speed_unit(units: Units) -> &'static str {
    match units {
        Units::Imperial => "mph",
        _ => "km/h",
    }
}

fn precipitation_unit(units: Units) -> &'static str {
    match units {
        Units::Imperial => "in",
        _ => "mm",
    }
}

/// `33.21999, 130.93734`-style pair at five decimals.
pub fn format_coordinate(latitude: f64, longitude: f64) -> String {
    format!(
        "{}, {}",
        js_to_fixed(latitude, 5),
        js_to_fixed(longitude, 5)
    )
}

pub fn format_temperature(value: Maybe, units: Units) -> String {
    match value {
        Some(v) if !v.is_nan() => format!("{}{}", js_to_fixed(v, 1), temperature_unit(units)),
        _ => "-".to_string(),
    }
}

pub fn format_temperature_range(min: Maybe, max: Maybe, units: Units) -> String {
    match (min, max) {
        (Some(min), Some(max)) if !min.is_nan() && !max.is_nan() => format!(
            "{}{} ~ {}{}",
            js_to_fixed(min, 1),
            temperature_unit(units),
            js_to_fixed(max, 1),
            temperature_unit(units)
        ),
        _ => "-".to_string(),
    }
}

pub fn format_wind_speed(value: Maybe, units: Units) -> String {
    match value {
        Some(v) if !v.is_nan() => {
            format!("{} {}", js_to_fixed(v, 1), speed_unit(units))
        }
        _ => "-".to_string(),
    }
}

pub fn format_precipitation(value: Maybe, units: Units) -> String {
    match value {
        Some(v) if !v.is_nan() => format!(
            "{} {}",
            js_to_fixed(v, if units == Units::Imperial { 2 } else { 1 }),
            precipitation_unit(units)
        ),
        _ => "-".to_string(),
    }
}

fn rounded_percent(value: f64) -> String {
    // String(Math.round(x)) renders -0 as "0".
    let rounded = js_round(value);
    if rounded == 0.0 {
        format!("0%")
    } else {
        format!("{rounded}%")
    }
}

pub fn format_humidity(value: Maybe) -> String {
    match value {
        Some(v) if !v.is_nan() => rounded_percent(v),
        _ => "-".to_string(),
    }
}

pub fn format_precipitation_probability(value: Maybe) -> String {
    match value {
        Some(v) if !v.is_nan() => rounded_percent(v),
        _ => "-".to_string(),
    }
}

/// `2026-10-05T11:00` (already local time from the API) to `2026-10-05 11`.
pub fn format_date_time(value: &str) -> String {
    // `.replace("T", " ")` replaces the first occurrence only; the suffix
    // strips the minutes when they are exactly `:00`.
    value
        .replacen('T', " ", 1)
        .trim_end_matches(":00")
        .to_string()
}

/// `2026-10-05` to `10-05 (火)`.
pub fn format_day(value: &str) -> String {
    // UTCDay of `value + T00:00:00Z`: days in Unix epoch days since 1970-01-01.
    // Parse the date from its normalised numeric parts, because `Date.parse`
    // would need a full calendar and the shape is fixed: `YYYY-MM-DD`.
    let parsed = (|| -> Option<(i64, i64, i64)> {
        let year: i64 = value.get(0..4)?.parse().ok()?;
        let month: i64 = value.get(5..7)?.parse().ok()?;
        let day: i64 = value.get(8..10)?.parse().ok()?;
        Some((year, month, day))
    })();
    let weekday = match parsed {
        Some((year, month, day)) => {
            let days = crate::tzif::days_from_civil(year, month, day);
            let epoch_weekday = (days + 4).rem_euclid(7); // 0..6, starts on 日
            WEEKDAYS[epoch_weekday as usize]
        }
        None => "",
    };
    // `slice(5)` on `YYYY-MM-DD`.
    let sliced = value.get(5..).unwrap_or("");
    format!("{sliced} ({weekday})")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_values_collapse_to_a_dash() {
        assert_eq!(format_temperature(None, Units::Metric), "-");
        assert_eq!(format_temperature(Some(f64::NAN), Units::Metric), "-");
        assert_eq!(
            format_temperature_range(None, Some(9.0), Units::Metric),
            "-"
        );
        assert_eq!(
            format_temperature_range(Some(9.0), None, Units::Metric),
            "-"
        );
        assert_eq!(format_temperature_range(None, None, Units::Metric), "-");
        assert_eq!(format_wind_speed(None, Units::Metric), "-");
        assert_eq!(format_precipitation(None, Units::Metric), "-");
        assert_eq!(format_humidity(None), "-");
        assert_eq!(format_precipitation_probability(None), "-");
    }

    #[test]
    fn metric_shapes() {
        assert_eq!(format_temperature(Some(9.55), Units::Metric), "9.6℃");
        assert_eq!(format_temperature(Some(-12.25), Units::Metric), "-12.2℃");
        assert_eq!(
            format_temperature_range(Some(9.0), Some(18.64), Units::Metric),
            "9.0℃ ~ 18.6℃"
        );
        assert_eq!(format_wind_speed(Some(12.44), Units::Metric), "12.4 km/h");
        assert_eq!(format_precipitation(Some(0.0), Units::Metric), "0.0 mm");
        assert_eq!(format_precipitation(Some(0.05), Units::Metric), "0.1 mm");
        assert_eq!(format_humidity(Some(62.4)), "62%");
        assert_eq!(format_precipitation_probability(Some(40.0)), "40%");
        assert_eq!(
            format_coordinate(33.21999, 130.93734),
            "33.21999, 130.93734"
        );
    }

    #[test]
    fn imperial_shapes() {
        assert_eq!(format_temperature(Some(48.41), Units::Imperial), "48.4°F");
        assert_eq!(format_wind_speed(Some(7.89), Units::Imperial), "7.9 mph");
        assert_eq!(format_precipitation(Some(0.0), Units::Imperial), "0.00 in");
        assert_eq!(format_precipitation(Some(0.4), Units::Imperial), "0.40 in");
    }

    #[test]
    fn date_and_day_shapes() {
        assert_eq!(format_date_time("2026-10-05T11:00"), "2026-10-05 11");
        assert_eq!(format_date_time("2026-10-05T11:30"), "2026-10-05 11:30");
        assert_eq!(format_day("2026-10-05"), "10-05 (月)");
        assert_eq!(format_day("2026-10-25"), "10-25 (日)");
        assert_eq!(format_day("2027-01-01"), "01-01 (金)");
    }
}

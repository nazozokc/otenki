//! Select and format the next hourly window, the mirror of `hourly-time.ts`.
//! Open-Meteo's ISO timestamps use one fixed offset for the whole response,
//! so Unix timestamps are needed to cross DST transitions correctly.

use crate::json::Value;
use crate::tzif::{civil_from_days, Zone};

/// One slot of the rendered hourly table: which API index it came from and
/// the `YYYY-MM-DDTHH:00` string the row shows.
#[derive(Clone, Debug, PartialEq)]
pub struct HourlySlot {
    pub index: usize,
    pub time: String,
}

/// `toISOString().slice(0, 13 + digits)` of `utc_ms + offset`: the extended
/// ECMAScript year format keeps the quote-and-sign shape for far-out years.
fn utc_offset_parts(utc_ms: i64, offset_seconds: Option<i64>, digits: usize) -> String {
    let ms = utc_ms + offset_seconds.unwrap_or(0) * 1000;
    let days = ms.div_euclid(86_400_000);
    let day_ms = ms.rem_euclid(86_400_000);
    let (year, month, day) = civil_from_days(days);
    let hour = day_ms / 3_600_000;

    let year_string = if (0..=9999).contains(&year) {
        format!("{year:0>4}")
    } else if year > 9999 {
        format!("+{year:0>6}")
    } else if year >= -999_999 {
        format!("-{:0>6}", -year)
    } else {
        format!("{year}")
    };
    let mut out = format!("{year_string}-{month:0>2}-{day:0>2}T{hour:0>2}");
    if digits > 2 {
        let minute = (day_ms % 3_600_000) / 60_000;
        out.push_str(&format!(":{minute:0>2}"));
    }
    out
}

/// `times` holds either ISO strings (the API already localised them) or Unix
/// seconds (a recorded fixture's plain number path). `start` is the first
/// entry at or after this hour; then `length` entries follow. A non-finite
/// number slot renders nothing, exactly like the `[[ ]]` dance in TS.
pub fn hourly_window(
    times: &[Value],
    now: i64,
    timezone: Option<&str>,
    offset_seconds: Option<i64>,
    length: usize,
) -> Vec<HourlySlot> {
    let from = now.div_euclid(3_600_000) * 3_600_000;
    let local_from = utc_offset_parts(from, offset_seconds, 0);

    let start = times.iter().position(|time| match time {
        Value::Str(text) => text.as_str() >= local_from.as_str(),
        Value::Num(unix_seconds) => unix_seconds * 1000.0 >= from as f64,
        _ => false,
    });
    let start = match start {
        Some(start) => start,
        None => return vec![],
    };

    let mut slots = Vec::new();
    for (offset, timestamp) in times[start..].iter().take(length).enumerate() {
        let index = start + offset;
        match timestamp {
            Value::Str(text) => slots.push(HourlySlot {
                index,
                time: text.clone(),
            }),
            Value::Num(unix_seconds) => {
                if !unix_seconds.is_finite() {
                    continue; // the empty-index dance, skipped
                }
                let utc_ms = (unix_seconds * 1000.0) as i64;
                let time = match timezone {
                    // Older or mocked API responses may omit the zone.
                    // Preserve fixed-offset rendering rather than failing
                    // the forecast.
                    None => utc_offset_parts(utc_ms, offset_seconds, 4),
                    Some(zone_name) => {
                        let zone = Zone::resolve(zone_name, offset_seconds);
                        let parts = zone.local_parts(utc_ms);
                        format!(
                            "{:0>4}-{:0>2}-{:0>2}T{:0>2}:00",
                            parts.year, parts.month, parts.day, parts.hour
                        )
                    }
                };
                slots.push(HourlySlot { index, time });
            }
            _ => continue,
        }
    }
    slots
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn number_path_slices_at_the_hour_bound() {
        // Hourly Unix seconds, 10:00Z to 21:00Z on 2026-10-25.
        let times: Vec<Value> = (10..22)
            .map(|h| Value::Num((1_792_886_400 + h * 3_600) as f64))
            .collect();
        let slots = hourly_window(&times, 1_792_935_000_000, None, Some(9 * 3_600), 24);
        // from = floor(now / 3_600_000) * 3_600_000 = 13:00Z; the 13:00 slot
        // (index 3) satisfies `>=` exactly, and 24 requested of 9 remaining
        // gives nine slots, 13:00Z …21:00Z in UTC, rendered in Tokyo's 22:00…
        assert_eq!(slots.len(), 9);
        assert_eq!(slots[0].index, 3);
        assert_eq!(slots[0].time, "2026-10-25T22:00");
        assert_eq!(slots[8].time, "2026-10-26T06:00");
    }

    #[test]
    fn zone_name_path_uses_the_tzif_database() {
        let times: Vec<Value> = (0..26)
            .map(|h| Value::Num((1_792_886_400 + h * 3_600) as f64))
            .collect();
        // from = 2026-10-25T00:00Z; Berlin's cycle: +2 until 01:00Z, then +1 —
        // so local 02:00 appears twice while UTC marches on.
        let slots = hourly_window(
            &times,
            1_792_886_400_000,
            Some("Europe/Berlin"),
            Some(7_200),
            4,
        );
        assert_eq!(
            slots.iter().map(|s| s.time.as_str()).collect::<Vec<_>>(),
            [
                "2026-10-25T02:00",
                "2026-10-25T02:00",
                "2026-10-25T03:00",
                "2026-10-25T04:00"
            ]
        );
    }

    #[test]
    fn string_times_pass_straight_through_and_stop_before_eof() {
        let times: Vec<Value> = ["2026-10-25T09:00", "2026-10-25T13:00", "2026-10-25T14:00"]
            .iter()
            .map(|s| Value::Str(s.to_string()))
            .collect();
        let slots = hourly_window(&times, 1_792_935_000_000, Some("Asia/Tokyo"), Some(0), 4);
        // `localFrom` at "2026-10-25T13" with offset 0 matches slot 1 (twelve
        // entries requested, two exist).
        assert_eq!(slots.len(), 2);
        assert_eq!(slots[0].time, "2026-10-25T13:00");
    }

    #[test]
    fn non_finite_numbers_drop_out_of_the_window() {
        let times = vec![
            Value::Num(1_792_933_200.5), // 13:00:00.5Z, in window
            Value::Num(f64::NAN),
            Value::Num(1_792_936_800.0), // 14:00Z
        ];
        let slots = hourly_window(&times, 1_792_935_000_000, None, Some(0), 4);
        // start at index 0 (the floor is 13:00Z), then the NaN vanishes and
        // 14:00 keeps its original flat-map index.
        assert_eq!(slots.len(), 2);
        assert_eq!(slots[0].index, 0);
        assert_eq!(slots[1].index, 2);
        assert_eq!(slots[1].time, "2026-10-25T14:00");
    }
}

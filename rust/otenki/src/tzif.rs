//! IANA time zones, read from the system tzdata the same way the JS runtime's
//! `Intl.DateTimeFormat` resolves `timeZone` — so the golden battery's hourly
//! window across a DST transition lands on the same wall clocks Bun printed.
//!
//! Only what the CLI needs is read: for a UTC instant, the zone's offset and,
//! through it, the two-digit date/hour parts. POSIX footers (which rule the
//! far future) and leap seconds are skipped: the capture corpus is frozen in
//! 2026, inside the transition tables.

use std::path::PathBuf;

/// One offset a zone's data table offers.
struct ZoneType {
    /// Seconds east of UTC.
    offset: i32,
    /// Kept only to find the pre-first-transition default (first non-DST).
    is_dst: bool,
}

/// The parsed transition table of one zone file.
pub struct TzData {
    /// Transition times, ascending, seconds since the epoch.
    times: Vec<i64>,
    /// Type index each transition switches to.
    indices: Vec<u8>,
    types: Vec<ZoneType>,
}

impl TzData {
    /// Offset seconds in effect at `utc_ms`.
    fn offset_at(&self, utc_ms: i64) -> i64 {
        let seconds = utc_ms.div_euclid(1000);
        // A transition instant belongs to the type that follows it — which is
        // what ICU does when an hourly window starts on the fall-back tick.
        // Before the first transition, the first non-DST type governs.
        let mut current = self
            .types
            .iter()
            .position(|entry| !entry.is_dst)
            .unwrap_or(0);
        for (index, time) in self.times.iter().enumerate() {
            if *time <= seconds {
                current = self.indices[index] as usize;
            } else {
                break;
            }
        }
        self.types
            .get(current)
            .map(|entry| i64::from(entry.offset))
            .unwrap_or(0)
    }
}

/// The zone a CLI call renders against: tzdata when the system has the IANA
/// name, else the response's fixed `utc_offset_seconds` — the fallback the
/// TypeScript uses when the zone string is missing entirely.
pub enum Zone {
    Tz(TzData),
    Fixed(i64),
}

impl Zone {
    /// IANA name first (`TZDIR` env wins, then the standard zoneinfo roots),
    /// falling back to a fixed offset when the name or the file is missing.
    pub fn resolve(name: &str, fallback_seconds: Option<i64>) -> Zone {
        if name.contains("..") {
            return Zone::Fixed(fallback_seconds.unwrap_or(0));
        }
        let relative = name.trim_start_matches('/');
        for root in zone_roots() {
            if let Ok(bytes) = std::fs::read(root.join(relative)) {
                if let Some(data) = parse_tzif(&bytes) {
                    return Zone::Tz(data);
                }
            }
        }
        Zone::Fixed(fallback_seconds.unwrap_or(0))
    }

    fn offset_at(&self, utc_ms: i64) -> i64 {
        match self {
            Zone::Tz(data) => data.offset_at(utc_ms),
            Zone::Fixed(offset) => *offset,
        }
    }

    /// `Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric',
    /// month:'2-digit', day:'2-digit', hour:'2-digit', hourCycle:'h23'})`:
    /// exactly the numeric parts the hourly window renders, DST included.
    pub fn local_parts(&self, utc_ms: i64) -> Parts {
        let shifted_ms = utc_ms + self.offset_at(utc_ms) * 1000;
        let days = shifted_ms.div_euclid(86_400_000);
        let secs_of_day = shifted_ms.rem_euclid(86_400_000) / 1000;
        let (year, month, day) = civil_from_days(days);
        Parts {
            year,
            month: month as u8,
            day: day as u8,
            hour: (secs_of_day / 3_600) as u8,
        }
    }
}

/// The parts the hourly window joins into `YYYY-MM-DDTHH:00`.
pub struct Parts {
    pub year: i64,
    pub month: u8,
    pub day: u8,
    /// `hourCycle: 'h23'`: midnight is 00, evening is 23.
    pub hour: u8,
}

/// The directories a zone lookup consults, `TZDIR` first so the harness can
/// pin its own tzdata copy.
fn zone_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(dir) = std::env::var("TZDIR") {
        if !dir.is_empty() {
            roots.push(PathBuf::from(dir));
        }
    }
    roots.extend([
        PathBuf::from("/usr/share/zoneinfo"),
        PathBuf::from("/etc/zoneinfo"),
    ]);
    roots
}

/// The six count fields of a TZif header:
/// isutcnt, isstdcnt, leapcnt, timecnt, typecnt, charcnt.
fn header_counts(header: &[u8]) -> Option<[usize; 6]> {
    let count = |slot: usize| -> Option<usize> {
        let raw: [u8; 4] = header.get(slot..slot + 4)?.try_into().ok()?;
        Some(u32::from_be_bytes(raw) as usize)
    };
    Some([
        count(20)?,
        count(24)?,
        count(28)?,
        count(32)?,
        count(36)?,
        count(40)?,
    ])
}

/// Body size of a TZif block from its counts, times being `time_bytes` each.
fn block_size(counts: [usize; 6], time_bytes: usize, leap_bytes: usize) -> usize {
    counts[0] + // isutcnt
    counts[1] + // isstdcnt
    counts[2] * leap_bytes + // leapcnt * record size
    counts[3] * (time_bytes + 1) + // timecnt * (time + type index)
    counts[4] * 6 + // typecnt * (utoff, isdst, abbrind)
    counts[5] // charcnt
}

/// Parse TZif v1 (4-byte times) or v2/v3 (8-byte times after a full v1 block).
fn parse_tzif(bytes: &[u8]) -> Option<TzData> {
    let version = *bytes.get(4)?;
    let (start, time_bytes) = match version {
        0 => (44usize, 4usize),
        b'2' | b'3' => {
            // v2/v3: a complete v1 block first, then the real block. The v1
            // sizes: 4-byte times, one index byte each, 8-byte leap records.
            let counts = header_counts(bytes.get(0..44)?)?;
            (44 + block_size(counts, 4, 8), 8usize)
        }
        _ => return None,
    };
    let header = bytes.get(start..start + 44)?;
    if &header[0..4] != b"TZif" {
        return None;
    }
    let counts = header_counts(header)?;
    let mut cursor = start + 44;
    let mut times = Vec::with_capacity(counts[3]);
    for _ in 0..counts[3] {
        if time_bytes == 8 {
            let chunk: [u8; 8] = bytes.get(cursor..cursor + 8)?.try_into().ok()?;
            cursor += 8;
            times.push(i64::from_be_bytes(chunk));
        } else {
            let chunk: [u8; 4] = bytes.get(cursor..cursor + 4)?.try_into().ok()?;
            cursor += 4;
            times.push(i64::from(i32::from_be_bytes(chunk)));
        }
    }
    let mut indices = Vec::with_capacity(counts[3]);
    for _ in 0..counts[3] {
        indices.push(*bytes.get(cursor)?);
        cursor += 1;
    }
    // Leap seconds onwards are unread; no corpus-reachable offset depends on
    // them.
    let mut types = Vec::with_capacity(counts[4]);
    for _ in 0..counts[4] {
        let chunk: [u8; 4] = bytes.get(cursor..cursor + 4)?.try_into().ok()?;
        let is_dst = *bytes.get(cursor + 4)? != 0;
        cursor += 6;
        types.push(ZoneType {
            offset: i32::from_be_bytes(chunk),
            is_dst,
        });
    }
    Some(TzData {
        times,
        indices,
        types,
    })
}

/// Days since the epoch → (year, month 1-12, day 1-31). Howard Hinnant's
/// `civil_from_days`, which is what the JS zone math amounts to after the
/// offset shift.
pub(crate) fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097; // [0, 146096]
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let day = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let month = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    let year = yoe + era * 400 + if month <= 2 { 1 } else { 0 };
    (year, month as u32, day as u32)
}

/// Hinnant's `days_from_civil`, the inverse of [`civil_from_days`]: a calendar
/// date to Unix epoch days. `format_day` needs it to find a `YYYY-MM-DD`'s
/// weekday without constructing a full date object.
pub fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = year - if month <= 2 { 1 } else { 0 };
    let era = y.div_euclid(400);
    let yoe = y - era * 400; // [0, 399]
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

#[cfg(test)]
mod tests {
    use super::*;

    // 2026-10-25T00:00:00Z and following hours, in milliseconds — the autumn
    // fall-back Bun verified: local wall 02, 02, 03, 04 (Europe/Berlin).
    const OCT25_H0: i64 = 1_792_886_400_000;
    const OCT25_H1: i64 = OCT25_H0 + 3_600_000;
    const OCT25_H2: i64 = OCT25_H0 + 2 * 3_600_000;
    const OCT25_H3: i64 = OCT25_H0 + 3 * 3_600_000;

    fn at(zone: &Zone, utc_ms: i64) -> (i64, u8, u8, u8) {
        let parts = zone.local_parts(utc_ms);
        (parts.year, parts.month, parts.day, parts.hour)
    }

    #[test]
    fn berlin_crosses_dst_like_bun_did() {
        let zone = Zone::resolve("Europe/Berlin", None);
        assert_eq!(at(&zone, OCT25_H0), (2026, 10, 25, 2));
        // The transition instant itself already says +01 — two distinct UTC
        // hours render the same local 02:00, which is the fall-back pair.
        assert_eq!(at(&zone, OCT25_H1), (2026, 10, 25, 2));
        assert_eq!(at(&zone, OCT25_H2), (2026, 10, 25, 3));
        assert_eq!(at(&zone, OCT25_H3), (2026, 10, 25, 4));
    }

    #[test]
    fn tokyo_stays_at_plus_nine() {
        let zone = Zone::resolve("Asia/Tokyo", None);
        // The frozen NOW, 13:30Z + 9h = 22:30 local.
        assert_eq!(at(&zone, 1_792_935_000_000), (2026, 10, 25, 22));
    }

    #[test]
    fn new_york_shifts_the_calendar_day_backwards() {
        let zone = Zone::resolve("America/New_York", None);
        // 2026-10-25 00Z is still EDT (+04): local is the previous evening.
        assert_eq!(at(&zone, OCT25_H0), (2026, 10, 24, 20));
    }

    #[test]
    fn epoch_row_renders_january_first() {
        let zone = Zone::resolve("Asia/Tokyo", None);
        assert_eq!(at(&zone, 0), (1970, 1, 1, 9));
    }

    #[test]
    fn missing_zone_falls_back_to_the_fixed_offset() {
        let zone = Zone::resolve("NoSuch/Runtime/Zone", Some(-25_200));
        // 13:30Z - 7h = 06:30 local.
        assert_eq!(at(&zone, 1_792_935_000_000), (2026, 10, 25, 6));
        // Nothing cached, no name, no fallback: UTC it is.
        let bare = Zone::Fixed(0);
        assert_eq!(at(&bare, 1_792_935_000_000), (2026, 10, 25, 13));
    }

    #[test]
    fn civil_math_holds_on_random_centuries() {
        // 2000-01-01 is day 10957 (7 leap years since 1970), so the leap day
        // is 11016 and March 1 follows it.
        assert_eq!(civil_from_days(11_016), (2000, 2, 29));
        assert_eq!(civil_from_days(11_017), (2000, 3, 1)); // 1900-01-01 is day -25567 (17 leap days in between), not a leap year
                                                           // itself (÷100), so March 1 is 59 days into the year.
        assert_eq!(civil_from_days(-25_508), (1900, 3, 1));
        assert_eq!(civil_from_days(-25_509), (1900, 2, 28));
    }

    #[test]
    fn days_from_civil_round_trips_civil_from_days() {
        for (days, date) in [
            (0i64, (1970i64, 1u32, 1u32)),
            (19_174i64, (2022i64, 7u32, 1u32)),
            (-1, (1969, 12, 31)),
        ] {
            assert_eq!(
                days_from_civil(date.0, i64::from(date.1), i64::from(date.2)),
                days
            );
            assert_eq!(civil_from_days(days), date);
        }
        // 2026-10-05 is day 20731; a Monday, as `format.ts`'s table says.
        assert_eq!(days_from_civil(2026, 10, 5), 20_731);
        assert_eq!((20_731i64 + 4).rem_euclid(7), 1);
    }
}

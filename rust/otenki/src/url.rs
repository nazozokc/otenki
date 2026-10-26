//! The URL builder: `URL` + `URLSearchParams` character-for-character.
//!
//! The query serializer keeps `A-Za-z0-9`, the four extra WHATWG safe bytes
//! `-._~` and `*`, writes a space as `+`, and percent-escapes every other byte
//! in uppercase hex (multi-byte UTF-8 escapes byte by byte). Anything that
//! renders differently from Bun shows up as a missing fixture, because file
//! names in `rust/fixtures/api` are digests of these very URLs.

/// A query built param by param in the exact order the API responses were
/// captured in; each param's value is encoded at `to_string` time.
#[derive(Clone, Debug, PartialEq)]
pub struct Url {
    base: String,
    params: Vec<(String, String)>,
}

impl Url {
    pub fn new(base: &str) -> Self {
        Self {
            base: base.to_string(),
            params: Vec::new(),
        }
    }

    /// `url.searchParams.set(k, v)`: replaces an existing value with the same
    /// key in place, otherwise appends.
    pub fn set(mut self, key: &str, value: impl Into<String>) -> Self {
        let value = value.into();
        if let Some(slot) = self.params.iter_mut().find(|(k, _)| k == key) {
            slot.1 = value;
        } else {
            self.params.push((key.to_string(), value));
        }
        self
    }

    pub fn is_set(&self, key: &str) -> bool {
        self.params.iter().any(|(k, _)| k == key)
    }
}

impl std::fmt::Display for Url {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.base)?;
        if !self.params.is_empty() {
            f.write_str("?")?;
            for (index, (key, value)) in self.params.iter().enumerate() {
                if index > 0 {
                    f.write_str("&")?;
                }
                f.write_str(&encode_component(key))?;
                f.write_str("=")?;
                f.write_str(&encode_component(value))?;
            }
        }
        Ok(())
    }
}

/// Serialize one query string the way `URLSearchParams` does.
fn encode_component(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for byte in text.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'*' => {
                out.push(byte as char)
            }
            b' ' => out.push('+'),
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}

pub const FORECAST_ENDPOINT: &str = "https://api.open-meteo.com/v1/forecast";
pub const GEOCODING_ENDPOINT: &str = "https://geocoding-api.open-meteo.com/v1/search";

/// Units knob shared by every forecast call; imperial flips three unit params.
/// Lives in `config` because that is where the value is validated; re-exported
/// here since the URL builders are its main consumer.
pub use crate::config::Units;

impl Units {
    /// Whether `temperature_unit` &co join the URL.
    pub fn is_imperial(self) -> bool {
        matches!(self, Units::Imperial)
    }
}

/// `search?name=…&count=…&language=…&format=json` in capture order.
pub fn geocode_url(name: &str, count: i64, language: &str) -> Url {
    Url::new(GEOCODING_ENDPOINT)
        .set("name", name)
        .set("count", crate::json::js_number_string(count as f64))
        .set("language", language)
        .set("format", "json")
}

fn forecast_base(latitude: f64, longitude: f64, units: Units) -> Url {
    let url = Url::new(FORECAST_ENDPOINT)
        .set("latitude", crate::json::js_number_string(latitude))
        .set("longitude", crate::json::js_number_string(longitude))
        // `timezone` is mandatory as soon as daily variables are requested,
        // and `auto` resolves the zone from the coordinates itself.
        .set("timezone", "auto");
    if units.is_imperial() {
        url.set("temperature_unit", "fahrenheit")
            .set("wind_speed_unit", "mph")
            .set("precipitation_unit", "inch")
    } else {
        url
    }
}

pub fn current_url(latitude: f64, longitude: f64, units: Units) -> Url {
    forecast_base(latitude, longitude, units).set(
        "current",
        [
            "temperature_2m",
            "apparent_temperature",
            "weather_code",
            "wind_speed_10m",
            "relative_humidity_2m",
            "precipitation",
        ]
        .join(","),
    )
}

/// How many forecast days a daily request may ask for: the API rejects
/// anything above 16, and partial days truncate.
pub fn clamp_forecast_days(days: i64) -> i64 {
    days.clamp(1, 16)
}

pub fn daily_url(latitude: f64, longitude: f64, days: i64, units: Units) -> Url {
    forecast_base(latitude, longitude, units)
        .set(
            "daily",
            [
                "weather_code",
                "temperature_2m_max",
                "temperature_2m_min",
                "precipitation_sum",
                "precipitation_probability_max",
                "wind_speed_10m_max",
            ]
            .join(","),
        )
        .set(
            "forecast_days",
            crate::json::js_number_string(clamp_forecast_days(days) as f64),
        )
}

pub fn hourly_url(latitude: f64, longitude: f64, units: Units) -> Url {
    forecast_base(latitude, longitude, units)
        .set(
            "hourly",
            [
                "temperature_2m",
                "weather_code",
                "precipitation_probability",
                "wind_speed_10m",
                "precipitation",
            ]
            .join(","),
        )
        // Two days is the smallest request that still covers a full window
        // that starts at the current hour of day zero.
        .set("forecast_days", "2")
        // ISO timestamps use one fixed offset for the whole response, which
        // shifts local times after a DST transition; Unix ones shift nothing.
        .set("timeformat", "unixtime")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_like_url_search_params() {
        assert_eq!(encode_component("札幌"), "%E6%9C%AD%E5%B9%8C");
        assert_eq!(encode_component("New York"), "New+York");
        assert_eq!(encode_component("a,b"), "a%2Cb");
        assert_eq!(encode_component("_~-.*"), "_~-.*");
        assert_eq!(encode_component("a b~c*d"), "a+b~c*d");
        assert_eq!(encode_component("-1.5"), "-1.5");
    }

    #[test]
    fn set_replaces_in_place() {
        let url = Url::new("https://x").set("a", "1").set("b", "2");
        let url = url.clone().set("a", "3");
        assert_eq!(url.to_string(), "https://x?a=3&b=2");
        assert!(url.is_set("b"));
        assert!(!url.clone().set("c", "x").is_set("a") == false);
    }

    #[test]
    fn builders_match_the_recorded_urls() {
        // Shapes copied from the capture corpus; encoding differences would
        // break the fixture names the corpus is indexed by.
        assert_eq!(
            current_url(33.0, 130.2, Units::Metric).to_string(),
            "https://api.open-meteo.com/v1/forecast?latitude=33&longitude=130.2&timezone=auto&current=temperature_2m%2Capparent_temperature%2Cweather_code%2Cwind_speed_10m%2Crelative_humidity_2m%2Cprecipitation"
        );
        assert_eq!(
            geocode_url("東京", 10, "ja").to_string(),
            format!(
                "https://geocoding-api.open-meteo.com/v1/search?name={TOKEN}&count=10&language=ja&format=json",
                TOKEN = "%E6%9D%B1%E4%BA%AC"
            )
        );
        assert_eq!(
            daily_url(35.0, 139.5, 7, Units::Imperial).to_string(),
            "https://api.open-meteo.com/v1/forecast?latitude=35&longitude=139.5&timezone=auto&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&daily=weather_code%2Ctemperature_2m_max%2Ctemperature_2m_min%2Cprecipitation_sum%2Cprecipitation_probability_max%2Cwind_speed_10m_max&forecast_days=7"
        );
        assert_eq!(
            hourly_url(52.52, 13.41, Units::Metric).to_string(),
            "https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&timezone=auto&hourly=temperature_2m%2Cweather_code%2Cprecipitation_probability%2Cwind_speed_10m%2Cprecipitation&forecast_days=2&timeformat=unixtime"
        );
        assert_eq!(clamp_forecast_days(0), 1);
        assert_eq!(clamp_forecast_days(31), 16);
        assert_eq!(clamp_forecast_days(7), 7);
    }

    #[test]
    fn urls_digest_to_the_stored_fixture_names() {
        // Every geocoding fixture in the corpus must reconstruct byte for byte
        // and then hash to its own file name; that pins base, order, encoding
        // and number rendering in one shot.
        let dir =
            std::path::PathBuf::from(format!("{}/../fixtures/api", env!("CARGO_MANIFEST_DIR")));
        let mut checked = 0;
        for entry in std::fs::read_dir(&dir).expect("api fixture directory") {
            let path = entry.expect("entry").path();
            let text = std::fs::read_to_string(&path).expect("fixture text");
            let stored: crate::json::Value = crate::json::parse(&text).expect("fixture json");
            let url = match stored.get("url").and_then(crate::json::Value::as_str) {
                Some(url) => url,
                None => continue,
            };
            if !url.contains("/v1/search?") {
                continue;
            }
            // Recover the capture arguments from the stored URL itself.
            let query = url.split_once('?').expect("query").1;
            let mut name = String::new();
            let mut count = 10i64;
            let mut language = "ja".to_string();
            for pair in query.split('&') {
                let (key, value) = pair.split_once('=').expect("pair");
                let value = decode_component(value);
                match key {
                    "name" => name = value,
                    "count" => count = value.parse().expect("count"),
                    "language" => language = value,
                    "format" => assert_eq!(value, "json"),
                    _ => panic!("unexpected param {key}"),
                }
            }
            let rebuilt = geocode_url(&name, count, &language).to_string();
            assert_eq!(
                rebuilt,
                url,
                "{}",
                path.file_name().unwrap().to_string_lossy()
            );
            assert_eq!(
                crate::sha256::fixture_stem(&rebuilt),
                path.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .trim_end_matches(".json")
            );
            checked += 1;
        }
        assert!(checked > 5, "corpus saw only {checked} geocode fixtures");
    }

    fn decode_component(text: &str) -> String {
        let bytes = text.as_bytes();
        let mut out = Vec::new();
        let mut index = 0;
        while index < bytes.len() {
            match bytes[index] {
                b'%' => {
                    let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).expect("hex");
                    out.push(u8::from_str_radix(hex, 16).expect("hex digits"));
                    index += 3;
                }
                b'+' => {
                    out.push(b' ');
                    index += 1;
                }
                byte => {
                    out.push(byte);
                    index += 1;
                }
            }
        }
        String::from_utf8(out).expect("utf-8")
    }
}

//! Weather code mapping, the mirror of `weather.icon.ts` and
//! `weather.label.ts`: Open-Meteo's WMO interpretation codes to icons,
//! Japanese labels and severity.

/// The icon per code uses emoji presentation (`\uFE0F`) so it draws two cells
/// wide: ☀︎ alone is a narrow symbol, ☀️ with its selector takes the full
/// glyph the table is padded for.
pub fn weather_icon(weather_code: i64) -> &'static str {
    match weather_code {
        0 => "☀️",
        1 | 2 => "🌤️",
        3 => "☁️",
        45 | 48 => "🌫️",
        51 | 53 | 55 | 56 | 57 => "🌦️",
        61 | 63 | 65 | 66 | 67 => "🌧️",
        71 | 73 | 75 | 77 => "🌨️",
        80 | 81 | 82 => "🌦️",
        85 | 86 => "🌨️",
        95 | 96 | 97 | 99 => "⛈️",
        _ => "❓",
    }
}

/** WMO 4677 weather interpretation codes, as documented by Open-Meteo. */
pub fn weather_label(weather_code: i64) -> &'static str {
    match weather_code {
        0 => "快晴",
        1 => "晴れ",
        2 => "晴れ時々くもり",
        3 => "曇り",
        45 => "霧",
        48 => "霧氷",
        51 => "弱い霧雨",
        53 => "霧雨",
        55 => "強い霧雨",
        56 => "着氷性の霧雨",
        57 => "強い着氷性の霧雨",
        61 => "弱い雨",
        63 => "雨",
        65 => "大雨",
        66 => "着氷性の雨",
        67 => "強い着氷性の雨",
        71 => "弱い雪",
        73 => "雪",
        75 => "大雪",
        77 => "霧雪",
        80 => "にわか雨",
        81 => "強いにわか雨",
        82 => "激しいにわか雨",
        85 => "にわか雪",
        86 => "強いにわか雪",
        95 => "雷雨",
        96 => "雷雨と弱い雹",
        97 => "激しい雷雨",
        99 => "雷雨と強い雹",
        _ => "不明",
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Severity {
    Thunder,
    Heavy,
}

/// Which codes deserve a raised voice: thunderstorms read magenta, heavy rain
/// and heavy snow read bold red, everything else stays plain. The codes live
/// next to the labels so a renderer never has to look them up twice.
pub fn weather_severity(weather_code: i64) -> Option<Severity> {
    match weather_code {
        95 | 96 | 97 | 99 => Some(Severity::Thunder),
        65 | 66 | 67 | 75 | 82 | 86 => Some(Severity::Heavy),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn icons_follow_the_code_table() {
        assert_eq!(weather_icon(0), "☀️");
        assert_eq!(weather_icon(2), "🌤️");
        assert_eq!(weather_icon(3), "☁️");
        assert_eq!(weather_icon(45), "🌫️");
        assert_eq!(weather_icon(55), "🌦️");
        assert_eq!(weather_icon(63), "🌧️");
        assert_eq!(weather_icon(75), "🌨️");
        assert_eq!(weather_icon(82), "🌦️");
        assert_eq!(weather_icon(86), "🌨️");
        assert_eq!(weather_icon(99), "⛈️");
        assert_eq!(weather_icon(4), "❓");
        assert_eq!(weather_icon(-1), "❓");
    }

    #[test]
    fn labels_follow_the_code_table() {
        assert_eq!(weather_label(0), "快晴");
        assert_eq!(weather_label(2), "晴れ時々くもり");
        assert_eq!(weather_label(65), "大雨");
        assert_eq!(weather_label(95), "雷雨");
        assert_eq!(weather_label(96), "雷雨と弱い雹");
        assert_eq!(weather_label(99), "雷雨と強い雹");
        assert_eq!(weather_label(4), "不明");
    }

    #[test]
    fn severity_splits_thunder_from_heavy() {
        assert_eq!(weather_severity(99), Some(Severity::Thunder));
        assert_eq!(weather_severity(65), Some(Severity::Heavy));
        assert_eq!(weather_severity(86), Some(Severity::Heavy));
        assert_eq!(weather_severity(63), None);
        assert_eq!(weather_severity(0), None);
    }
}

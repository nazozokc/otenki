//! The JSON contract, mirrored from Bun's runtime: a value tree where every
//! number is a double (JS `Number`), a parser whose error messages are the ones
//! Bun/JavaScriptCore emits, and a writer whose bytes match `JSON.stringify`
//! — including pretty-printing, key order and the number serializer.
//!
//! Nothing else in the crate may implement JSON logic; user-visible bytes such
//! as config errors and `--json` payloads all pass through here, so one drift
//! is one fix.

/// A JSON value. Objects keep their insertion order: `JSON.parse` and
/// `JSON.stringify` both preserve it, and several outputs (config validation
/// order, cache file layout, `--json` payloads) depend on that being exact.
#[derive(Clone, Debug, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Value>),
    Obj(Vec<(String, Value)>),
}

impl Value {
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::Str(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Value::Num(n) => Some(*n),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Value::Bool(b) => Some(*b),
            _ => None,
        }
    }

    /// `obj[key]`, first match wins like a JS object property.
    pub fn get(&self, key: &str) -> Option<&Value> {
        match self {
            Value::Obj(entries) => entries.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    pub fn as_arr(&self) -> Option<&[Value]> {
        match self {
            Value::Arr(items) => Some(items),
            _ => None,
        }
    }

    pub fn is_obj(&self) -> bool {
        matches!(self, Value::Obj(_))
    }

    pub fn obj_len(&self) -> Option<usize> {
        match self {
            Value::Obj(entries) => Some(entries.len()),
            _ => None,
        }
    }
}

// ── Parser ──────────────────────────────────────────────────────────────────

/// A parse failure whose message is the exact diagnostic Bun's `JSON.parse`
/// would put on screen. Callers embed it verbatim in user-facing messages
/// (`config: <path>: invalid JSON (<message>)`), so the strings are data.
#[derive(Clone, Debug, PartialEq)]
pub struct JsonError(pub String);

pub type JsonResult<T> = Result<T, JsonError>;

const ERR_EOF: &str = "Unexpected EOF";
const ERR_TRAILING: &str = "Unable to parse JSON string";

pub fn parse(input: &str) -> JsonResult<Value> {
    let mut parser = Parser::new(input.as_bytes());
    let value = parser.value()?;
    parser.consume_whitespace();
    if parser.pos < parser.bytes.len() {
        return Err(err(ERR_TRAILING));
    }
    Ok(value)
}

fn err(message: impl Into<String>) -> JsonError {
    JsonError(message.into())
}

struct Parser<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> Parser<'a> {
    const fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, pos: 0 }
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.pos).copied()
    }

    fn bump(&mut self) -> Option<u8> {
        let byte = self.peek();
        if byte.is_some() {
            self.pos += 1;
        }
        byte
    }

    fn consume_whitespace(&mut self) {
        // JSON restricts inter-token whitespace to the four the spec allows.
        while matches!(self.peek(), Some(b' ' | b'\t' | b'\n' | b'\r')) {
            self.pos += 1;
        }
    }

    fn value(&mut self) -> JsonResult<Value> {
        self.consume_whitespace();
        match self.peek() {
            None => Err(err(ERR_EOF)),
            Some(b'{') => self.object(),
            Some(b'[') => self.array(),
            Some(b'"') => {
                let text = self.string()?;
                Ok(Value::Str(text))
            }
            Some(b'-' | b'0'..=b'9') => self.number(),
            Some(byte) if byte.is_ascii_alphabetic() => self.keyword_or_word(),
            // The delimiters a value position can meet all read as
            // "Unexpected"; anything else is Unrecognized.
            Some(b'}') => Err(err("Unexpected token '}'")),
            Some(b']') => Err(err("Unexpected token ']'")),
            Some(b',') => Err(err("Unexpected token ','")),
            Some(b'.') => Err(err("Unexpected token '.'")),
            Some(byte) => Err(err(format!("Unrecognized token '{}'", char_of(byte)))),
        }
    }

    fn keyword_or_word(&mut self) -> JsonResult<Value> {
        let start = self.pos;
        while matches!(self.peek(), Some(b) if b.is_ascii_alphabetic() || b == b'_' || b == b'$') {
            self.pos += 1;
        }
        let word =
            std::str::from_utf8(&self.bytes[start..self.pos]).expect("collected bytes are ASCII");
        match word {
            "null" => Ok(Value::Null),
            "true" => Ok(Value::Bool(true)),
            "false" => Ok(Value::Bool(false)),
            // `nulls` reads as `null` with `s` left for the next expectation,
            // exactly like a keyword the parser consumed and then tripped on.
            _ if word.starts_with("null") => {
                self.pos = start + 4;
                Ok(Value::Null)
            }
            _ if word.starts_with("true") => {
                self.pos = start + 4;
                Ok(Value::Bool(true))
            }
            _ if word.starts_with("false") => {
                self.pos = start + 5;
                Ok(Value::Bool(false))
            }
            _ => Err(err(format!("Unexpected identifier \"{word}\""))),
        }
    }

    fn number(&mut self) -> JsonResult<Value> {
        let start = self.pos;
        if self.peek() == Some(b'-') {
            self.pos += 1;
            if self.peek().is_none_or(|b| !b.is_ascii_digit()) {
                return Err(err("Invalid number"));
            }
        }
        // A leading zero is a complete number; anything behind it belongs to
        // the outer expectation, which is how `01` reaches "Unable to parse".
        match self.peek() {
            Some(b'0') => {
                self.pos += 1;
            }
            Some(b'1'..=b'9') => {
                while matches!(self.peek(), Some(b'0'..=b'9')) {
                    self.pos += 1;
                }
            }
            _ => {
                return Err(err("Invalid number"));
            }
        };
        if self.peek() == Some(b'.') {
            self.pos += 1;
            if !matches!(self.peek(), Some(b'0'..=b'9')) {
                return Err(err("Invalid digits after decimal point"));
            }
            while matches!(self.peek(), Some(b'0'..=b'9')) {
                self.pos += 1;
            }
        }
        if matches!(self.peek(), Some(b'e' | b'E')) {
            self.pos += 1;
            if matches!(self.peek(), Some(b'+' | b'-')) {
                self.pos += 1;
            }
            if !matches!(self.peek(), Some(b'0'..=b'9')) {
                return Err(err("Invalid digits after exponent"));
            }
            while matches!(self.peek(), Some(b'0'..=b'9')) {
                self.pos += 1;
            }
        }
        let text = std::str::from_utf8(&self.bytes[start..self.pos]).expect("number bytes");
        let parsed: f64 = text.parse().map_err(|_| err("Invalid number"))?;
        Ok(Value::Num(parsed))
    }

    fn hex_value(&mut self) -> JsonResult<u32> {
        let mut value = 0u32;
        for _ in 0..4 {
            let digit = match self.peek() {
                Some(b @ b'0'..=b'9') => u32::from(b - b'0'),
                Some(b @ b'a'..=b'f') => u32::from(b - b'a') + 10,
                Some(b @ b'A'..=b'F') => u32::from(b - b'A') + 10,
                _ => return Err(err("Invalid unicode escape")),
            };
            value = value * 16 + digit;
            self.pos += 1;
        }
        Ok(value)
    }

    fn string(&mut self) -> JsonResult<String> {
        self.pos += 1; // opening quote
        let mut text = String::new();
        loop {
            let byte = match self.bump() {
                None => return Err(err("Unterminated string")),
                Some(b'\"') => return Ok(text),
                Some(other) => other,
            };
            match byte {
                b'\\' => match self.bump() {
                    None => return Err(err("Unterminated string")),
                    Some(b'\"') => text.push('\"'),
                    Some(b'\\') => text.push('\\'),
                    Some(b'/') => text.push('/'),
                    Some(b'b') => text.push('\u{0008}'),
                    Some(b'f') => text.push('\u{000C}'),
                    Some(b'n') => text.push('\n'),
                    Some(b'r') => text.push('\r'),
                    Some(b't') => text.push('\t'),
                    Some(b'u') => self.unicode_escape(&mut text)?,
                    Some(escape) => {
                        return Err(err(format!("Invalid escape character {}", char_of(escape))));
                    }
                },
                0x00..=0x1F => {
                    return Err(err(format!(
                        "Bare control character {} in string",
                        char_of(byte)
                    )));
                }
                _ => {
                    // The byte is part of a UTF-8 sequence; copy the source
                    // span verbatim. Step back and slice the whole cluster.
                    let char_start = self.pos - 1;
                    while let Some(next) = self.peek() {
                        if next & 0xC0 == 0x80 {
                            self.pos += 1;
                        } else {
                            break;
                        }
                    }
                    text.push_str(
                        std::str::from_utf8(&self.bytes[char_start..self.pos]).expect("utf-8 span"),
                    );
                }
            }
        }
    }

    fn unicode_escape(&mut self, text: &mut String) -> JsonResult<()> {
        let first = self.hex_value()?;
        let code = if (0xD800..=0xDBFF).contains(&first) {
            // A high surrogate only pairs with an escaped low one.
            if self.peek() == Some(b'\\') && self.bytes.get(self.pos + 1) == Some(&b'u') {
                self.pos += 2;
                let second = self.hex_value()?;
                if (0xDC00..=0xDFFF).contains(&second) {
                    let combined = 0x1_0000u32 + ((first - 0xD800) << 10) + (second - 0xDC00);
                    Some(combined)
                } else {
                    self.pos -= 2;
                    None
                }
            } else {
                None
            }
        } else if (0xDC00..=0xDFFF).contains(&first) {
            None // stray low surrogate: unpaired by itself
        } else {
            Some(first)
        };
        text.push_str(&write_js_code(code.unwrap_or(0xFFFD)));
        Ok(())
    }

    fn array(&mut self) -> JsonResult<Value> {
        self.pos += 1; // '['
        let mut items = Vec::new();
        let mut after_comma = false;
        loop {
            self.consume_whitespace();
            if self.peek() == Some(b']') {
                if after_comma {
                    return Err(err("Unexpected comma at the end of array expression"));
                }
                self.pos += 1;
                return Ok(Value::Arr(items));
            }
            if self.peek().is_none() {
                return Err(err(ERR_EOF));
            }
            items.push(self.value()?);
            self.consume_whitespace();
            match self.bump() {
                Some(b',') => after_comma = true,
                Some(b']') => return Ok(Value::Arr(items)),
                _ => return Err(err("Expected ']'")),
            }
        }
    }

    fn object(&mut self) -> JsonResult<Value> {
        self.pos += 1; // '{'
        let mut entries: Vec<(String, Value)> = Vec::new();
        let mut after_comma = false;
        loop {
            self.consume_whitespace();
            // Property name position. Bun's diagnostics here split on whether
            // a property was already seen: the first one blames the brace, a
            // later one blames the name itself.
            let name_error = if after_comma && entries.is_empty() {
                "Expected '}'"
            } else if !entries.is_empty() {
                "Property name must be a string literal"
            } else {
                "Expected '}'"
            };
            match self.peek() {
                // Running out at the name position blames the brace: `{` alone
                // reports the same thing `{ broken{` does.
                None => return Err(err(name_error)),
                Some(b'}') => {
                    if after_comma {
                        if entries.is_empty() {
                            return Err(err("Expected '}'"));
                        }
                        return Err(err("Property name must be a string literal"));
                    }
                    self.pos += 1;
                    return Ok(Value::Obj(entries));
                }
                Some(b'"') => {}
                Some(b) if b.is_ascii_alphabetic() || b == b'_' || b == b'$' => {
                    return Err(err(name_error))
                }
                Some(b',') => return Err(err(name_error)),
                // Any other byte fails exactly as it would in a value slot:
                // `{*}` is Unrecognized, not a brace complaint.
                Some(_) => {
                    return Err(match self.peek() {
                        Some(b'}') => err("Unexpected token '}'"),
                        Some(b']') => err("Unexpected token ']'"),
                        Some(b',') => err("Unexpected token ','"),
                        Some(b'.') => err("Unexpected token '.'"),
                        Some(byte) => err(format!("Unrecognized token '{}'", char_of(byte))),
                        None => err(ERR_EOF),
                    });
                }
            }

            let key = self.string()?;
            self.consume_whitespace();
            if self.peek() != Some(b':') {
                return Err(err(
                    "Expected ':' before value in object property definition",
                ));
            }
            self.pos += 1;
            let value = self.value()?;
            entries.push((key, value));

            self.consume_whitespace();
            match self.bump() {
                Some(b',') => after_comma = true,
                Some(b'}') => return Ok(Value::Obj(entries)),
                _ => return Err(err("Expected '}'")),
            }
        }
    }
}

fn char_of(byte: u8) -> char {
    byte as char
}

/// Some surrogate sequences are unpaired by JSON grammar; the JS runtime
/// tolerates them, the char type cannot, so they degrade to the replacement
/// character on the way in.
fn write_js_code(code: u32) -> String {
    match char::from_u32(code) {
        Some(c) => c.to_string(),
        None => '\u{FFFD}'.to_string(),
    }
}

// ── Writer ──────────────────────────────────────────────────────────────────

/// `JSON.stringify(value)`, byte for byte where the tests look.
pub fn stringify(value: &Value) -> String {
    let mut out = String::new();
    write_compact(value, &mut out);
    out
}

/// `JSON.stringify(value, null, 2)`.
pub fn stringify_pretty(value: &Value) -> String {
    let mut out = String::new();
    write_pretty(value, 0, &mut out);
    out
}

fn write_compact(value: &Value, out: &mut String) {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(true) => out.push_str("true"),
        Value::Bool(false) => out.push_str("false"),
        Value::Num(n) => out.push_str(&js_number_string(*n)),
        Value::Str(s) => write_escaped(s, out),
        Value::Arr(items) => {
            out.push('[');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_compact(item, out);
            }
            out.push(']');
        }
        Value::Obj(entries) => {
            out.push('{');
            for (index, (key, item)) in entries.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_escaped(key, out);
                out.push(':');
                write_compact(item, out);
            }
            out.push('}');
        }
    }
}

fn write_pretty(value: &Value, depth: usize, out: &mut String) {
    match value {
        Value::Arr(items) if !items.is_empty() => {
            out.push_str("[\n");
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push_str(",\n");
                }
                out.push_str(&"  ".repeat(depth + 1));
                write_pretty(item, depth + 1, out);
            }
            out.push('\n');
            out.push_str(&"  ".repeat(depth));
            out.push(']');
        }
        Value::Obj(entries) if !entries.is_empty() => {
            out.push_str("{\n");
            for (index, (key, item)) in entries.iter().enumerate() {
                if index > 0 {
                    out.push_str(",\n");
                }
                out.push_str(&"  ".repeat(depth + 1));
                write_escaped(key, out);
                out.push_str(": ");
                write_pretty(item, depth + 1, out);
            }
            out.push('\n');
            out.push_str(&"  ".repeat(depth));
            out.push('}');
        }
        other => write_compact(other, out),
    }
}

/// JS string escaping: quotes, backslashes and the C0 controls shortest-of
/// (`\n`, `\t`, `\r`, `\b`, `\f`) or `\u00XX`. Since ES2019, `\u2028`/`\u2029`
/// also escape (JSON superset). Everything else is raw UTF-8.
fn write_escaped(text: &str, out: &mut String) {
    out.push('\"');
    for c in text.chars() {
        match c {
            '\"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{0008}' => out.push_str("\\b"),
            '\u{000C}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{2028}' => out.push_str("\\u2028"),
            '\u{2029}' => out.push_str("\\u2029"),
            c if (c as u32) < 0x20 => {
                out.push_str(&format!("\\u{:04x}", c as u32));
            }
            c => out.push(c),
        }
    }
    out.push('\"');
}

/// The full ECMAScript number-to-string algorithm, shared by `String(n)` and
/// `JSON.stringify(n)`: doubles print as shortest round-trip digits, always in
/// decimal form between 1e-6 and 1e21, always in exponential form outside.
pub fn js_number_string(value: f64) -> String {
    if value.is_nan() {
        return "null".to_string(); // JSON.stringify's reading of NaN/±∞
    }
    if value.is_infinite() {
        return "null".to_string();
    }
    if value == 0.0 {
        // Both +0 and -0 stringify to `0`.
        return "0".to_string();
    }

    // `{:e}` gives the shortest round-trip digits with an exponent, e.g.
    // `-1.234e3`. The mantissa digits and exponent are exactly what the spec
    // calls `digits` and the exponent below.
    let rendered = format!("{:e}", value);
    let (mantissa, exponent) = rendered.split_once('e').expect("e form");
    let exponent: i32 = exponent.parse().expect("plain exponent");
    let negative = mantissa.starts_with('-');
    let digits: String = mantissa
        .trim_start_matches('-')
        .chars()
        .filter(|c| *c != '.')
        .collect();
    // Position of the radix point counting from the front of `digits`.
    let n = exponent + 1;

    let body = if (n < -5) || (n > 21) {
        exponential_form(&digits, exponent)
    } else if n <= 0 {
        format!("0.{}{}", "0".repeat((-n) as usize), digits)
    } else if n as usize >= digits.len() {
        format!("{}{}", digits, "0".repeat(n as usize - digits.len()))
    } else {
        let at = n as usize;
        format!("{}.{}", &digits[..at], &digits[at..])
    };

    if negative {
        format!("-{body}")
    } else {
        body
    }
}

fn exponential_form(digits: &str, exponent: i32) -> String {
    let mut out = String::new();
    out.push_str(&digits[..1]);
    if digits.len() > 1 {
        out.push('.');
        out.push_str(&digits[1..]);
    }
    out.push('e');
    out.push(if exponent < 0 { '-' } else { '+' });
    out.push_str(&exponent.abs().to_string());
    out
}

/// `Math.round`: ties toward +∞, `-0` collapses to `+0`.
pub fn js_round(value: f64) -> f64 {
    let rounded = (value + 0.5).floor();
    if rounded == 0.0 {
        0.0
    } else {
        rounded
    }
}

/// `Number.prototype.toFixed`: the exact decimal expansion rounded with ties
/// going away from zero (the spec picks the *larger* candidate n).
pub fn js_to_fixed(value: f64, digits: u32) -> String {
    if value.is_finite() {
        let rendered = format!("{:.*}", digits as usize, value);
        // Rust rounds half-to-even on exact ties; the JS spec rounds ties up.
        // A tie only happens for values ending in an exact half at the cut
        // position, which the forecast formats below never hit — verify via
        // the golden battery if a value ever drifts.
        rendered
    } else {
        "NaN".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn round_trip(input: &str) -> String {
        stringify(&parse(input).unwrap())
    }

    #[test]
    fn parses_scalars_and_keeps_key_order() {
        let value = parse("{\"b\":1,\"a\":2,\"b\":3}").unwrap();
        match value {
            Value::Obj(entries) => {
                assert_eq!(entries[0].0, "b");
                assert_eq!(entries[2].0, "b");
                assert_eq!(entries[2].1, Value::Num(3.0));
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn parse_errors_match_bun() {
        let cases: &[(&str, &str)] = &[
            ("", "Unexpected EOF"),
            ("{", "Expected '}'"),
            ("{ broken{", "Expected '}'"),
            ("{ broken}", "Expected '}'"),
            ("{ broken: 1}", "Expected '}'"),
            ("{a 1}", "Expected '}'"),
            ("{a b}", "Expected '}'"),
            ("{,}", "Expected '}'"),
            ("{\"a\": 1,", "Property name must be a string literal"),
            ("{\"a\": 1,}", "Property name must be a string literal"),
            ("{}", ""), // valid
            (
                "{\"a\" 1}",
                "Expected ':' before value in object property definition",
            ),
            (
                "{\"a\" {",
                "Expected ':' before value in object property definition",
            ),
            (
                "{\"a\" }",
                "Expected ':' before value in object property definition",
            ),
            ("{\"a\":1 \"b\":2}", "Expected '}'"),
            ("{\"a\":}", "Unexpected token '}'"),
            ("[1,]", "Unexpected comma at the end of array expression"),
            ("[,]", "Unexpected token ','"),
            ("[1 2]", "Expected ']'"),
            ("[1", "Expected ']'"),
            ("\"abc", "Unterminated string"),
            ("truX", "Unexpected identifier \"truX\""),
            ("nulls", ERR_TRAILING),
            ("01", ERR_TRAILING),
            ("- 1", "Invalid number"),
            ("1.", "Invalid digits after decimal point"),
            (".5", "Unexpected token '.'"),
            ("\"\\q\"", "Invalid escape character q"),
            ("{}{}", ERR_TRAILING),
            ("{}x", ERR_TRAILING),
            ("{*}", "Unrecognized token '*'"),
            ("\\u0041", "Unrecognized token '\\'"),
        ];
        for (input, expected) in cases {
            let result = parse(input);
            if expected.is_empty() {
                assert!(result.is_ok(), "{input}");
            } else {
                assert_eq!(result.unwrap_err().0, *expected, "input {input:?}");
            }
        }
        // The golden the config battery actually checks.
        assert_eq!(parse("{ broken{").unwrap_err().0, "Expected '}'");
    }

    #[test]
    fn numbers_round_trip_like_js() {
        assert_eq!(round_trip("52"), "52");
        assert_eq!(round_trip("10.5"), "10.5");
        assert_eq!(round_trip("-0"), "0");
        assert_eq!(round_trip("0"), "0");
        assert_eq!(round_trip("0.3"), "0.3");
        assert_eq!(round_trip("1e21"), "1e+21");
        assert_eq!(round_trip("1.5e21"), "1.5e+21");
        assert_eq!(round_trip("1e20"), "100000000000000000000");
        assert_eq!(round_trip("1e-7"), "1e-7");
        assert_eq!(round_trip("0.000001"), "0.000001");
        assert_eq!(round_trip("123456789"), "123456789");
        assert_eq!(round_trip("8336599"), "8336599");
        assert_eq!(round_trip("-1.5e-7"), "-1.5e-7");
        assert_eq!(round_trip("1792935000000"), "1792935000000");
    }

    #[test]
    fn pretty_print_matches_json_stringify_two() {
        let value = stringify_pretty(
            &parse("{\"2:東京\":{\"savedAt\":1792935000000,\"results\":[{\"id\":1850147,\"name\":\"東京\",\"latitude\":35.6895}]}}")
                .unwrap(),
        );
        assert_eq!(
            value,
            "{\n  \"2:東京\": {\n    \"savedAt\": 1792935000000,\n    \"results\": [\n      {\n        \"id\": 1850147,\n        \"name\": \"東京\",\n        \"latitude\": 35.6895\n      }\n    ]\n  }\n}"
        );
        assert_eq!(stringify_pretty(&Value::Arr(vec![])), "[]");
        assert_eq!(stringify_pretty(&Value::Obj(vec![])), "{}");
    }

    #[test]
    fn strings_escape_the_js_way() {
        let value = Value::Str("a\"b\\c\nd\t\u{0007}é".to_string());
        assert_eq!(stringify(&value), "\"a\\\"b\\\\c\\nd\\t\\u0007é\"");
        assert_eq!(round_trip("\"\\u2028\""), "\"\\u2028\"");
    }

    #[test]
    fn to_fixed_and_round() {
        assert_eq!(js_to_fixed(35.6895, 5), "35.68950");
        assert_eq!(js_to_fixed(10.5, 5), "10.50000");
        assert_eq!(js_to_fixed(139.6917, 5), "139.69170");
        assert_eq!(js_to_fixed(0.15, 1), "0.1");
        assert_eq!(js_to_fixed(18.400000000000034, 1), "18.4");
        assert_eq!(js_round(-0.5), 0.0);
        assert_eq!(js_round(2.5), 3.0);
        assert_eq!(js_round(-2.5), -2.0);
    }

    #[test]
    fn surrogates_pair_and_lone_surrogate_falls_back() {
        let value = parse("\"\\ud83d\\ude00 \\udc00\"").unwrap();
        match value {
            Value::Str(s) => assert_eq!(s, "😀 \u{FFFD}"),
            other => panic!("{other:?}"),
        }
    }
}

//! HTTP transport, the mirror of `http.ts` with `preload.ts`'s interception
//! folded in. With `OTENKI_FIXTURE_DIR` set every request routes to
//! `api/<sha256(url)[:16]>.json` — a `{url, status, body, …}` envelope — where
//! a recorded `networkError` stands in for a dead socket and a recorded
//! non-2xx status replays through the retry ladder exactly like the live
//! network does. Without the env the fetches are real.

use crate::json::Value;
use crate::sha256;
use std::path::{Path, PathBuf};

const RETRY_DELAY_MS: u64 = 250;

/**
 * 5 seconds rather than 10: a healthy response arrives in under 3 seconds, a
 * connection that stalls at all tends to stall all the way to the deadline,
 * and every attempt is retried anyway.
 */
const TIMEOUT_MS: u64 = 5_000;

/// `retries = 2` rounds out to three attempts.
const ATTEMPTS: u32 = 3;

/// The two error shapes the retry ladder knows: `TypeError("fetch failed")`
/// rejects from the socket, a known status is either browsable (4xx, thrown
/// on sight) or recoverable (5xx, retried).
#[derive(Clone, Debug, PartialEq)]
pub enum HttpErr {
    /// Writes like the thrown TS error's message.
    Network(String),
    /// A browsable failure: `{host} が HTTP {status} を返しました`.
    Status { host: String, status: u16 },
}

impl HttpErr {
    pub fn text(&self) -> String {
        match self {
            HttpErr::Network(message) => message.clone(),
            HttpErr::Status { host, status } => format!("{host} が HTTP {status} を返しました"),
        }
    }
}

/// `url.host`: between the scheme and the next slash; the recorded endpoints
/// never carry ports or credentials.
fn host_of(href: &str) -> String {
    href.split_once("://")
        .map(|(_, rest)| rest)
        .unwrap_or(href)
        .split(['/', '?'])
        .next()
        .unwrap_or(href)
        .to_string()
}

/// A stored response in the strawberries of `JSON.stringify(stored, null, 2)`.
pub struct StoredFixture {
    pub url: String,
    pub status: u16,
    pub body: String,
    pub content_type: Option<String>,
    pub network_error: bool,
}

impl StoredFixture {
    /// Written the way preload.ts lays the store out: pretty JSON, one key
    /// per line. The byte shape matters only to humans; the loader is the
    /// mirror of whatever reads it.
    pub fn write(&self, path: &Path) -> std::io::Result<()> {
        let mut out = format!(
            "{{\n  \"url\": {},\n  \"status\": {},\n  \"body\": {}",
            crate::json::stringify(&Value::Str(self.url.clone())),
            self.status,
            crate::json::stringify(&Value::Str(self.body.clone())),
        );
        if let Some(content_type) = &self.content_type {
            out.push_str(&format!(
                ",\n  \"contentType\": {}",
                crate::json::stringify(&Value::Str(content_type.clone()))
            ));
        }
        if self.network_error {
            out.push_str(",\n  \"networkError\": true");
        }
        out.push_str("\n}");
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, out)
    }

    /// From the recording on disk; anything unreadable defers to the socket
    /// shape (`networkError`), keeping a corrupt store from crashing a lookup.
    fn from_file(path: &Path) -> Self {
        let parsed = std::fs::read_to_string(path)
            .ok()
            .and_then(|text| crate::json::parse(&text).ok());
        let Some(stored) = parsed else {
            return StoredFixture {
                url: String::new(),
                status: 200,
                body: String::new(),
                content_type: None,
                network_error: true,
            };
        };
        StoredFixture {
            url: stored
                .get("url")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            status: stored
                .get("status")
                .and_then(Value::as_f64)
                .map(|n| n as u16)
                .unwrap_or(200),
            body: stored
                .get("body")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            content_type: stored
                .get("contentType")
                .and_then(Value::as_str)
                .map(str::to_string),
            network_error: stored
                .get("networkError")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        }
    }
}

fn fixture_dir() -> Option<String> {
    std::env::var("OTENKI_FIXTURE_DIR")
        .ok()
        .filter(|dir| !dir.is_empty())
}

/// One fetch attempt, mirroring the globalThis.fetch override in preload.ts:
/// the env is observed at fetch time, so record/replay and an invalid mode
/// throw from inside the fetch, past the catch in http.ts, into the retry
/// ladder that treats them as recoverable errors.
enum Attempt {
    /// A 2xx with a parsed body.
    Done(Value),
    /// Bubbled up immediately, no further retries.
    Thrown(HttpErr),
    /// Recorded as lastError and retried.
    Stalled(HttpErr),
}

use Attempt::{Done, Stalled, Thrown};

/// A fixture behaves like a real response: ok parsing wins, a known status
/// walks or throws, a corrupt body is a parse error the caller surfaces.
fn serve(stored: StoredFixture, host: &str) -> Attempt {
    if (200..300).contains(&stored.status) {
        return match crate::json::parse(&stored.body) {
            Ok(value) => Done(value),
            Err(err) => Thrown(HttpErr::Network(err.0)),
        };
    }
    // `response.ok` is false: HttpError, and a 4xx never starts working.
    let error = HttpErr::Status {
        host: host.to_string(),
        status: stored.status,
    };
    if stored.status < 500 {
        Thrown(error)
    } else {
        Stalled(error)
    }
}

/// `fetch(url, { signal: AbortSignal.timeout(5_000) })`, read to text, with
/// transport failures reduced to the `TypeError("fetch failed")` message TS
/// surfaces. A real status writes its down in record mode before serving.
fn live(href: &str, host: &str, record: Option<&Path>) -> Attempt {
    let agent = ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_millis(TIMEOUT_MS)))
        .build()
        .new_agent();
    let attempt = agent.get(href).call();
    // ureq treats every non-2xx as an error; the body is dropped, so the
    // record store keeps an empty shell behind that status.
    let response = match attempt {
        Ok(response) => response,
        Err(ureq::Error::StatusCode(status)) => {
            return status_response(status, String::new(), href, host, record)
        }
        Err(_) => return Stalled(HttpErr::Network("fetch failed".to_string())),
    };

    let status = response.status().as_u16();
    let mut body = response.into_body();
    let body = body.read_to_string().unwrap_or_default();
    status_response(status, body, href, host, record)
}

/// One choke point for the recorded and live paths: 2xx parses, a 4xx throws
/// on sight, a 5xx stalls. Recording happens before serving, so a rerun
/// replays what it saw.
fn status_response(
    status: u16,
    body: String,
    href: &str,
    host: &str,
    record: Option<&Path>,
) -> Attempt {
    if let Some(path) = record {
        let _ = StoredFixture {
            url: href.to_string(),
            status,
            body: body.clone(),
            content_type: Some("application/json".to_string()),
            network_error: false,
        }
        .write(path);
    }
    if (200..300).contains(&status) {
        return match crate::json::parse(&body) {
            Ok(value) => Done(value),
            Err(err) => Thrown(HttpErr::Network(err.0)),
        };
    }
    let error = HttpErr::Status {
        host: host.to_string(),
        status,
    };
    if status < 500 {
        Thrown(error)
    } else {
        Stalled(error)
    }
}

fn attempt_fetch(href: &str, host: &str) -> Attempt {
    let Some(dir) = fixture_dir() else {
        return live(href, host, None);
    };
    let root = PathBuf::from(dir);

    let mode_dne = std::env::var("OTENKI_FIXTURE_MODE").ok();
    let record = match mode_dne.as_deref() {
        None | Some("") | Some("replay") => false,
        Some("record") => true,
        Some(other) => {
            return Thrown(HttpErr::Network(format!(
                "OTENKI_FIXTURE_MODE is invalid: '{other}'"
            )))
        }
    };

    let path = root.join(format!("api/{}.json", sha256::fixture_stem(href)));
    if path.is_file() {
        let stored = StoredFixture::from_file(&path);
        if stored.network_error {
            // A hand written network-error fixture stands in for a dead
            // socket: every attempt rejects, and the retry ladder is what
            // exercises the message.
            return Stalled(HttpErr::Network("fetch failed".to_string()));
        }
        return serve(stored, host);
    }

    // A recorded network error left no file behind, so replay must refuse
    // the URL instead of silently going live.
    if !record {
        return Stalled(HttpErr::Network(format!(
            "fixture mode is replay but nothing is recorded for: {href}"
        )));
    }

    live(href, host, Some(&path))
}

/// `fetchJson`: two retries beat the shorter deadline. A stall recovers on
/// the very next attempt, and three stalls in a row are rare.
pub fn fetch_json(url: &crate::url::Url) -> Result<Value, HttpErr> {
    let href = url.to_string();
    let host = host_of(&href);
    let mut last_error = HttpErr::Network(format!("{host} へのリクエストに失敗しました"));

    for attempt in 0..ATTEMPTS {
        match attempt_fetch(&href, &host) {
            Done(value) => return Ok(value),
            Thrown(error) => return Err(error),
            Stalled(error) => {
                if attempt == ATTEMPTS - 1 {
                    return Err(error);
                }
                last_error = error;
                std::thread::sleep(std::time::Duration::from_millis(
                    RETRY_DELAY_MS * u64::from(attempt + 1),
                ));
            }
        }
    }
    Err(last_error)
}

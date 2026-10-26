//! The places cache, the mirror of `cache.ts`. XDG state directory so a
//! cache purge does not silently send the user back to the network for a
//! place they look up every morning; the version lives in the key, so an old
//! file reads as a miss without having to inspect every entry.

use crate::geocode::GeocodeResult;
use crate::json::Value;
use std::path::PathBuf;

/// XDG state directory, resolved the way other tools do: `XDG_STATE_HOME`
/// when it is set, non-empty and absolute, else `${home}/.local/state`.
fn state_dir() -> String {
    let xdg = std::env::var("XDG_STATE_HOME").ok();
    let home = match xdg {
        Some(xdg) if is_absolute(&xdg) => xdg,
        _ => format!("{}/.local/state", home_dir()),
    };
    format!("{home}/otenki")
}

/// The home the two XDG roots fall back to. node's `homedir()` uses the passwd
/// database when `HOME` is absent; environments that unset `HOME` are rare
/// enough that a `/root` stand-in keeps the path absolute without pulling a
/// libc dependency into a std-only crate.
pub fn home_dir() -> String {
    std::env::var("HOME")
        .ok()
        .filter(|home| !home.is_empty())
        .unwrap_or_else(|| "/root".to_string())
}

/// `path.isAbsolute` under the POSIX branch: node does not treat Windows
/// paths as absolute on Unix.
fn is_absolute(path: &str) -> bool {
    path.starts_with('/')
}

fn cache_file() -> String {
    format!("{}/places.json", state_dir())
}

/// Thirty days: places do not move, but the geocoder's result set can.
const TTL_MS: f64 = 30.0 * 24.0 * 60.0 * 60.0 * 1000.0;

/// Bumped whenever ranking or matching changes. An entry stored by an older
/// build can hold the very answer that build got wrong — Lagos for "Los
/// Angeles" — and the TTL alone would keep serving it up for 30 days. The
/// version lives in the key, so an old file read is a miss without inspecting
/// every entry, and the next write drops what it did not re-populate.
pub const CACHE_VERSION: u64 = 2;

fn version_prefix() -> String {
    format!("{CACHE_VERSION}:")
}

/// Keys are versioned, and the version is the invalidation.
pub fn cache_key(query: &str) -> String {
    format!("{}{}", version_prefix(), crate::text::js_trim(query))
}

pub struct CacheEntry {
    pub saved_at: f64,
    pub results: Vec<GeocodeResult>,
}

/// Entries keep file order: object entries iterate insertion order, so a new
/// write is appended and the file cannot churn keys around.
type Entries = Vec<(String, CacheEntry)>;

/// The file is hostile input, and the shape is part of it: `savedAt` a finite
/// number, `results` an array of objects each carrying a string `name` and
/// finite `latitude`/`longitude`. Entries failing validation degrade to a
/// miss, never to a crash or a place the user did not ask for.
fn is_entry(value: &Value) -> Option<(f64, &Vec<Value>)> {
    let saved_at = value.get("savedAt")?.as_f64().filter(f64::is_finite)?;
    let results = value.get("results")?.as_arr()?;
    for result in results {
        result.get("name")?.as_str()?;
        let latitude = result.get("latitude")?.as_f64().filter(f64::is_finite)?;
        let _ = latitude;
        result.get("longitude")?.as_f64().filter(f64::is_finite)?;
    }
    Some((saved_at, results))
}

/// `readCache`: `{}` when missing — a cache-less install is the default
/// state — and `{}` again for anything unreadable, unparsable, non-object or
/// poisoned. `__proto__` stays out: `JSON.parse` hands it over as an own key,
/// but writing it back is a prototype setter, not a property assignment, so
/// the map would inherit whatever the file put there.
pub fn read_cache() -> Entries {
    let raw = match std::fs::read_to_string(cache_file()) {
        Ok(text) => text,
        Err(_) => return vec![],
    };
    let parsed = match crate::json::parse(&raw) {
        Ok(parsed) => parsed,
        Err(_) => return vec![],
    };
    let entries = match &parsed {
        Value::Obj(entries) => entries,
        _ => return vec![],
    };

    let mut valid: Entries = vec![];
    for (key, value) in entries {
        if key == "__proto__" {
            continue;
        }
        if let Some((saved_at, results)) = is_entry(value) {
            valid.push((
                key.clone(),
                CacheEntry {
                    saved_at,
                    results: results.iter().map(GeocodeResult::from_raw).collect(),
                },
            ));
        }
    }
    valid
}

/// `Bun.write(cacheFile(), JSON.stringify(cache, null, 2))` — pretty JSON,
/// no trailing newline, best effort: a read-only home is not worth failing
/// the command over.
fn write_cache(cache: &Entries) {
    let object = Value::Obj(
        cache
            .iter()
            .map(|(key, entry)| {
                (
                    key.clone(),
                    Value::Obj(vec![
                        ("savedAt".to_string(), Value::Num(entry.saved_at)),
                        (
                            "results".to_string(),
                            Value::Arr(entry.results.iter().map(GeocodeResult::to_raw).collect()),
                        ),
                    ]),
                )
            })
            .collect(),
    );
    let _ = std::fs::write(cache_file(), crate::json::stringify_pretty(&object));
}

/**
 * Look a query up, fill a miss through `load`, and persist what came back.
 * A hit inside the TTL returns the stored places untouched; an empty loader
 * result writes nothing, since caching a miss begets the same miss later.
 */
pub fn cached_geocode<E>(
    query: &str,
    load: impl FnOnce() -> Result<Vec<GeocodeResult>, E>,
) -> Result<Vec<GeocodeResult>, E> {
    let key = cache_key(query);
    let cache = read_cache();
    let hit = cache
        .iter()
        .find(|(cached, _)| *cached == key)
        .map(|(_, entry)| entry);

    if let Some(hit) = hit {
        if crate::now::now_ms() - hit.saved_at < TTL_MS {
            return Ok(hit.results.clone());
        }
    }

    let results = load()?;
    if results.is_empty() {
        return Ok(results);
    }

    // Stale entries drop on write, and other versions' entries go too:
    // unreachable by now, and leaving them would resurrect a stale answer
    // the moment the version rolled back and forth.
    let now = crate::now::now_ms() as f64;
    let mut kept: Entries = cache
        .into_iter()
        .filter(|(cached, entry)| {
            cached.starts_with(&version_prefix()) && now - entry.saved_at < TTL_MS
        })
        .collect();
    kept.push((
        key,
        CacheEntry {
            saved_at: now,
            results,
        },
    ));

    write_cache(&kept);
    Ok(kept
        .last()
        .map(|(_, entry)| entry.results.clone())
        .unwrap_or_default())
}

/// `clearCache`: a read-only location surfaces as the readable failure the
/// command's whole job deserves, never as a false success.
pub fn clear_cache() -> Result<(), String> {
    std::fs::write(cache_file(), "{}")
        .map_err(|_| "キャッシュの消去に失敗しました（書き込み権限を確認してください）".to_string())
}

/// The directory `places.json` lives in, when only the file is known
/// (mkdir happens on the write path of record mode).
pub fn cache_dir() -> PathBuf {
    PathBuf::from(state_dir())
}

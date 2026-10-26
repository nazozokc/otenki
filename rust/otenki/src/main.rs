//! The Rust port of `apps/otenki`, driven byte-for-byte against Bun by the
//! golden battery in `rust/fixtures/capture`. Modules mirror the TypeScript
//! files one-to-one; low-level fidelity pieces (JSON, sha256, URL encoding,
//! time) stand beside them as their own modules.
//!
//! Temporary smoke main while the port lands module by module.

mod config;
mod format;
mod hourly_time;
mod http;
mod json;
mod now;
mod sanitize;
mod sha256;
mod style;
mod table;
mod text;
mod tzif;
mod url;
mod weather;
mod width;

fn main() {
    let url = "https://api.open-meteo.com/v1/forecast?latitude=35.6895";
    let stem = sha256::fixture_stem(url);
    println!("url -> {stem}");
}

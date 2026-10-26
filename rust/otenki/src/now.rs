//! The clock. Every timestamp the CLI prints or caches comes from here, which
//! lets the golden battery freeze time: `OTENKI_NOW` replaces `Date.now()`
//! wholesale, and with no variable set the real clock runs.
//!
//! This is the single seam the preload's `Date.now = () => now` mocks; the
//! hourly window, cache TTLs and the hourly path all funnel through it.

/// Milliseconds since the epoch, JS `Date.now()` semantics. Frozen to
/// `OTENKI_NOW` whenever the capture harness sets it.
pub fn now_ms() -> i64 {
    match std::env::var("OTENKI_NOW") {
        // The harness always writes a bare integer; a malformed value falling
        // back to the real clock keeps ad-hoc invocations sane.
        Ok(raw) => raw.trim().parse().unwrap_or_else(|_| system_now_ms()),
        Err(_) => system_now_ms(),
    }
}

fn system_now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock before the epoch")
        .as_millis()
        .try_into()
        .expect("epoch millis in range")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frozen_env_wins_when_the_harness_sets_it() {
        let previous = std::env::var("OTENKI_NOW");
        // Single threaded per test; the env is process state, and edition
        // 2024 marks it unsafe on purpose.
        unsafe { std::env::set_var("OTENKI_NOW", "1792935000000") };
        assert_eq!(now_ms(), 1792935000000);
        match previous {
            Ok(value) => unsafe { std::env::set_var("OTENKI_NOW", value) },
            Err(_) => unsafe { std::env::remove_var("OTENKI_NOW") },
        }
    }

    #[test]
    fn no_env_reads_the_system_clock() {
        // A parallel test may race this one's unset period, so accept either
        // an unfrozen system reading or, if the env is set, exactly it.
        let value = now_ms();
        assert!(value > 1_700_000_000_000, "clock sanity {value}");
    }
}

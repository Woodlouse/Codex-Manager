use rand::Rng;
use std::sync::atomic::Ordering;
use std::thread;
use std::time::Duration;

use super::{
    is_keepalive_error_ignorable, parse_interval_secs,
    refresh_tokens_before_expiry_for_all_accounts, refresh_usage_for_all_accounts,
    run_gateway_keepalive_once, COMMON_POLL_FAILURE_BACKOFF_MAX_ENV, COMMON_POLL_JITTER_ENV,
    DEFAULT_GATEWAY_KEEPALIVE_FAILURE_BACKOFF_MAX_SECS, DEFAULT_GATEWAY_KEEPALIVE_JITTER_SECS,
    DEFAULT_USAGE_POLL_FAILURE_BACKOFF_MAX_SECS, DEFAULT_USAGE_POLL_JITTER_SECS,
    GATEWAY_KEEPALIVE_ENABLED, GATEWAY_KEEPALIVE_FAILURE_BACKOFF_MAX_ENV,
    GATEWAY_KEEPALIVE_INTERVAL_SECS, GATEWAY_KEEPALIVE_JITTER_ENV,
    TOKEN_REFRESH_FAILURE_BACKOFF_MAX_SECS, TOKEN_REFRESH_POLLING_ENABLED,
    TOKEN_REFRESH_POLL_INTERVAL_SECS_ATOMIC, USAGE_POLLING_ENABLED,
    USAGE_POLL_FAILURE_BACKOFF_MAX_ENV, USAGE_POLL_INTERVAL_SECS, USAGE_POLL_JITTER_ENV,
};

pub(super) fn usage_polling_loop() {
    run_dynamic_poll_loop(
        "usage polling",
        || USAGE_POLLING_ENABLED.load(Ordering::Relaxed),
        || USAGE_POLL_INTERVAL_SECS.load(Ordering::Relaxed),
        || {
            parse_interval_with_fallback(
                USAGE_POLL_JITTER_ENV,
                COMMON_POLL_JITTER_ENV,
                DEFAULT_USAGE_POLL_JITTER_SECS,
                0,
            )
        },
        |interval_secs| {
            parse_interval_with_fallback(
                USAGE_POLL_FAILURE_BACKOFF_MAX_ENV,
                COMMON_POLL_FAILURE_BACKOFF_MAX_ENV,
                DEFAULT_USAGE_POLL_FAILURE_BACKOFF_MAX_SECS,
                interval_secs,
            )
        },
        refresh_usage_for_all_accounts,
        |_| true,
    );
}

pub(super) fn gateway_keepalive_loop() {
    run_dynamic_poll_loop(
        "gateway keepalive",
        || GATEWAY_KEEPALIVE_ENABLED.load(Ordering::Relaxed),
        || GATEWAY_KEEPALIVE_INTERVAL_SECS.load(Ordering::Relaxed),
        || {
            parse_interval_with_fallback(
                GATEWAY_KEEPALIVE_JITTER_ENV,
                COMMON_POLL_JITTER_ENV,
                DEFAULT_GATEWAY_KEEPALIVE_JITTER_SECS,
                0,
            )
        },
        |interval_secs| {
            parse_interval_with_fallback(
                GATEWAY_KEEPALIVE_FAILURE_BACKOFF_MAX_ENV,
                COMMON_POLL_FAILURE_BACKOFF_MAX_ENV,
                DEFAULT_GATEWAY_KEEPALIVE_FAILURE_BACKOFF_MAX_SECS,
                interval_secs,
            )
        },
        run_gateway_keepalive_once,
        |err| !is_keepalive_error_ignorable(err),
    );
}

pub(super) fn token_refresh_polling_loop() {
    run_dynamic_poll_loop(
        "token refresh polling",
        || TOKEN_REFRESH_POLLING_ENABLED.load(Ordering::Relaxed),
        || TOKEN_REFRESH_POLL_INTERVAL_SECS_ATOMIC.load(Ordering::Relaxed),
        || 0,
        |interval_secs| TOKEN_REFRESH_FAILURE_BACKOFF_MAX_SECS.max(interval_secs),
        refresh_tokens_before_expiry_for_all_accounts,
        |_| true,
    );
}

fn parse_interval_with_fallback(
    primary_env: &str,
    fallback_env: &str,
    default_secs: u64,
    min_secs: u64,
) -> u64 {
    let primary = std::env::var(primary_env).ok();
    let fallback = std::env::var(fallback_env).ok();
    let raw = primary.as_deref().or(fallback.as_deref());
    parse_interval_secs(raw, default_secs, min_secs)
}

fn run_dynamic_poll_loop<F, L, E, I, J, B>(
    loop_name: &str,
    enabled: E,
    interval_secs: I,
    jitter_secs: J,
    failure_backoff_cap_secs: B,
    mut task: F,
    mut should_log_error: L,
) where
    F: FnMut() -> Result<(), String>,
    L: FnMut(&str) -> bool,
    E: Fn() -> bool,
    I: Fn() -> u64,
    J: Fn() -> u64,
    B: Fn(u64) -> u64,
{
    let mut rng = rand::thread_rng();
    let mut consecutive_failures = 0u32;
    loop {
        if !enabled() {
            consecutive_failures = 0;
            thread::sleep(Duration::from_secs(1));
            continue;
        }

        let succeeded = match task() {
            Ok(_) => true,
            Err(err) => {
                if should_log_error(err.as_str()) {
                    log::warn!("{loop_name} error: {err}");
                }
                false
            }
        };

        if succeeded {
            consecutive_failures = 0;
        } else {
            consecutive_failures = consecutive_failures.saturating_add(1);
        }

        let base_interval_secs = interval_secs().max(1);
        let jitter_cap_secs = jitter_secs();
        let sampled_jitter = if jitter_cap_secs == 0 {
            Duration::ZERO
        } else {
            Duration::from_secs(rng.gen_range(0..=jitter_cap_secs))
        };
        let delay = next_dynamic_poll_delay(
            Duration::from_secs(base_interval_secs),
            Duration::from_secs(jitter_cap_secs),
            Duration::from_secs(
                failure_backoff_cap_secs(base_interval_secs).max(base_interval_secs),
            ),
            consecutive_failures,
            sampled_jitter,
        );
        thread::sleep(delay);
    }
}

fn next_dynamic_poll_delay(
    interval: Duration,
    jitter_cap: Duration,
    failure_backoff_cap: Duration,
    consecutive_failures: u32,
    sampled_jitter: Duration,
) -> Duration {
    let base_delay =
        next_dynamic_failure_backoff(interval, failure_backoff_cap, consecutive_failures);
    let bounded_jitter = if jitter_cap.is_zero() {
        Duration::ZERO
    } else {
        sampled_jitter.min(jitter_cap)
    };
    base_delay
        .checked_add(bounded_jitter)
        .unwrap_or(Duration::MAX)
}

fn next_dynamic_failure_backoff(
    interval: Duration,
    failure_backoff_cap: Duration,
    consecutive_failures: u32,
) -> Duration {
    if consecutive_failures == 0 {
        return interval;
    }

    let base_ms = interval.as_millis();
    if base_ms == 0 {
        return interval;
    }

    let cap_ms = failure_backoff_cap.max(interval).as_millis();
    let shift = (consecutive_failures.saturating_sub(1)).min(20);
    let multiplier = 1u128 << shift;
    let scaled_ms = base_ms.saturating_mul(multiplier);
    let bounded_ms = scaled_ms.min(cap_ms).max(base_ms);
    if bounded_ms > u64::MAX as u128 {
        Duration::from_millis(u64::MAX)
    } else {
        Duration::from_millis(bounded_ms as u64)
    }
}

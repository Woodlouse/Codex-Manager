use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use super::{
    account_map_from_list, build_workspace_map_from_accounts, open_storage,
    record_usage_refresh_failure, record_usage_refresh_metrics, refresh_usage_for_token,
    DEFAULT_USAGE_POLL_BATCH_LIMIT, DEFAULT_USAGE_POLL_CYCLE_BUDGET_SECS,
    ENV_USAGE_POLL_BATCH_LIMIT, ENV_USAGE_POLL_CYCLE_BUDGET_SECS, USAGE_POLL_CURSOR,
};

pub(crate) fn refresh_usage_for_all_accounts() -> Result<(), String> {
    let storage = open_storage().ok_or_else(|| "storage unavailable".to_string())?;
    let tokens = storage.list_tokens().map_err(|e| e.to_string())?;
    if tokens.is_empty() {
        return Ok(());
    }

    let accounts = storage.list_accounts().map_err(|e| e.to_string())?;
    let workspace_map = build_workspace_map_from_accounts(&accounts);
    let mut account_map = account_map_from_list(accounts);

    let total = tokens.len();
    let start_cursor = USAGE_POLL_CURSOR.load(Ordering::Relaxed) % total;
    let batch_limit = usage_poll_batch_limit(total);
    let cycle_budget = usage_poll_cycle_budget();
    let cycle_started_at = Instant::now();
    let indices = usage_poll_batch_indices(total, start_cursor, batch_limit);
    let mut processed = 0usize;

    for index in indices {
        if processed > 0 && cycle_budget.is_some_and(|budget| cycle_started_at.elapsed() >= budget)
        {
            break;
        }
        let token = &tokens[index];
        let workspace_id = workspace_map
            .get(&token.account_id)
            .and_then(|value| value.as_deref());
        let started_at = Instant::now();
        match refresh_usage_for_token(&storage, token, workspace_id, Some(&mut account_map)) {
            Ok(_) => record_usage_refresh_metrics(true, started_at),
            Err(err) => {
                record_usage_refresh_metrics(false, started_at);
                record_usage_refresh_failure(&storage, &token.account_id, &err);
            }
        }
        processed = processed.saturating_add(1);
    }

    if processed > 0 {
        USAGE_POLL_CURSOR.store(
            next_usage_poll_cursor(total, start_cursor, processed),
            Ordering::Relaxed,
        );
    }
    if processed < total {
        log::info!(
            "usage polling batch truncated: processed={} total={} batch_limit={} budget_secs={}",
            processed,
            total,
            batch_limit,
            cycle_budget.map(|budget| budget.as_secs()).unwrap_or(0)
        );
    }
    Ok(())
}

fn usage_poll_batch_limit(total: usize) -> usize {
    if total == 0 {
        return 0;
    }
    let configured = std::env::var(ENV_USAGE_POLL_BATCH_LIMIT)
        .ok()
        .and_then(|raw| raw.trim().parse::<usize>().ok())
        .unwrap_or(DEFAULT_USAGE_POLL_BATCH_LIMIT);
    if configured == 0 {
        total
    } else {
        configured.max(1).min(total)
    }
}

fn usage_poll_cycle_budget() -> Option<Duration> {
    let configured = std::env::var(ENV_USAGE_POLL_CYCLE_BUDGET_SECS)
        .ok()
        .and_then(|raw| raw.trim().parse::<u64>().ok())
        .unwrap_or(DEFAULT_USAGE_POLL_CYCLE_BUDGET_SECS);
    if configured == 0 {
        None
    } else {
        Some(Duration::from_secs(configured.max(1)))
    }
}

#[cfg(test)]
pub(crate) fn usage_poll_batch_indices(
    total: usize,
    cursor: usize,
    batch_limit: usize,
) -> Vec<usize> {
    if total == 0 || batch_limit == 0 {
        return Vec::new();
    }
    let start = cursor % total;
    (0..batch_limit.min(total))
        .map(|offset| (start + offset) % total)
        .collect()
}

#[cfg(test)]
pub(crate) fn next_usage_poll_cursor(total: usize, cursor: usize, processed: usize) -> usize {
    if total == 0 {
        return 0;
    }
    (cursor % total + processed.min(total)) % total
}

#[cfg(not(test))]
fn usage_poll_batch_indices(total: usize, cursor: usize, batch_limit: usize) -> Vec<usize> {
    if total == 0 || batch_limit == 0 {
        return Vec::new();
    }
    let start = cursor % total;
    (0..batch_limit.min(total))
        .map(|offset| (start + offset) % total)
        .collect()
}

#[cfg(not(test))]
fn next_usage_poll_cursor(total: usize, cursor: usize, processed: usize) -> usize {
    if total == 0 {
        return 0;
    }
    (cursor % total + processed.min(total)) % total
}

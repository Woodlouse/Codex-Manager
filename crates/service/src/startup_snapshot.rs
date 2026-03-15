use codexmanager_core::rpc::types::{AccountListParams, StartupSnapshotResult};

use crate::{
    account_list, apikey_list, apikey_models, gateway, requestlog_list, requestlog_today_summary,
    usage_aggregate, usage_list,
};

pub(crate) fn read_startup_snapshot(
    request_log_limit: Option<i64>,
) -> Result<StartupSnapshotResult, String> {
    let accounts = account_list::read_accounts(AccountListParams::default(), false)?.items;
    let usage_snapshots = usage_list::read_usage_snapshots()?;
    let usage_aggregate_summary = usage_aggregate::read_usage_aggregate_summary()?;
    let api_keys = apikey_list::read_api_keys()?;
    let api_model_options = apikey_models::read_model_options(false)?.items;
    let manual_preferred_account_id = gateway::manual_preferred_account();
    let request_log_today_summary = requestlog_today_summary::read_requestlog_today_summary()?;
    let request_logs = requestlog_list::read_request_logs(None, request_log_limit)?;

    Ok(StartupSnapshotResult {
        accounts,
        usage_snapshots,
        usage_aggregate_summary,
        api_keys,
        api_model_options,
        manual_preferred_account_id,
        request_log_today_summary,
        request_logs,
    })
}

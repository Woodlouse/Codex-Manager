use crate::commands::shared::rpc_call_in_background;

#[tauri::command]
pub async fn service_gateway_route_strategy_get(
    addr: Option<String>,
) -> Result<serde_json::Value, String> {
    rpc_call_in_background("gateway/routeStrategy/get", addr, None).await
}

#[tauri::command]
pub async fn service_gateway_route_strategy_set(
    addr: Option<String>,
    strategy: String,
) -> Result<serde_json::Value, String> {
    let params = serde_json::json!({ "strategy": strategy });
    rpc_call_in_background("gateway/routeStrategy/set", addr, Some(params)).await
}

#[tauri::command]
pub async fn service_gateway_manual_account_get(
    addr: Option<String>,
) -> Result<serde_json::Value, String> {
    rpc_call_in_background("gateway/manualAccount/get", addr, None).await
}

#[tauri::command]
pub async fn service_gateway_manual_account_set(
    addr: Option<String>,
    account_id: String,
) -> Result<serde_json::Value, String> {
    let params = serde_json::json!({ "accountId": account_id });
    rpc_call_in_background("gateway/manualAccount/set", addr, Some(params)).await
}

#[tauri::command]
pub async fn service_gateway_manual_account_clear(
    addr: Option<String>,
) -> Result<serde_json::Value, String> {
    rpc_call_in_background("gateway/manualAccount/clear", addr, None).await
}

#[tauri::command]
pub async fn service_gateway_header_policy_get(
    addr: Option<String>,
) -> Result<serde_json::Value, String> {
    rpc_call_in_background("gateway/headerPolicy/get", addr, None).await
}

#[tauri::command]
pub async fn service_gateway_header_policy_set(
    addr: Option<String>,
    cpa_no_cookie_header_mode_enabled: bool,
) -> Result<serde_json::Value, String> {
    let params =
        serde_json::json!({ "cpaNoCookieHeaderModeEnabled": cpa_no_cookie_header_mode_enabled });
    rpc_call_in_background("gateway/headerPolicy/set", addr, Some(params)).await
}

#[tauri::command]
pub async fn service_gateway_background_tasks_get(
    addr: Option<String>,
) -> Result<serde_json::Value, String> {
    rpc_call_in_background("gateway/backgroundTasks/get", addr, None).await
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn service_gateway_background_tasks_set(
    addr: Option<String>,
    usage_polling_enabled: Option<bool>,
    usage_poll_interval_secs: Option<u64>,
    gateway_keepalive_enabled: Option<bool>,
    gateway_keepalive_interval_secs: Option<u64>,
    token_refresh_polling_enabled: Option<bool>,
    token_refresh_poll_interval_secs: Option<u64>,
    usage_refresh_workers: Option<u64>,
    http_worker_factor: Option<u64>,
    http_worker_min: Option<u64>,
    http_stream_worker_factor: Option<u64>,
    http_stream_worker_min: Option<u64>,
) -> Result<serde_json::Value, String> {
    let params = serde_json::json!({
      "usagePollingEnabled": usage_polling_enabled,
      "usagePollIntervalSecs": usage_poll_interval_secs,
      "gatewayKeepaliveEnabled": gateway_keepalive_enabled,
      "gatewayKeepaliveIntervalSecs": gateway_keepalive_interval_secs,
      "tokenRefreshPollingEnabled": token_refresh_polling_enabled,
      "tokenRefreshPollIntervalSecs": token_refresh_poll_interval_secs,
      "usageRefreshWorkers": usage_refresh_workers,
      "httpWorkerFactor": http_worker_factor,
      "httpWorkerMin": http_worker_min,
      "httpStreamWorkerFactor": http_stream_worker_factor,
      "httpStreamWorkerMin": http_stream_worker_min
    });
    rpc_call_in_background("gateway/backgroundTasks/set", addr, Some(params)).await
}

#[tauri::command]
pub async fn service_gateway_upstream_proxy_get(
    addr: Option<String>,
) -> Result<serde_json::Value, String> {
    rpc_call_in_background("gateway/upstreamProxy/get", addr, None).await
}

#[tauri::command]
pub async fn service_gateway_upstream_proxy_set(
    addr: Option<String>,
    proxy_url: Option<String>,
) -> Result<serde_json::Value, String> {
    let params = serde_json::json!({ "proxyUrl": proxy_url });
    rpc_call_in_background("gateway/upstreamProxy/set", addr, Some(params)).await
}

#[tauri::command]
pub async fn service_gateway_transport_get(
    addr: Option<String>,
) -> Result<serde_json::Value, String> {
    rpc_call_in_background("gateway/transport/get", addr, None).await
}

#[tauri::command]
pub async fn service_gateway_transport_set(
    addr: Option<String>,
    sse_keepalive_interval_ms: Option<u64>,
    upstream_stream_timeout_ms: Option<u64>,
) -> Result<serde_json::Value, String> {
    let params = serde_json::json!({
      "sseKeepaliveIntervalMs": sse_keepalive_interval_ms,
      "upstreamStreamTimeoutMs": upstream_stream_timeout_ms
    });
    rpc_call_in_background("gateway/transport/set", addr, Some(params)).await
}

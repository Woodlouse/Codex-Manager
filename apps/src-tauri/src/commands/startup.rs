use crate::commands::shared::rpc_call_in_background;

#[tauri::command]
pub async fn service_startup_snapshot(
    addr: Option<String>,
    request_log_limit: Option<i64>,
) -> Result<serde_json::Value, String> {
    let params = request_log_limit.map(|value| serde_json::json!({ "requestLogLimit": value }));
    rpc_call_in_background("startup/snapshot", addr, params).await
}

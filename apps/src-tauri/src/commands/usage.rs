use crate::commands::shared::rpc_call_in_background;

#[tauri::command]
pub async fn service_usage_read(
    addr: Option<String>,
    account_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let params = account_id.map(|id| serde_json::json!({ "accountId": id }));
    rpc_call_in_background("account/usage/read", addr, params).await
}

#[tauri::command]
pub async fn service_usage_list(addr: Option<String>) -> Result<serde_json::Value, String> {
    rpc_call_in_background("account/usage/list", addr, None).await
}

#[tauri::command]
pub async fn service_usage_aggregate(addr: Option<String>) -> Result<serde_json::Value, String> {
    rpc_call_in_background("account/usage/aggregate", addr, None).await
}

#[tauri::command]
pub async fn service_usage_refresh(
    addr: Option<String>,
    account_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let params = account_id.map(|id| serde_json::json!({ "accountId": id }));
    rpc_call_in_background("account/usage/refresh", addr, params).await
}

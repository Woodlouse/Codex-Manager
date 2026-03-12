use crate::commands::shared::rpc_call_in_background;

#[tauri::command]
pub async fn service_login_start(
    addr: Option<String>,
    login_type: String,
    open_browser: Option<bool>,
    note: Option<String>,
    tags: Option<String>,
    group_name: Option<String>,
    workspace_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let params = serde_json::json!({
      "type": login_type,
      "openBrowser": open_browser.unwrap_or(true),
      "note": note,
      "tags": tags,
      "groupName": group_name,
      "workspaceId": workspace_id
    });
    rpc_call_in_background("account/login/start", addr, Some(params)).await
}

#[tauri::command]
pub async fn service_login_status(
    addr: Option<String>,
    login_id: String,
) -> Result<serde_json::Value, String> {
    let params = serde_json::json!({
      "loginId": login_id
    });
    rpc_call_in_background("account/login/status", addr, Some(params)).await
}

#[tauri::command]
pub async fn service_login_complete(
    addr: Option<String>,
    state: String,
    code: String,
    redirect_uri: Option<String>,
) -> Result<serde_json::Value, String> {
    let params = serde_json::json!({
      "state": state,
      "code": code,
      "redirectUri": redirect_uri
    });
    rpc_call_in_background("account/login/complete", addr, Some(params)).await
}

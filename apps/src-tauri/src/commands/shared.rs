use crate::rpc_client::rpc_call;

pub(crate) async fn rpc_call_in_background(
    method: &'static str,
    addr: Option<String>,
    params: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let method_name = method.to_string();
    let method_for_task = method_name.clone();
    tauri::async_runtime::spawn_blocking(move || rpc_call(&method_for_task, addr, params))
        .await
        .map_err(|err| format!("{method_name} task failed: {err}"))?
}

pub(crate) fn open_in_browser_blocking(url: &str) -> Result<(), String> {
    if cfg!(target_os = "windows") {
        let status = std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", url])
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("rundll32 failed with status: {status}"))
        }
    } else {
        webbrowser::open(url).map(|_| ()).map_err(|e| e.to_string())
    }
}

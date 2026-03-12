use crate::commands::shared::open_in_browser_blocking;

#[tauri::command]
pub async fn open_in_browser(url: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open_in_browser_blocking(&url))
        .await
        .map_err(|err| format!("open_in_browser task failed: {err}"))?
}

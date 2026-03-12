use rfd::FileDialog;

use crate::app_storage::read_account_import_contents_from_directory;
use crate::commands::shared::rpc_call_in_background;
use crate::rpc_client::rpc_call;

#[tauri::command]
pub async fn service_account_import(
    addr: Option<String>,
    contents: Option<Vec<String>>,
    content: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut payload_contents = contents.unwrap_or_default();
    if let Some(single) = content {
        if !single.trim().is_empty() {
            payload_contents.push(single);
        }
    }
    let params = serde_json::json!({ "contents": payload_contents });
    rpc_call_in_background("account/import", addr, Some(params)).await
}

#[tauri::command]
pub async fn service_account_import_by_directory(
    _addr: Option<String>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let selected_dir = FileDialog::new()
            .set_title("选择账号导入目录")
            .pick_folder();
        let Some(dir_path) = selected_dir else {
            return Ok(serde_json::json!({
              "result": {
                "ok": true,
                "canceled": true
              }
            }));
        };

        let (json_files, contents) = read_account_import_contents_from_directory(&dir_path)?;
        Ok(serde_json::json!({
          "result": {
            "ok": true,
            "canceled": false,
            "directoryPath": dir_path.to_string_lossy().to_string(),
            "fileCount": json_files.len(),
            "contents": contents
          }
        }))
    })
    .await
    .map_err(|err| format!("service_account_import_by_directory task failed: {err}"))?
}

#[tauri::command]
pub async fn service_account_export_by_account_files(
    addr: Option<String>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let selected_dir = FileDialog::new()
            .set_title("选择账号导出目录")
            .pick_folder();
        let Some(dir_path) = selected_dir else {
            return Ok(serde_json::json!({
              "result": {
                "ok": true,
                "canceled": true
              }
            }));
        };
        let params = serde_json::json!({
          "outputDir": dir_path.to_string_lossy().to_string()
        });
        rpc_call("account/export", addr, Some(params))
    })
    .await
    .map_err(|err| format!("service_account_export_by_account_files task failed: {err}"))?
}

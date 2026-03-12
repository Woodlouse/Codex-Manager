mod apply;
mod github;
mod model;
mod prepare;
mod runtime;
mod state;

pub use model::{
    UpdateActionResponse, UpdateCheckResponse, UpdatePrepareResponse, UpdateStatusResponse,
};

use apply::{apply_portable_impl, launch_installer_impl};
use prepare::{prepare_update_impl, resolve_update_context};
use runtime::{current_mode_and_marker, resolve_update_repo};
use state::{
    clear_last_error, read_pending_update, set_last_check, set_last_error, snapshot_last_state,
};

#[tauri::command]
pub async fn app_update_check() -> Result<UpdateCheckResponse, String> {
    let task = tauri::async_runtime::spawn_blocking(resolve_update_context);
    match task.await {
        Ok(Ok(context)) => {
            set_last_check(context.check.clone());
            Ok(context.check)
        }
        Ok(Err(err)) => {
            set_last_error(err.clone());
            Err(err)
        }
        Err(err) => {
            let message = format!("app_update_check 任务失败：{err}");
            set_last_error(message.clone());
            Err(message)
        }
    }
}

#[tauri::command]
pub async fn app_update_prepare(app: tauri::AppHandle) -> Result<UpdatePrepareResponse, String> {
    let app_handle = app.clone();
    let task = tauri::async_runtime::spawn_blocking(move || prepare_update_impl(&app_handle));
    match task.await {
        Ok(Ok(result)) => {
            clear_last_error();
            Ok(result)
        }
        Ok(Err(err)) => {
            set_last_error(err.clone());
            Err(err)
        }
        Err(err) => {
            let message = format!("app_update_prepare 任务失败：{err}");
            set_last_error(message.clone());
            Err(message)
        }
    }
}

#[tauri::command]
pub fn app_update_apply_portable(app: tauri::AppHandle) -> Result<UpdateActionResponse, String> {
    apply_portable_impl(app)
}

#[tauri::command]
pub fn app_update_launch_installer(app: tauri::AppHandle) -> Result<UpdateActionResponse, String> {
    launch_installer_impl(app)
}

#[tauri::command]
pub fn app_update_status(app: tauri::AppHandle) -> Result<UpdateStatusResponse, String> {
    let repo = resolve_update_repo();
    let (mode, is_portable, exe_path, marker_path) = current_mode_and_marker()?;
    let pending = read_pending_update(&app)?;
    let (last_check, last_error) = snapshot_last_state();

    Ok(UpdateStatusResponse {
        repo,
        mode,
        is_portable,
        current_version: env!("CARGO_PKG_VERSION").to_string(),
        current_exe_path: exe_path.display().to_string(),
        portable_marker_path: marker_path.display().to_string(),
        pending,
        last_check,
        last_error,
    })
}

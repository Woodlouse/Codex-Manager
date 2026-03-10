use codexmanager_core::storage::Storage;
use rfd::{FileDialog, MessageButtons, MessageDialog, MessageLevel};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri::WebviewWindowBuilder;

mod app_storage;
mod rpc_client;
mod settings_commands;
mod service_runtime;
mod updater;
pub(crate) use app_storage::*;
pub(crate) use rpc_client::*;
use settings_commands::{
    app_close_to_tray_on_close_get, app_close_to_tray_on_close_set, app_settings_get,
    app_settings_set, service_gateway_background_tasks_get, service_gateway_background_tasks_set,
    service_gateway_header_policy_get, service_gateway_header_policy_set,
    service_gateway_manual_account_clear, service_gateway_manual_account_get,
    service_gateway_manual_account_set, service_gateway_route_strategy_get,
    service_gateway_route_strategy_set, service_gateway_upstream_proxy_get,
    service_gateway_upstream_proxy_set, service_listen_config_get, service_listen_config_set,
    sync_window_runtime_state_from_settings,
};
use service_runtime::{
    spawn_service_with_addr, stop_service, validate_initialize_response, wait_for_service_ready,
};

const TRAY_MENU_SHOW_MAIN: &str = "tray_show_main";
const TRAY_MENU_QUIT_APP: &str = "tray_quit_app";
const MAIN_WINDOW_LABEL: &str = "main";
static APP_EXIT_REQUESTED: AtomicBool = AtomicBool::new(false);
static TRAY_AVAILABLE: AtomicBool = AtomicBool::new(false);
static CLOSE_TO_TRAY_ON_CLOSE: AtomicBool = AtomicBool::new(false);
static LIGHTWEIGHT_MODE_ON_CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(false);
static KEEP_ALIVE_FOR_LIGHTWEIGHT_CLOSE: AtomicBool = AtomicBool::new(false);

async fn rpc_call_in_background(
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

#[tauri::command]
async fn service_initialize(addr: Option<String>) -> Result<serde_json::Value, String> {
    let v = tauri::async_runtime::spawn_blocking(move || rpc_call("initialize", addr, None))
        .await
        .map_err(|err| format!("initialize task failed: {err}"))??;
    validate_initialize_response(&v)?;
    Ok(v)
}

#[tauri::command]
async fn service_start(app: tauri::AppHandle, addr: String) -> Result<(), String> {
    let connect_addr = normalize_addr(&addr)?;
    apply_runtime_storage_env(&app);
    let bind_addr = codexmanager_service::listener_bind_addr(&connect_addr);
    tauri::async_runtime::spawn_blocking(move || {
        log::info!(
            "service_start requested connect_addr={} bind_addr={}",
            connect_addr,
            bind_addr
        );
        // 中文注释：桌面端本地 RPC 继续走 localhost；真正监听地址切成 0.0.0.0，方便局域网访问。
        std::env::set_var("CODEXMANAGER_SERVICE_ADDR", &bind_addr);
        stop_service();
        spawn_service_with_addr(&app, &bind_addr, &connect_addr)?;
        wait_for_service_ready(&connect_addr, 12, std::time::Duration::from_millis(250))
            .map_err(|err| {
                log::error!(
                    "service health check failed at {} (bind {}): {}",
                    connect_addr,
                    bind_addr,
                    err
                );
                stop_service();
                format!("service not ready at {connect_addr}: {err}")
            })
    })
    .await
    .map_err(|err| format!("service_start task failed: {err}"))?
}

#[tauri::command]
async fn service_stop() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        // 中文注释：显式停止 service 进程
        stop_service();
        Ok(())
    })
    .await
    .map_err(|err| format!("service_stop task failed: {err}"))?
}

#[tauri::command]
async fn service_account_list(
    addr: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
    query: Option<String>,
    filter: Option<String>,
    group_filter: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut params = serde_json::Map::new();
    if let Some(value) = page {
        params.insert("page".to_string(), serde_json::json!(value));
    }
    if let Some(value) = page_size {
        params.insert("pageSize".to_string(), serde_json::json!(value));
    }
    if let Some(value) = query {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            params.insert("query".to_string(), serde_json::json!(trimmed));
        }
    }
    if let Some(value) = filter {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            params.insert("filter".to_string(), serde_json::json!(trimmed));
        }
    }
    if let Some(value) = group_filter {
        let trimmed = value.trim();
        if !trimmed.is_empty() && trimmed != "all" {
            params.insert("groupFilter".to_string(), serde_json::json!(trimmed));
        }
    }
    let payload = if params.is_empty() {
        None
    } else {
        Some(serde_json::Value::Object(params))
    };
    rpc_call_in_background("account/list", addr, payload).await
}

#[tauri::command]
async fn service_account_delete(
    addr: Option<String>,
    account_id: String,
) -> Result<serde_json::Value, String> {
    let params = serde_json::json!({ "accountId": account_id });
    rpc_call_in_background("account/delete", addr, Some(params)).await
}

#[tauri::command]
async fn service_account_delete_many(
    addr: Option<String>,
    account_ids: Vec<String>,
) -> Result<serde_json::Value, String> {
    let params = serde_json::json!({ "accountIds": account_ids });
    rpc_call_in_background("account/deleteMany", addr, Some(params)).await
}

#[tauri::command]
async fn service_account_delete_unavailable_free(
    addr: Option<String>,
) -> Result<serde_json::Value, String> {
    rpc_call_in_background("account/deleteUnavailableFree", addr, None).await
}

#[tauri::command]
async fn service_account_update(
    addr: Option<String>,
    account_id: String,
    sort: i64,
) -> Result<serde_json::Value, String> {
    let params = serde_json::json!({ "accountId": account_id, "sort": sort });
    rpc_call_in_background("account/update", addr, Some(params)).await
}

#[tauri::command]
async fn service_account_import(
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
async fn service_account_import_from_register_db(
    addr: Option<String>,
) -> Result<serde_json::Value, String> {
    rpc_call_in_background("account/importFromRegisterDb", addr, None).await
}

#[tauri::command]
async fn service_account_import_by_directory(
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
async fn service_account_export_by_account_files(
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

#[tauri::command]
async fn local_account_delete(
    app: tauri::AppHandle,
    account_id: String,
) -> Result<serde_json::Value, String> {
    let db_path = resolve_db_path_with_legacy_migration(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut storage = Storage::open(db_path).map_err(|e| e.to_string())?;
        storage
            .delete_account(&account_id)
            .map_err(|e| e.to_string())?;
        Ok(serde_json::json!({ "ok": true }))
    })
    .await
    .map_err(|err| format!("local_account_delete task failed: {err}"))?
}

#[tauri::command]
async fn service_usage_read(
    addr: Option<String>,
    account_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let params = account_id.map(|id| serde_json::json!({ "accountId": id }));
    rpc_call_in_background("account/usage/read", addr, params).await
}

#[tauri::command]
async fn service_usage_list(addr: Option<String>) -> Result<serde_json::Value, String> {
    rpc_call_in_background("account/usage/list", addr, None).await
}

#[tauri::command]
async fn service_usage_refresh(
    addr: Option<String>,
    account_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let params = account_id.map(|id| serde_json::json!({ "accountId": id }));
    rpc_call_in_background("account/usage/refresh", addr, params).await
}

#[tauri::command]
async fn service_requestlog_list(
    addr: Option<String>,
    query: Option<String>,
    limit: Option<i64>,
) -> Result<serde_json::Value, String> {
    let params = serde_json::json!({ "query": query, "limit": limit });
    rpc_call_in_background("requestlog/list", addr, Some(params)).await
}

#[tauri::command]
async fn service_rpc_token() -> Result<String, String> {
    Ok(codexmanager_service::rpc_auth_token().to_string())
}

#[tauri::command]
async fn service_requestlog_clear(addr: Option<String>) -> Result<serde_json::Value, String> {
    rpc_call_in_background("requestlog/clear", addr, None).await
}

#[tauri::command]
async fn service_requestlog_today_summary(
    addr: Option<String>,
) -> Result<serde_json::Value, String> {
    rpc_call_in_background("requestlog/today_summary", addr, None).await
}

#[tauri::command]
async fn service_login_start(
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
async fn service_login_status(
    addr: Option<String>,
    login_id: String,
) -> Result<serde_json::Value, String> {
    let params = serde_json::json!({
      "loginId": login_id
    });
    rpc_call_in_background("account/login/status", addr, Some(params)).await
}

#[tauri::command]
async fn service_login_complete(
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

#[tauri::command]
async fn service_apikey_list(addr: Option<String>) -> Result<serde_json::Value, String> {
    rpc_call_in_background("apikey/list", addr, None).await
}

#[tauri::command]
async fn service_apikey_read_secret(
    addr: Option<String>,
    key_id: String,
) -> Result<serde_json::Value, String> {
    let params = serde_json::json!({ "id": key_id });
    rpc_call_in_background("apikey/readSecret", addr, Some(params)).await
}

#[tauri::command]
async fn service_apikey_create(
    addr: Option<String>,
    name: Option<String>,
    model_slug: Option<String>,
    reasoning_effort: Option<String>,
    protocol_type: Option<String>,
    upstream_base_url: Option<String>,
    static_headers_json: Option<String>,
) -> Result<serde_json::Value, String> {
    let params = serde_json::json!({
      "name": name,
      "modelSlug": model_slug,
      "reasoningEffort": reasoning_effort,
      "protocolType": protocol_type,
      "upstreamBaseUrl": upstream_base_url,
      "staticHeadersJson": static_headers_json,
    });
    rpc_call_in_background("apikey/create", addr, Some(params)).await
}

#[tauri::command]
async fn service_apikey_models(
    addr: Option<String>,
    refresh_remote: Option<bool>,
) -> Result<serde_json::Value, String> {
    let params = refresh_remote.map(|value| serde_json::json!({ "refreshRemote": value }));
    rpc_call_in_background("apikey/models", addr, params).await
}

#[tauri::command]
async fn service_apikey_update_model(
    addr: Option<String>,
    key_id: String,
    model_slug: Option<String>,
    reasoning_effort: Option<String>,
    protocol_type: Option<String>,
    upstream_base_url: Option<String>,
    static_headers_json: Option<String>,
) -> Result<serde_json::Value, String> {
    let params = serde_json::json!({
      "id": key_id,
      "modelSlug": model_slug,
      "reasoningEffort": reasoning_effort,
      "protocolType": protocol_type,
      "upstreamBaseUrl": upstream_base_url,
      "staticHeadersJson": static_headers_json,
    });
    rpc_call_in_background("apikey/updateModel", addr, Some(params)).await
}

#[tauri::command]
async fn service_apikey_delete(
    addr: Option<String>,
    key_id: String,
) -> Result<serde_json::Value, String> {
    let params = serde_json::json!({ "id": key_id });
    rpc_call_in_background("apikey/delete", addr, Some(params)).await
}

#[tauri::command]
async fn service_apikey_disable(
    addr: Option<String>,
    key_id: String,
) -> Result<serde_json::Value, String> {
    let params = serde_json::json!({ "id": key_id });
    rpc_call_in_background("apikey/disable", addr, Some(params)).await
}

#[tauri::command]
async fn service_apikey_enable(
    addr: Option<String>,
    key_id: String,
) -> Result<serde_json::Value, String> {
    let params = serde_json::json!({ "id": key_id });
    rpc_call_in_background("apikey/enable", addr, Some(params)).await
}

#[tauri::command]
async fn open_in_browser(url: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open_in_browser_blocking(&url))
        .await
        .map_err(|err| format!("open_in_browser task failed: {err}"))?
}

fn open_in_browser_blocking(url: &str) -> Result<(), String> {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            log::info!(
                "secondary instance intercepted; focusing main window (args: {:?}, cwd: {})",
                args,
                cwd
            );
            show_main_window(app);
            notify_existing_instance_focused();
        }))
        .setup(|app| {
            load_env_from_exe_dir();
            apply_runtime_storage_env(app.handle());
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .targets([tauri_plugin_log::Target::new(
                        tauri_plugin_log::TargetKind::LogDir { file_name: None },
                    )])
                    .build(),
            )?;
            if let Ok(log_dir) = app.path().app_log_dir() {
                log::info!("log dir: {}", log_dir.display());
            }
            // 中文注释：系统托盘只是增强能力，初始化失败时不能阻塞主窗口启动。
            if let Err(err) = setup_tray(app.handle()) {
                TRAY_AVAILABLE.store(false, Ordering::Relaxed);
                CLOSE_TO_TRAY_ON_CLOSE.store(false, Ordering::Relaxed);
                log::warn!("tray setup unavailable, continue without tray: {}", err);
            }
            codexmanager_service::sync_runtime_settings_from_storage();
            if let Ok(mut settings) = codexmanager_service::app_settings_get_with_overrides(
                Some(codexmanager_service::current_close_to_tray_on_close_setting()
                    && TRAY_AVAILABLE.load(Ordering::Relaxed)),
                Some(TRAY_AVAILABLE.load(Ordering::Relaxed)),
            ) {
                sync_window_runtime_state_from_settings(&mut settings);
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != MAIN_WINDOW_LABEL {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if APP_EXIT_REQUESTED.load(Ordering::Relaxed) {
                    return;
                }
                if !CLOSE_TO_TRAY_ON_CLOSE.load(Ordering::Relaxed) {
                    return;
                }
                if !TRAY_AVAILABLE.load(Ordering::Relaxed) {
                    CLOSE_TO_TRAY_ON_CLOSE.store(false, Ordering::Relaxed);
                    return;
                }
                if LIGHTWEIGHT_MODE_ON_CLOSE_TO_TRAY.load(Ordering::Relaxed) {
                    KEEP_ALIVE_FOR_LIGHTWEIGHT_CLOSE.store(true, Ordering::Relaxed);
                    log::info!(
                        "window close intercepted; lightweight mode enabled, closing main window to release webview"
                    );
                    return;
                }
                api.prevent_close();
                if let Err(err) = window.hide() {
                    log::warn!("hide window to tray failed: {}", err);
                } else {
                    log::info!("window close intercepted; app hidden to tray");
                }
                return;
            }
            if let tauri::WindowEvent::Destroyed = event {
                if should_keep_alive_for_lightweight_close() {
                    log::info!("main window destroyed for lightweight tray mode");
                    return;
                }
                stop_service();
            }
        })
        .invoke_handler(tauri::generate_handler![
            service_start,
            service_stop,
            service_initialize,
            service_account_list,
            service_account_delete,
            service_account_delete_many,
            service_account_delete_unavailable_free,
        service_account_update,
        service_account_import,
        service_account_import_from_register_db,
        service_account_import_by_directory,
        service_account_export_by_account_files,
            local_account_delete,
            service_usage_read,
            service_usage_list,
            service_usage_refresh,
            service_rpc_token,
            service_listen_config_get,
            service_listen_config_set,
            service_requestlog_list,
            service_requestlog_clear,
            service_requestlog_today_summary,
            service_gateway_route_strategy_get,
            service_gateway_route_strategy_set,
            service_gateway_manual_account_get,
            service_gateway_manual_account_set,
            service_gateway_manual_account_clear,
            service_gateway_header_policy_get,
            service_gateway_header_policy_set,
            service_gateway_background_tasks_get,
            service_gateway_background_tasks_set,
            service_gateway_upstream_proxy_get,
            service_gateway_upstream_proxy_set,
            service_login_start,
            service_login_status,
            service_login_complete,
            service_apikey_list,
            service_apikey_read_secret,
            service_apikey_create,
            service_apikey_models,
            service_apikey_update_model,
            service_apikey_delete,
            service_apikey_disable,
            service_apikey_enable,
            open_in_browser,
            app_settings_get,
            app_settings_set,
            app_close_to_tray_on_close_get,
            app_close_to_tray_on_close_set,
            updater::app_update_check,
            updater::app_update_prepare,
            updater::app_update_apply_portable,
            updater::app_update_launch_installer,
            updater::app_update_status
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, event| match event {
        tauri::RunEvent::ExitRequested { api, .. } => {
            if should_keep_alive_for_lightweight_close() {
                api.prevent_exit();
                log::info!("prevented app exit for lightweight tray mode");
                return;
            }
            APP_EXIT_REQUESTED.store(true, Ordering::Relaxed);
            KEEP_ALIVE_FOR_LIGHTWEIGHT_CLOSE.store(false, Ordering::Relaxed);
            stop_service();
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { .. } => {
            show_main_window(_app_handle);
        }
        _ => {}
    });
}

fn notify_existing_instance_focused() {
    let _ = MessageDialog::new()
        .set_title("CodexManager")
        .set_description("CodexManager 已在运行，已切换到现有窗口。")
        .set_level(MessageLevel::Info)
        .set_buttons(MessageButtons::Ok)
        .show();
}

fn setup_tray(app: &tauri::AppHandle) -> Result<(), tauri::Error> {
    TRAY_AVAILABLE.store(false, Ordering::Relaxed);
    let show_main = MenuItem::with_id(app, TRAY_MENU_SHOW_MAIN, "显示主窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, TRAY_MENU_QUIT_APP, "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_main, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_MENU_SHOW_MAIN => {
                show_main_window(app);
            }
            TRAY_MENU_QUIT_APP => {
                APP_EXIT_REQUESTED.store(true, Ordering::Relaxed);
                KEEP_ALIVE_FOR_LIGHTWEIGHT_CLOSE.store(false, Ordering::Relaxed);
                stop_service();
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(&tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    TRAY_AVAILABLE.store(true, Ordering::Relaxed);
    Ok(())
}

fn show_main_window(app: &tauri::AppHandle) {
    KEEP_ALIVE_FOR_LIGHTWEIGHT_CLOSE.store(false, Ordering::Relaxed);
    let Some(window) = ensure_main_window(app) else {
        return;
    };
    if let Err(err) = window.show() {
        log::warn!("show main window failed: {}", err);
        return;
    }
    let _ = window.unminimize();
    let _ = window.set_focus();
}

fn ensure_main_window(app: &tauri::AppHandle) -> Option<tauri::WebviewWindow> {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        return Some(window);
    }

    let mut config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == MAIN_WINDOW_LABEL)
        .cloned()
        .or_else(|| app.config().app.windows.first().cloned())?;
    config.label = MAIN_WINDOW_LABEL.to_string();

    match WebviewWindowBuilder::from_config(app, &config).and_then(|builder| builder.build()) {
        Ok(window) => Some(window),
        Err(err) => {
            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                return Some(window);
            }
            log::warn!("create main window failed: {}", err);
            None
        }
    }
}

fn should_keep_alive_for_lightweight_close() -> bool {
    !APP_EXIT_REQUESTED.load(Ordering::Relaxed)
        && KEEP_ALIVE_FOR_LIGHTWEIGHT_CLOSE.load(Ordering::Relaxed)
}

fn load_env_from_exe_dir() {
    let exe_path = match std::env::current_exe() {
        Ok(p) => p,
        Err(err) => {
            log::warn!("Failed to resolve current exe path: {}", err);
            return;
        }
    };
    let Some(exe_dir) = exe_path.parent() else {
        return;
    };

    // Portable-friendly env injection: if a file exists next to the exe, load KEY=VALUE pairs
    // into process environment so the embedded service (gateway) can read them.
    //
    // This avoids relying on global/system env vars when distributing a portable folder.
    // File names (first match wins): codexmanager.env, CodexManager.env, .env
    let candidates = ["codexmanager.env", "CodexManager.env", ".env"];
    let mut chosen = None;
    for name in candidates {
        let p = exe_dir.join(name);
        if p.is_file() {
            chosen = Some(p);
            break;
        }
    }
    let Some(path) = chosen else {
        return;
    };

    let bytes = match std::fs::read(&path) {
        Ok(v) => v,
        Err(err) => {
            log::warn!("Failed to read env file {}: {}", path.display(), err);
            return;
        }
    };
    let content = String::from_utf8_lossy(&bytes);
    let mut applied = 0usize;
    for (idx, raw_line) in content.lines().enumerate() {
        let line_no = idx + 1;
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }
        let Some((key_raw, value_raw)) = line.split_once('=') else {
            log::warn!(
                "Skip invalid env line {}:{} (missing '=')",
                path.display(),
                line_no
            );
            continue;
        };
        let key = key_raw.trim();
        if key.is_empty() {
            continue;
        }
        let mut value = value_raw.trim().to_string();
        if (value.starts_with('\"') && value.ends_with('\"') && value.len() >= 2)
            || (value.starts_with('\'') && value.ends_with('\'') && value.len() >= 2)
        {
            value = value[1..value.len() - 1].to_string();
        }

        // Do not override already-defined env vars (system/user-level wins).
        if std::env::var_os(key).is_some() {
            continue;
        }
        std::env::set_var(key, value);
        applied += 1;
    }

    if applied > 0 {
        log::info!("Loaded {} env vars from {}", applied, path.display());
    }
}

#[cfg(test)]
#[path = "tests/lib_tests.rs"]
mod tests;

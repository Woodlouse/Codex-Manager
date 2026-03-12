use std::path::{Path, PathBuf};

use tauri::Manager;

use super::migration::maybe_migrate_legacy_db;

pub(crate) fn resolve_rpc_token_path_for_db(db_path: &Path) -> PathBuf {
    let parent = db_path.parent().unwrap_or_else(|| Path::new("."));
    parent.join("codexmanager.rpc-token")
}

pub(crate) fn apply_runtime_storage_env(app: &tauri::AppHandle) {
    if let Ok(data_path) = resolve_db_path_with_legacy_migration(app) {
        std::env::set_var("CODEXMANAGER_DB_PATH", &data_path);
        let token_path = resolve_rpc_token_path_for_db(&data_path);
        std::env::set_var("CODEXMANAGER_RPC_TOKEN_FILE", &token_path);
        log::info!("db path: {}", data_path.display());
        log::info!("rpc token path: {}", token_path.display());
    }
}

pub(crate) fn resolve_db_path_with_legacy_migration(
    app: &tauri::AppHandle,
) -> Result<PathBuf, String> {
    let mut data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "app data dir not found".to_string())?;
    if let Err(err) = std::fs::create_dir_all(&data_dir) {
        log::warn!("Failed to create app data dir: {}", err);
    }
    data_dir.push("codexmanager.db");
    maybe_migrate_legacy_db(&data_dir);
    Ok(data_dir)
}

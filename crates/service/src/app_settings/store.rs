use codexmanager_core::storage::{now_ts, Storage};
use std::collections::HashMap;

use super::normalize_optional_text;

pub(crate) fn open_app_settings_storage() -> Option<Storage> {
    crate::process_env::ensure_default_db_path();
    let path = std::env::var("CODEXMANAGER_DB_PATH").ok()?;
    let storage = Storage::open(&path).ok()?;
    let _ = storage.init();
    Some(storage)
}

pub(crate) fn list_app_settings_map() -> HashMap<String, String> {
    open_app_settings_storage()
        .and_then(|storage| storage.list_app_settings().ok())
        .unwrap_or_default()
        .into_iter()
        .collect()
}

pub(crate) fn get_persisted_app_setting(key: &str) -> Option<String> {
    open_app_settings_storage()
        .and_then(|storage| storage.get_app_setting(key).ok().flatten())
        .and_then(|value| normalize_optional_text(Some(&value)))
}

pub(crate) fn save_persisted_app_setting(key: &str, value: Option<&str>) -> Result<(), String> {
    let storage = open_app_settings_storage().ok_or_else(|| "storage unavailable".to_string())?;
    let text = normalize_optional_text(value).unwrap_or_default();
    storage
        .set_app_setting(key, &text, now_ts())
        .map_err(|err| format!("save {key} failed: {err}"))?;
    Ok(())
}

pub(crate) fn save_persisted_bool_setting(key: &str, value: bool) -> Result<(), String> {
    save_persisted_app_setting(key, Some(if value { "1" } else { "0" }))
}

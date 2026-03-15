use std::path::{Path, PathBuf};

use tauri::Manager;

use super::migration::maybe_migrate_legacy_db;

const QA_APP_IDENTIFIER: &str = "com.codexmanager.desktop.qa";
const QA_DEFAULT_SERVICE_ADDR: &str = "localhost:48762";

pub(crate) fn resolve_rpc_token_path_for_db(db_path: &Path) -> PathBuf {
    let parent = db_path.parent().unwrap_or_else(|| Path::new("."));
    parent.join("codexmanager.rpc-token")
}

pub(crate) fn apply_runtime_storage_env(app: &tauri::AppHandle) {
    if let Ok(data_path) = resolve_db_path_with_legacy_migration(app) {
        std::env::set_var("CODEXMANAGER_DB_PATH", &data_path);
        let token_path = resolve_rpc_token_path_for_db(&data_path);
        std::env::set_var("CODEXMANAGER_RPC_TOKEN_FILE", &token_path);
        maybe_seed_profile_service_addr(app);
        log::info!("db path: {}", data_path.display());
        log::info!("rpc token path: {}", token_path.display());
    }
}

fn profile_default_service_addr(identifier: &str) -> Option<&'static str> {
    let normalized = identifier.trim().to_ascii_lowercase();
    match normalized.as_str() {
        QA_APP_IDENTIFIER => Some(QA_DEFAULT_SERVICE_ADDR),
        _ => None,
    }
}

fn should_seed_profile_service_addr(
    identifier: &str,
    current_saved_addr: &str,
) -> Option<&'static str> {
    let profile_addr = profile_default_service_addr(identifier)?;
    if current_saved_addr.eq_ignore_ascii_case(codexmanager_service::DEFAULT_ADDR) {
        Some(profile_addr)
    } else {
        None
    }
}

fn maybe_seed_profile_service_addr(app: &tauri::AppHandle) {
    let identifier = app.config().identifier.as_str();
    let current_saved_addr = codexmanager_service::current_saved_service_addr();
    let Some(profile_addr) = should_seed_profile_service_addr(identifier, &current_saved_addr)
    else {
        return;
    };

    match codexmanager_service::set_saved_service_addr(Some(profile_addr)) {
        Ok(applied_addr) => {
            log::info!(
                "service addr profile migration: identifier={} {} -> {}",
                identifier,
                current_saved_addr,
                applied_addr
            );
        }
        Err(err) => {
            log::warn!(
                "service addr profile migration failed: identifier={} target={} error={}",
                identifier,
                profile_addr,
                err
            );
        }
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

#[cfg(test)]
mod tests {
    use super::{
        profile_default_service_addr, should_seed_profile_service_addr, QA_DEFAULT_SERVICE_ADDR,
    };

    #[test]
    fn profile_default_service_addr_is_only_defined_for_qa_profile() {
        assert_eq!(
            profile_default_service_addr("com.codexmanager.desktop.qa"),
            Some(QA_DEFAULT_SERVICE_ADDR)
        );
        assert_eq!(
            profile_default_service_addr(" COM.CODEXMANAGER.DESKTOP.QA "),
            Some(QA_DEFAULT_SERVICE_ADDR)
        );
        assert_eq!(
            profile_default_service_addr("com.codexmanager.desktop"),
            None
        );
    }

    #[test]
    fn profile_service_addr_migration_only_applies_to_legacy_default_port() {
        assert_eq!(
            should_seed_profile_service_addr(
                "com.codexmanager.desktop.qa",
                codexmanager_service::DEFAULT_ADDR
            ),
            Some(QA_DEFAULT_SERVICE_ADDR)
        );
        assert_eq!(
            should_seed_profile_service_addr("com.codexmanager.desktop.qa", "localhost:48762"),
            None
        );
        assert_eq!(
            should_seed_profile_service_addr("com.codexmanager.desktop.qa", "localhost:4999"),
            None
        );
        assert_eq!(
            should_seed_profile_service_addr(
                "com.codexmanager.desktop",
                codexmanager_service::DEFAULT_ADDR
            ),
            None
        );
    }
}

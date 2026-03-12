use codexmanager_core::storage::Storage;
use std::fs;
use std::path::{Path, PathBuf};

pub(super) fn maybe_migrate_legacy_db(current_db: &Path) {
    let current_has_data = db_has_user_data(current_db);
    if current_has_data {
        return;
    }

    let needs_bootstrap = !current_db.is_file() || !current_has_data;
    if !needs_bootstrap {
        return;
    }

    for legacy_db in legacy_db_candidates(current_db) {
        if !legacy_db.is_file() {
            continue;
        }
        if !db_has_user_data(&legacy_db) {
            continue;
        }

        if let Some(parent) = current_db.parent() {
            let _ = fs::create_dir_all(parent);
        }

        if current_db.is_file() {
            let backup = current_db.with_extension("db.empty.bak");
            if let Err(err) = fs::copy(current_db, &backup) {
                log::warn!(
                    "Failed to backup empty current db {} -> {}: {}",
                    current_db.display(),
                    backup.display(),
                    err
                );
            }
        }

        match fs::copy(&legacy_db, current_db) {
            Ok(_) => {
                log::info!(
                    "Migrated legacy db {} -> {}",
                    legacy_db.display(),
                    current_db.display()
                );
                return;
            }
            Err(err) => {
                log::warn!(
                    "Failed to migrate legacy db {} -> {}: {}",
                    legacy_db.display(),
                    current_db.display(),
                    err
                );
            }
        }
    }
}

fn db_has_user_data(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    let storage = match Storage::open(path) {
        Ok(storage) => storage,
        Err(_) => return false,
    };
    let _ = storage.init();
    storage
        .list_accounts()
        .map(|items| !items.is_empty())
        .unwrap_or(false)
        || storage
            .list_tokens()
            .map(|items| !items.is_empty())
            .unwrap_or(false)
        || storage
            .list_api_keys()
            .map(|items| !items.is_empty())
            .unwrap_or(false)
}

fn legacy_db_candidates(current_db: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();

    if let Some(parent) = current_db.parent() {
        out.push(parent.join("gpttools.db"));
        if parent
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case("com.codexmanager.desktop"))
        {
            if let Some(root) = parent.parent() {
                out.push(root.join("com.gpttools.desktop").join("gpttools.db"));
            }
        }
    }

    out.retain(|candidate| candidate != current_db);
    let mut dedup = Vec::new();
    for candidate in out {
        if !dedup.iter().any(|item| item == &candidate) {
            dedup.push(candidate);
        }
    }
    dedup
}

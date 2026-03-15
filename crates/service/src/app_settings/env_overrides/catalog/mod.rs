mod items;

use serde_json::Value;

pub(crate) use items::ENV_OVERRIDE_CATALOG;
use items::{APP_SETTINGS_ENV_RESERVED_KEYS, APP_SETTINGS_ENV_UNSUPPORTED_KEYS};

#[derive(Clone, Copy)]
pub(super) struct EnvOverrideCatalogItem {
    pub(super) key: &'static str,
    pub(super) label: &'static str,
    pub(super) scope: &'static str,
    pub(super) apply_mode: &'static str,
    pub(super) default_value: &'static str,
}

impl EnvOverrideCatalogItem {
    pub(super) const fn new(
        key: &'static str,
        label: &'static str,
        scope: &'static str,
        apply_mode: &'static str,
        default_value: &'static str,
    ) -> Self {
        Self {
            key,
            label,
            scope,
            apply_mode,
            default_value,
        }
    }
}

pub(crate) fn env_override_reserved_keys() -> &'static [&'static str] {
    APP_SETTINGS_ENV_RESERVED_KEYS
}

pub(crate) fn env_override_unsupported_keys() -> &'static [&'static str] {
    APP_SETTINGS_ENV_UNSUPPORTED_KEYS
}

pub(super) fn editable_env_override_catalog(
) -> impl Iterator<Item = &'static EnvOverrideCatalogItem> {
    ENV_OVERRIDE_CATALOG
        .iter()
        .filter(|item| !is_env_override_reserved_key(item.key))
}

pub(super) fn env_override_catalog_item(key: &str) -> Option<&'static EnvOverrideCatalogItem> {
    editable_env_override_catalog().find(|item| item.key.eq_ignore_ascii_case(key))
}

pub(super) fn is_env_override_catalog_key(key: &str) -> bool {
    env_override_catalog_item(key).is_some()
}

pub(super) fn is_env_override_unsupported_key(key: &str) -> bool {
    APP_SETTINGS_ENV_UNSUPPORTED_KEYS
        .iter()
        .any(|item| item.eq_ignore_ascii_case(key))
}

pub(super) fn is_env_override_reserved_key(key: &str) -> bool {
    APP_SETTINGS_ENV_RESERVED_KEYS
        .iter()
        .any(|item| item.eq_ignore_ascii_case(key))
}

pub(crate) fn env_override_catalog_value() -> Vec<Value> {
    editable_env_override_catalog()
        .map(|item| {
            serde_json::json!({
                "key": item.key,
                "label": item.label,
                "scope": item.scope,
                "applyMode": item.apply_mode,
                "defaultValue": super::snapshot::env_override_default_value(item.key),
            })
        })
        .collect()
}

use super::parse_bool_with_default;
use super::{
    get_persisted_app_setting, save_persisted_app_setting, save_persisted_bool_setting,
    APP_SETTING_CLOSE_TO_TRAY_ON_CLOSE_KEY, APP_SETTING_LIGHTWEIGHT_MODE_ON_CLOSE_TO_TRAY_KEY,
    APP_SETTING_UI_LOW_TRANSPARENCY_KEY, APP_SETTING_UI_THEME_KEY,
    APP_SETTING_UPDATE_AUTO_CHECK_KEY,
};

const DEFAULT_UI_THEME: &str = "tech";
const VALID_UI_THEMES: &[&str] = &[
    "tech", "dark", "business", "mint", "sunset", "grape", "ocean", "forest", "rose", "slate",
    "aurora",
];

fn normalize_ui_theme(raw: Option<&str>) -> String {
    let candidate = raw.unwrap_or(DEFAULT_UI_THEME).trim().to_ascii_lowercase();
    if VALID_UI_THEMES.iter().any(|theme| *theme == candidate) {
        candidate
    } else {
        DEFAULT_UI_THEME.to_string()
    }
}

pub fn current_update_auto_check_enabled() -> bool {
    get_persisted_app_setting(APP_SETTING_UPDATE_AUTO_CHECK_KEY)
        .map(|value| parse_bool_with_default(&value, true))
        .unwrap_or(true)
}

pub fn set_update_auto_check_enabled(enabled: bool) -> Result<bool, String> {
    save_persisted_bool_setting(APP_SETTING_UPDATE_AUTO_CHECK_KEY, enabled)?;
    Ok(enabled)
}

pub fn current_close_to_tray_on_close_setting() -> bool {
    get_persisted_app_setting(APP_SETTING_CLOSE_TO_TRAY_ON_CLOSE_KEY)
        .map(|value| parse_bool_with_default(&value, false))
        .unwrap_or(false)
}

pub fn set_close_to_tray_on_close_setting(enabled: bool) -> Result<bool, String> {
    save_persisted_bool_setting(APP_SETTING_CLOSE_TO_TRAY_ON_CLOSE_KEY, enabled)?;
    Ok(enabled)
}

pub fn current_lightweight_mode_on_close_to_tray_setting() -> bool {
    get_persisted_app_setting(APP_SETTING_LIGHTWEIGHT_MODE_ON_CLOSE_TO_TRAY_KEY)
        .map(|value| parse_bool_with_default(&value, false))
        .unwrap_or(false)
}

pub fn set_lightweight_mode_on_close_to_tray_setting(enabled: bool) -> Result<bool, String> {
    save_persisted_bool_setting(APP_SETTING_LIGHTWEIGHT_MODE_ON_CLOSE_TO_TRAY_KEY, enabled)?;
    Ok(enabled)
}

pub fn current_ui_low_transparency_enabled() -> bool {
    get_persisted_app_setting(APP_SETTING_UI_LOW_TRANSPARENCY_KEY)
        .map(|value| parse_bool_with_default(&value, false))
        .unwrap_or(false)
}

pub fn set_ui_low_transparency_enabled(enabled: bool) -> Result<bool, String> {
    save_persisted_bool_setting(APP_SETTING_UI_LOW_TRANSPARENCY_KEY, enabled)?;
    Ok(enabled)
}

pub fn current_ui_theme() -> String {
    normalize_ui_theme(get_persisted_app_setting(APP_SETTING_UI_THEME_KEY).as_deref())
}

pub fn set_ui_theme(theme: Option<&str>) -> Result<String, String> {
    let normalized = normalize_ui_theme(theme);
    save_persisted_app_setting(APP_SETTING_UI_THEME_KEY, Some(&normalized))?;
    Ok(normalized)
}

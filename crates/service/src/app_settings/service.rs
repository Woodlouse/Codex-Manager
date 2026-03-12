use super::{
    get_persisted_app_setting, normalize_optional_text, save_persisted_app_setting,
    APP_SETTING_SERVICE_ADDR_KEY,
};

pub const DEFAULT_ADDR: &str = "localhost:48760";
pub const DEFAULT_BIND_ADDR: &str = "0.0.0.0:48760";
pub const SERVICE_BIND_MODE_SETTING_KEY: &str = "service.bind_mode";
pub const SERVICE_BIND_MODE_LOOPBACK: &str = "loopback";
pub const SERVICE_BIND_MODE_ALL_INTERFACES: &str = "all_interfaces";

fn normalize_service_bind_mode(raw: Option<&str>) -> &'static str {
    let Some(value) = raw else {
        return SERVICE_BIND_MODE_LOOPBACK;
    };
    let normalized = value.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "all_interfaces" | "all-interfaces" | "all" | "0.0.0.0" => SERVICE_BIND_MODE_ALL_INTERFACES,
        _ => SERVICE_BIND_MODE_LOOPBACK,
    }
}

fn normalize_saved_service_addr(raw: Option<&str>) -> Result<String, String> {
    let Some(value) = normalize_optional_text(raw) else {
        return Ok(DEFAULT_ADDR.to_string());
    };
    let value = value
        .strip_prefix("http://")
        .or_else(|| value.strip_prefix("https://"))
        .unwrap_or(&value);
    let value = value.split('/').next().unwrap_or(value).trim();
    if value.is_empty() {
        return Err("service address is empty".to_string());
    }
    if value.contains(':') {
        return Ok(value.to_string());
    }
    Ok(format!("localhost:{value}"))
}

fn current_env_service_addr() -> Option<String> {
    let raw = std::env::var("CODEXMANAGER_SERVICE_ADDR").ok()?;
    let normalized = normalize_saved_service_addr(Some(&raw)).ok()?;
    let Some((host, port)) = normalized.rsplit_once(':') else {
        return Some(normalized);
    };
    match host {
        "0.0.0.0" | "::" | "[::]" => Some(format!("localhost:{port}")),
        _ => Some(normalized),
    }
}

fn current_env_service_bind_mode() -> Option<String> {
    let raw = std::env::var("CODEXMANAGER_SERVICE_ADDR").ok()?;
    let normalized = normalize_saved_service_addr(Some(&raw)).ok()?;
    let host = normalized
        .rsplit_once(':')
        .map(|(host, _)| host)
        .unwrap_or(normalized.as_str());
    let mode = match host {
        "0.0.0.0" | "::" | "[::]" => SERVICE_BIND_MODE_ALL_INTERFACES,
        _ => SERVICE_BIND_MODE_LOOPBACK,
    };
    Some(mode.to_string())
}

pub fn current_service_bind_mode() -> String {
    get_persisted_app_setting(SERVICE_BIND_MODE_SETTING_KEY)
        .map(|value| normalize_service_bind_mode(Some(&value)).to_string())
        .or_else(current_env_service_bind_mode)
        .unwrap_or_else(|| SERVICE_BIND_MODE_LOOPBACK.to_string())
}

pub fn set_service_bind_mode(mode: &str) -> Result<String, String> {
    let normalized = normalize_service_bind_mode(Some(mode)).to_string();
    save_persisted_app_setting(SERVICE_BIND_MODE_SETTING_KEY, Some(&normalized))?;
    Ok(normalized)
}

pub fn bind_all_interfaces_enabled() -> bool {
    current_service_bind_mode() == SERVICE_BIND_MODE_ALL_INTERFACES
}

pub fn default_listener_bind_addr() -> String {
    if bind_all_interfaces_enabled() {
        DEFAULT_BIND_ADDR.to_string()
    } else {
        DEFAULT_ADDR.to_string()
    }
}

pub fn listener_bind_addr(addr: &str) -> String {
    let trimmed = addr.trim();
    if trimmed.is_empty() {
        return default_listener_bind_addr();
    }

    let addr = trimmed.strip_prefix("http://").unwrap_or(trimmed);
    let addr = addr.strip_prefix("https://").unwrap_or(addr);
    let addr = addr.split('/').next().unwrap_or(addr);
    let bind_all = bind_all_interfaces_enabled();

    if !addr.contains(':') {
        return if bind_all {
            format!("0.0.0.0:{addr}")
        } else {
            format!("localhost:{addr}")
        };
    }

    let Some((host, port)) = addr.rsplit_once(':') else {
        return addr.to_string();
    };
    if host == "0.0.0.0" {
        return format!("0.0.0.0:{port}");
    }
    if host.eq_ignore_ascii_case("localhost")
        || host == "127.0.0.1"
        || host == "::1"
        || host == "[::1]"
    {
        return if bind_all {
            format!("0.0.0.0:{port}")
        } else {
            format!("localhost:{port}")
        };
    }

    addr.to_string()
}

pub fn current_saved_service_addr() -> String {
    get_persisted_app_setting(APP_SETTING_SERVICE_ADDR_KEY)
        .and_then(|value| normalize_saved_service_addr(Some(&value)).ok())
        .or_else(current_env_service_addr)
        .unwrap_or_else(|| DEFAULT_ADDR.to_string())
}

pub fn set_saved_service_addr(addr: Option<&str>) -> Result<String, String> {
    let normalized = normalize_saved_service_addr(addr)?;
    save_persisted_app_setting(APP_SETTING_SERVICE_ADDR_KEY, Some(&normalized))?;
    Ok(normalized)
}

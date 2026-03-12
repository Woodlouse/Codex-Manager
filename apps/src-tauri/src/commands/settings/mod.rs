pub(crate) mod gateway;
pub(crate) mod service_listen;
pub(crate) mod tray_state;
pub(crate) mod ui;

#[cfg_attr(not(test), allow(dead_code))]
pub fn effective_lightweight_mode_on_close_to_tray(
    requested: bool,
    close_to_tray_effective: bool,
) -> bool {
    tray_state::effective_lightweight_mode_on_close_to_tray(requested, close_to_tray_effective)
}

pub fn sync_window_runtime_state_from_settings(settings: &mut serde_json::Value) {
    tray_state::sync_window_runtime_state_from_settings(settings)
}

use rfd::{MessageButtons, MessageDialog, MessageLevel};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

use crate::service_runtime::stop_service;

use super::prompts::confirm_discard_unsaved_settings_for_app_exit;
use super::state::{
    has_unsaved_settings_draft_sections, mark_skip_next_unsaved_settings_exit_confirm,
    APP_EXIT_REQUESTED, KEEP_ALIVE_FOR_LIGHTWEIGHT_CLOSE, TRAY_AVAILABLE,
};
use super::window::show_main_window;

const TRAY_MENU_SHOW_MAIN: &str = "tray_show_main";
const TRAY_MENU_QUIT_APP: &str = "tray_quit_app";

pub(crate) fn notify_existing_instance_focused() {
    let _ = MessageDialog::new()
        .set_title("CodexManager")
        .set_description("CodexManager 已在运行，已切换到现有窗口。")
        .set_level(MessageLevel::Info)
        .set_buttons(MessageButtons::Ok)
        .show();
}

pub(crate) fn setup_tray(app: &tauri::AppHandle) -> Result<(), tauri::Error> {
    TRAY_AVAILABLE.store(false, std::sync::atomic::Ordering::Relaxed);
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
                if has_unsaved_settings_draft_sections() {
                    if !confirm_discard_unsaved_settings_for_app_exit() {
                        log::info!("tray exit canceled because settings drafts are still unsaved");
                        return;
                    }
                    mark_skip_next_unsaved_settings_exit_confirm();
                }
                APP_EXIT_REQUESTED.store(true, std::sync::atomic::Ordering::Relaxed);
                KEEP_ALIVE_FOR_LIGHTWEIGHT_CLOSE.store(false, std::sync::atomic::Ordering::Relaxed);
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
    TRAY_AVAILABLE.store(true, std::sync::atomic::Ordering::Relaxed);
    Ok(())
}

use std::sync::{
    atomic::{AtomicBool, Ordering},
    LazyLock, Mutex,
};

pub(crate) static APP_EXIT_REQUESTED: AtomicBool = AtomicBool::new(false);
pub(crate) static TRAY_AVAILABLE: AtomicBool = AtomicBool::new(false);
pub(crate) static CLOSE_TO_TRAY_ON_CLOSE: AtomicBool = AtomicBool::new(false);
pub(crate) static LIGHTWEIGHT_MODE_ON_CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(false);
pub(crate) static KEEP_ALIVE_FOR_LIGHTWEIGHT_CLOSE: AtomicBool = AtomicBool::new(false);
pub(crate) static SKIP_NEXT_UNSAVED_SETTINGS_WINDOW_CLOSE_CONFIRM: AtomicBool =
    AtomicBool::new(false);
pub(crate) static SKIP_NEXT_UNSAVED_SETTINGS_EXIT_CONFIRM: AtomicBool = AtomicBool::new(false);
static UNSAVED_SETTINGS_DRAFT_SECTIONS: LazyLock<Mutex<Vec<String>>> =
    LazyLock::new(|| Mutex::new(Vec::new()));

pub(crate) fn should_keep_alive_for_lightweight_close() -> bool {
    !APP_EXIT_REQUESTED.load(Ordering::Relaxed)
        && KEEP_ALIVE_FOR_LIGHTWEIGHT_CLOSE.load(Ordering::Relaxed)
}

pub(crate) fn set_unsaved_settings_draft_sections(sections: Vec<String>) {
    let mut normalized_sections = Vec::new();

    for section in sections {
        let normalized = section.trim();
        if normalized.is_empty()
            || normalized_sections
                .iter()
                .any(|existing: &String| existing.as_str() == normalized)
        {
            continue;
        }
        normalized_sections.push(normalized.to_string());
    }

    match UNSAVED_SETTINGS_DRAFT_SECTIONS.lock() {
        Ok(mut guard) => *guard = normalized_sections,
        Err(poisoned) => {
            log::warn!("unsaved settings sections state was poisoned while updating");
            *poisoned.into_inner() = normalized_sections;
        }
    }
}

pub(crate) fn current_unsaved_settings_draft_sections() -> Vec<String> {
    match UNSAVED_SETTINGS_DRAFT_SECTIONS.lock() {
        Ok(guard) => guard.clone(),
        Err(poisoned) => {
            log::warn!("unsaved settings sections state was poisoned while reading");
            poisoned.into_inner().clone()
        }
    }
}

pub(crate) fn has_unsaved_settings_draft_sections() -> bool {
    !current_unsaved_settings_draft_sections().is_empty()
}

pub(crate) fn mark_skip_next_unsaved_settings_window_close_confirm() {
    SKIP_NEXT_UNSAVED_SETTINGS_WINDOW_CLOSE_CONFIRM.store(true, Ordering::Relaxed);
}

pub(crate) fn take_skip_next_unsaved_settings_window_close_confirm() -> bool {
    SKIP_NEXT_UNSAVED_SETTINGS_WINDOW_CLOSE_CONFIRM.swap(false, Ordering::Relaxed)
}

pub(crate) fn mark_skip_next_unsaved_settings_exit_confirm() {
    SKIP_NEXT_UNSAVED_SETTINGS_EXIT_CONFIRM.store(true, Ordering::Relaxed);
}

pub(crate) fn take_skip_next_unsaved_settings_exit_confirm() -> bool {
    SKIP_NEXT_UNSAVED_SETTINGS_EXIT_CONFIRM.swap(false, Ordering::Relaxed)
}

pub(crate) fn clear_skip_next_unsaved_settings_confirms() {
    SKIP_NEXT_UNSAVED_SETTINGS_WINDOW_CLOSE_CONFIRM.store(false, Ordering::Relaxed);
    SKIP_NEXT_UNSAVED_SETTINGS_EXIT_CONFIRM.store(false, Ordering::Relaxed);
}

#[cfg(test)]
mod tests {
    use super::{
        clear_skip_next_unsaved_settings_confirms, mark_skip_next_unsaved_settings_exit_confirm,
        mark_skip_next_unsaved_settings_window_close_confirm,
        take_skip_next_unsaved_settings_exit_confirm,
        take_skip_next_unsaved_settings_window_close_confirm,
    };

    #[test]
    fn clears_skip_flags_for_unsaved_settings_confirms() {
        clear_skip_next_unsaved_settings_confirms();
        mark_skip_next_unsaved_settings_window_close_confirm();
        mark_skip_next_unsaved_settings_exit_confirm();

        clear_skip_next_unsaved_settings_confirms();

        assert!(!take_skip_next_unsaved_settings_window_close_confirm());
        assert!(!take_skip_next_unsaved_settings_exit_confirm());
    }
}

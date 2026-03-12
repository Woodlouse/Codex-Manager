use std::sync::atomic::{AtomicBool, Ordering};

pub(crate) static APP_EXIT_REQUESTED: AtomicBool = AtomicBool::new(false);
pub(crate) static TRAY_AVAILABLE: AtomicBool = AtomicBool::new(false);
pub(crate) static CLOSE_TO_TRAY_ON_CLOSE: AtomicBool = AtomicBool::new(false);
pub(crate) static LIGHTWEIGHT_MODE_ON_CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(false);
pub(crate) static KEEP_ALIVE_FOR_LIGHTWEIGHT_CLOSE: AtomicBool = AtomicBool::new(false);

pub(crate) fn should_keep_alive_for_lightweight_close() -> bool {
    !APP_EXIT_REQUESTED.load(Ordering::Relaxed)
        && KEEP_ALIVE_FOR_LIGHTWEIGHT_CLOSE.load(Ordering::Relaxed)
}

use crate::http::backend_runtime::{
    start_backend_server, start_backend_server_on, wake_backend_shutdown,
};
use crate::http::proxy_runtime::run_front_proxy;

pub fn start_http(addr: &str) -> std::io::Result<()> {
    if front_proxy_disabled() {
        let backend = start_backend_server_on(addr)?;
        let _ = backend.join.join();
        return Ok(());
    }
    let backend = start_backend_server()?;
    let result = run_front_proxy(addr, &backend.addr);
    wake_backend_shutdown(&backend.addr);
    let _ = backend.join.join();
    result
}

fn front_proxy_disabled() -> bool {
    std::env::var("CODEXMANAGER_FRONT_PROXY_DISABLED")
        .ok()
        .map(|value| value.trim().to_ascii_lowercase())
        .map(|value| matches!(value.as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(false)
}

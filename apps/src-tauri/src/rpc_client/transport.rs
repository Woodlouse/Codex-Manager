use codexmanager_core::rpc::types::JsonRpcRequest;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

use super::address::{resolve_service_addr, resolve_socket_addrs};
use super::http::parse_http_body;

fn rpc_call_on_socket(
    method: &str,
    addr: &str,
    sock: SocketAddr,
    params: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let mut stream =
        TcpStream::connect_timeout(&sock, Duration::from_millis(400)).map_err(|e| {
            let msg = format!("Failed to connect to service at {addr}: {e}");
            log::warn!(
                "rpc connect failed ({} -> {} via {}): {}",
                method,
                addr,
                sock,
                e
            );
            msg
        })?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(10)));

    let req = JsonRpcRequest {
        id: 1,
        method: method.to_string(),
        params,
    };
    let json = serde_json::to_string(&req).map_err(|e| e.to_string())?;
    let rpc_token = codexmanager_service::rpc_auth_token();
    let http = format!(
        "POST /rpc HTTP/1.1\r\nHost: {addr}\r\nContent-Type: application/json\r\nX-CodexManager-Rpc-Token: {rpc_token}\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}",
        json.len(),
        json
    );
    stream.write_all(http.as_bytes()).map_err(|e| {
        let msg = e.to_string();
        log::warn!(
            "rpc write failed ({} -> {} via {}): {}",
            method,
            addr,
            sock,
            msg
        );
        msg
    })?;

    let mut buf = String::new();
    stream.read_to_string(&mut buf).map_err(|e| {
        let msg = e.to_string();
        log::warn!(
            "rpc read failed ({} -> {} via {}): {}",
            method,
            addr,
            sock,
            msg
        );
        msg
    })?;
    let body = parse_http_body(&buf).map_err(|msg| {
        log::warn!(
            "rpc parse failed ({} -> {} via {}): {}",
            method,
            addr,
            sock,
            msg
        );
        msg
    })?;
    if body.trim().is_empty() {
        log::warn!("rpc empty response ({} -> {} via {})", method, addr, sock);
        return Err(
            "Empty response from service (service not ready, exited, or port occupied)".to_string(),
        );
    }

    let v: serde_json::Value = serde_json::from_str(&body).map_err(|e| {
        let msg = format!("Unexpected RPC response (non-JSON body): {e}");
        log::warn!(
            "rpc json parse failed ({} -> {} via {}): {}",
            method,
            addr,
            sock,
            msg
        );
        msg
    })?;
    if let Some(err) = v.get("error") {
        log::warn!("rpc error ({} -> {} via {}): {}", method, addr, sock, err);
    }
    Ok(v)
}

pub(crate) fn rpc_call_with_sockets(
    method: &str,
    addr: &str,
    socket_addrs: &[SocketAddr],
    params: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    if socket_addrs.is_empty() {
        return Err(format!(
            "Invalid service address {addr}: no address resolved"
        ));
    }
    let mut last_err =
        "Empty response from service (service not ready, exited, or port occupied)".to_string();
    for attempt in 0..=1 {
        for sock in socket_addrs {
            match rpc_call_on_socket(method, addr, *sock, params.clone()) {
                Ok(v) => return Ok(v),
                Err(err) => last_err = err,
            }
        }
        if attempt == 0 {
            std::thread::sleep(Duration::from_millis(120));
        }
    }
    Err(last_err)
}

pub(crate) fn rpc_call(
    method: &str,
    addr: Option<String>,
    params: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let addr = resolve_service_addr(addr)?;
    let socket_addrs = resolve_socket_addrs(&addr)?;
    rpc_call_with_sockets(method, &addr, &socket_addrs, params)
}

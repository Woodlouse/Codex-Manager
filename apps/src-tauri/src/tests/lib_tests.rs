use crate::commands::settings::effective_lightweight_mode_on_close_to_tray;
use crate::app_storage::{
    read_account_import_contents_from_directory, resolve_rpc_token_path_for_db,
};
use crate::rpc_client::{normalize_addr, rpc_call, rpc_call_with_sockets};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

#[test]
fn normalize_addr_defaults_to_localhost() {
    assert_eq!(normalize_addr("5050").unwrap(), "localhost:5050");
    assert_eq!(normalize_addr("localhost:5050").unwrap(), "localhost:5050");
    assert_eq!(normalize_addr("example.com").unwrap(), "example.com");
}

#[test]
fn lightweight_close_to_tray_requires_close_to_tray_mode() {
    assert!(!effective_lightweight_mode_on_close_to_tray(false, true));
    assert!(!effective_lightweight_mode_on_close_to_tray(true, false));
    assert!(effective_lightweight_mode_on_close_to_tray(true, true));
}

#[test]
fn rpc_call_tolerates_slow_response() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
    let addr = listener.local_addr().expect("addr");
    std::thread::spawn(move || {
        if let Ok((mut stream, _)) = listener.accept() {
            let mut buf = [0u8; 512];
            let _ = stream.read(&mut buf);
            std::thread::sleep(Duration::from_secs(3));
            let body = r#"{"result":{"ok":true}}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(response.as_bytes());
        }
    });

    let res = rpc_call("initialize", Some(addr.to_string()), None);
    assert!(res.is_ok());
}

#[test]
fn rpc_call_handles_chunked_response() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
    let addr = listener.local_addr().expect("addr");
    std::thread::spawn(move || {
        if let Ok((mut stream, _)) = listener.accept() {
            let mut buf = [0u8; 1024];
            let read_n = stream.read(&mut buf).expect("read");
            let request = String::from_utf8_lossy(&buf[..read_n]).to_string();
            assert!(
                request.to_ascii_lowercase().contains("connection: close"),
                "request should require connection close: {request}"
            );

            let body = r#"{"result":{"ok":true}}"#;
            let chunk_size = format!("{:X}", body.len());
            let response = format!(
          "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n{chunk_size}\r\n{body}\r\n0\r\n\r\n"
        );
            let _ = stream.write_all(response.as_bytes());
        }
    });

    let res = rpc_call("initialize", Some(addr.to_string()), None).expect("rpc_call");
    let ok = res
        .get("result")
        .and_then(|v| v.get("ok"))
        .and_then(|v| v.as_bool());
    assert_eq!(ok, Some(true));
}

#[test]
fn rpc_call_falls_back_to_next_socket_after_empty_response() {
    let bad_listener = TcpListener::bind("127.0.0.1:0").expect("bind bad");
    let good_listener = TcpListener::bind("127.0.0.1:0").expect("bind good");
    let bad_addr = bad_listener.local_addr().expect("bad addr");
    let good_addr = good_listener.local_addr().expect("good addr");

    std::thread::spawn(move || {
        if let Ok((mut stream, _)) = bad_listener.accept() {
            let mut buf = [0u8; 1024];
            let _ = stream.read(&mut buf);
            // 中文注释：模拟端口被无效服务占用后“直接断开连接”，触发空响应。
        }
    });

    std::thread::spawn(move || {
        if let Ok((mut stream, _)) = good_listener.accept() {
            let mut buf = [0u8; 1024];
            let _ = stream.read(&mut buf);
            let body = r#"{"result":{"server_name":"codexmanager-service","version":"test"}}"#;
            let response = format!(
          "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
          body.len(),
          body
        );
            let _ = stream.write_all(response.as_bytes());
        }
    });

    let res = rpc_call_with_sockets(
        "initialize",
        "localhost:48760",
        &[bad_addr, good_addr],
        None,
    )
    .expect("rpc_call_with_sockets");
    let server_name = res
        .get("result")
        .and_then(|v| v.get("server_name"))
        .and_then(|v| v.as_str());
    assert_eq!(server_name, Some("codexmanager-service"));
}

#[test]
fn rpc_token_path_stays_in_db_dir() {
    let db =
        PathBuf::from("C:/Users/test/AppData/Roaming/com.codexmanager.desktop/codexmanager.db");
    let token = resolve_rpc_token_path_for_db(&db);
    assert_eq!(
        token,
        PathBuf::from(
            "C:/Users/test/AppData/Roaming/com.codexmanager.desktop/codexmanager.rpc-token"
        )
    );
}

#[test]
fn read_account_import_contents_from_directory_collects_nested_json_files() {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let root = std::env::temp_dir().join(format!("codexmanager-import-{unique}"));
    let nested = root.join("nested");
    fs::create_dir_all(&nested).expect("create nested dir");
    fs::write(root.join("a.json"), r#"{"id":"a"}"#).expect("write a.json");
    fs::write(root.join("ignore.txt"), "ignore").expect("write ignore.txt");
    fs::write(nested.join("b.JSON"), r#"{"id":"b"}"#).expect("write b.JSON");
    fs::write(nested.join("empty.json"), "   ").expect("write empty.json");

    let (files, contents) =
        read_account_import_contents_from_directory(&root).expect("read import contents");

    assert_eq!(files.len(), 3);
    assert_eq!(contents.len(), 2);
    assert!(contents.iter().any(|item| item.contains(r#""id":"a""#)));
    assert!(contents.iter().any(|item| item.contains(r#""id":"b""#)));

    fs::remove_dir_all(&root).expect("cleanup temp dir");
}

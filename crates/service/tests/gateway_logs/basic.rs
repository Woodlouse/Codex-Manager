use super::*;

#[test]
fn gateway_logs_invalid_api_key_error() {
    let _lock = lock_env();
    let dir = new_test_dir("codexmanager-gateway-logs");
    let db_path: PathBuf = dir.join("codexmanager.db");

    let _guard = EnvGuard::set("CODEXMANAGER_DB_PATH", db_path.to_string_lossy().as_ref());

    let server = TestServer::start();
    let req_body = r#"{"model":"gpt-5.3-codex","input":"hello"}"#;
    let (status, _) = post_http_raw(
        &server.addr,
        "/v1/responses",
        req_body,
        &[
            ("Content-Type", "application/json"),
            ("Authorization", "Bearer invalid-platform-key"),
        ],
    );
    assert_eq!(status, 403);

    let storage = Storage::open(&db_path).expect("open db");
    storage.init().expect("init schema");
    let mut logs = Vec::new();
    for _ in 0..40 {
        logs = storage
            .list_request_logs(None, 100)
            .expect("list request logs");
        if !logs.is_empty() {
            break;
        }
        thread::sleep(Duration::from_millis(50));
    }
    let found = logs.iter().any(|item| {
        item.request_path == "/v1/responses"
            && item.status_code == Some(403)
            && item.input_tokens.is_none()
            && item.cached_input_tokens.is_none()
            && item.output_tokens.is_none()
            && item.total_tokens.is_none()
            && item.reasoning_output_tokens.is_none()
            && item.error.as_deref() == Some("invalid api key")
    });
    assert!(
        found,
        "expected invalid api key request to be logged, got {:?}",
        logs.iter()
            .map(|v| (&v.request_path, v.status_code, v.error.as_deref()))
            .collect::<Vec<_>>()
    );
}

#[test]
fn gateway_tolerates_non_ascii_turn_metadata_header() {
    let _lock = lock_env();
    let dir = new_test_dir("codexmanager-gateway-logs-nonascii");
    let db_path: PathBuf = dir.join("codexmanager.db");

    let _guard = EnvGuard::set("CODEXMANAGER_DB_PATH", db_path.to_string_lossy().as_ref());

    let server = TestServer::start();
    let req_body = r#"{"model":"gpt-5.3-codex","input":"hello"}"#;
    let metadata = r#"{"workspaces":{"D:\\MyComputer\\own\\GPTTeam相关\\CodexManager\\CodexManager":{"latest_git_commit_hash":"abc123"}}}"#;
    let (status, body) = post_http_raw(
        &server.addr,
        "/v1/responses",
        req_body,
        &[
            ("Content-Type", "application/json"),
            ("Authorization", "Bearer invalid-platform-key"),
            ("x-codex-turn-metadata", metadata),
        ],
    );
    assert_eq!(status, 403, "response body: {body}");
}

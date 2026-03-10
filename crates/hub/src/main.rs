use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use codexmanager_hub::{
    build_register_payload, build_rpc_url, normalize_service_addr, summarize_statuses, RegisterInput,
    StatusSummary,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;

const DEFAULT_SERVICE_ADDR: &str = "localhost:48760";
const DEFAULT_REGISTER_URL: &str = "http://auto-register-go:8899";
const DEFAULT_HUB_ADDR: &str = "0.0.0.0:48800";

#[derive(Clone)]
struct AppState {
    client: reqwest::Client,
    service_rpc_url: String,
    rpc_token: String,
    register_base_url: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct AccountSummaryItem {
    id: String,
    label: String,
    #[serde(rename = "groupName")]
    group_name: Option<String>,
    sort: i64,
    status: String,
}

#[tokio::main]
async fn main() {
    let service_addr = resolve_service_addr();
    let rpc_url = build_rpc_url(&service_addr);
    let rpc_token = resolve_rpc_token().unwrap_or_else(|err| {
        eprintln!("hub init failed: {err}");
        std::process::exit(1);
    });
    let register_base_url = resolve_register_base_url();
    let hub_addr = resolve_hub_addr();

    let state = Arc::new(AppState {
        client: reqwest::Client::new(),
        service_rpc_url: rpc_url,
        rpc_token,
        register_base_url,
    });

    let app = Router::new()
        .route("/", get(index))
        .route("/api/accounts", get(get_accounts))
        .route("/api/import/register-db", post(import_register_db))
        .route("/api/register/start", post(register_start))
        .route("/api/register/stop", post(register_stop))
        .route("/api/register/status", get(register_status))
        .with_state(state);

    println!("Account Hub listening on http://{hub_addr}");
    let listener = tokio::net::TcpListener::bind(&hub_addr)
        .await
        .unwrap_or_else(|err| {
            eprintln!("bind failed: {err}");
            std::process::exit(1);
        });
    if let Err(err) = axum::serve(listener, app).await {
        eprintln!("serve failed: {err}");
    }
}

async fn index() -> Html<&'static str> {
    Html(include_str!("../assets/index.html"))
}

async fn get_accounts(State(state): State<Arc<AppState>>) -> Response {
    let rpc_result = match call_rpc(&state, "account/list", None).await {
        Ok(value) => value,
        Err(err) => return err_response(StatusCode::BAD_GATEWAY, err),
    };
    let items_value = rpc_result
        .get("items")
        .cloned()
        .unwrap_or_else(|| json!([]));
    let items: Vec<AccountSummaryItem> = match serde_json::from_value(items_value) {
        Ok(list) => list,
        Err(err) => return err_response(StatusCode::BAD_GATEWAY, err.to_string()),
    };
    let summary = summarize_statuses(items.iter().map(|item| item.status.as_str()));
    Json(json!({
        "ok": true,
        "summary": render_summary(summary),
        "items": items,
    }))
    .into_response()
}

async fn import_register_db(State(state): State<Arc<AppState>>) -> Response {
    match call_rpc(&state, "account/importFromRegisterDb", None).await {
        Ok(value) => Json(value).into_response(),
        Err(err) => err_response(StatusCode::BAD_GATEWAY, err),
    }
}

async fn register_start(State(state): State<Arc<AppState>>, Json(payload): Json<Value>) -> Response {
    let input: RegisterInput = match serde_json::from_value(payload) {
        Ok(value) => value,
        Err(err) => return err_response(StatusCode::BAD_REQUEST, err.to_string()),
    };
    let register_payload = match build_register_payload(&input) {
        Ok(value) => value,
        Err(err) => return err_response(StatusCode::BAD_REQUEST, err),
    };
    proxy_register_json(&state, "start", Some(register_payload)).await
}

async fn register_stop(State(state): State<Arc<AppState>>) -> Response {
    proxy_register_json(&state, "stop", None).await
}

async fn register_status(State(state): State<Arc<AppState>>) -> Response {
    proxy_register_json(&state, "status", None).await
}

async fn proxy_register_json(state: &AppState, path: &str, payload: Option<Value>) -> Response {
    let url = format!("{}/api/{}", state.register_base_url, path.trim_matches('/'));
    let mut req = state.client.post(&url);
    if let Some(body) = payload {
        req = req.json(&body);
    }
    let resp = req.send().await;
    let resp = match resp {
        Ok(v) => v,
        Err(err) => return err_response(StatusCode::BAD_GATEWAY, err.to_string()),
    };
    let status = resp.status();
    let value: Value = match resp.json().await {
        Ok(v) => v,
        Err(err) => return err_response(StatusCode::BAD_GATEWAY, err.to_string()),
    };
    let mut out = Json(value).into_response();
    *out.status_mut() = status;
    out
}

async fn call_rpc(state: &AppState, method: &str, params: Option<Value>) -> Result<Value, String> {
    let body = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    });
    let resp = state
        .client
        .post(&state.service_rpc_url)
        .header("content-type", "application/json")
        .header("x-codexmanager-rpc-token", &state.rpc_token)
        .json(&body)
        .send()
        .await
        .map_err(|err| format!("rpc request failed: {err}"))?;
    if !resp.status().is_success() {
        return Err(format!("rpc status {}", resp.status()));
    }
    let value: Value = resp.json().await.map_err(|err| err.to_string())?;
    if let Some(err) = value.get("error") {
        return Err(format!("rpc error: {err}"));
    }
    if let Some(result) = value.get("result") {
        if result.get("error").is_some() {
            return Err(result
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("rpc result error")
                .to_string());
        }
        return Ok(result.clone());
    }
    Ok(value)
}

fn render_summary(summary: StatusSummary) -> Value {
    let mut by_status = serde_json::Map::new();
    for (key, value) in summary.by_status {
        by_status.insert(key, Value::from(value as i64));
    }
    json!({
        "total": summary.total,
        "byStatus": by_status,
    })
}

fn resolve_service_addr() -> String {
    let raw = read_env_trim("CODEXMANAGER_SERVICE_ADDR").unwrap_or_else(|| DEFAULT_SERVICE_ADDR.to_string());
    normalize_service_addr(&raw).unwrap_or_else(|| DEFAULT_SERVICE_ADDR.to_string())
}

fn resolve_register_base_url() -> String {
    read_env_trim("AUTO_REGISTER_BASE_URL").unwrap_or_else(|| DEFAULT_REGISTER_URL.to_string())
}

fn resolve_hub_addr() -> String {
    read_env_trim("HUB_ADDR").unwrap_or_else(|| DEFAULT_HUB_ADDR.to_string())
}

fn resolve_rpc_token() -> Result<String, String> {
    if let Some(token) = read_env_trim("CODEXMANAGER_RPC_TOKEN") {
        return Ok(token);
    }
    let token_path = read_env_trim("CODEXMANAGER_RPC_TOKEN_FILE")
        .map(PathBuf::from)
        .or_else(|| resolve_default_rpc_token_path());
    if let Some(path) = token_path {
        if let Ok(text) = std::fs::read_to_string(&path) {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_string());
            }
        }
        return Err(format!("rpc token file missing or empty: {}", path.display()));
    }
    Err("rpc token not configured".to_string())
}

fn resolve_default_rpc_token_path() -> Option<PathBuf> {
    let db_path = read_env_trim("CODEXMANAGER_DB_PATH")?;
    let path = PathBuf::from(db_path);
    path.parent()
        .map(|parent| parent.join("codexmanager.rpc-token"))
        .or_else(|| Some(PathBuf::from("codexmanager.rpc-token")))
}

fn read_env_trim(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn err_response(status: StatusCode, message: String) -> Response {
    (status, Json(json!({ "ok": false, "error": message }))).into_response()
}

use rand::distributions::{Alphanumeric, DistString};
use rand::Rng;
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct StatusSummary {
    pub total: usize,
    pub by_status: BTreeMap<String, usize>,
}

pub fn normalize_service_addr(_input: &str) -> Option<String> {
    let mut value = _input.trim();
    if value.is_empty() {
        return None;
    }
    if let Some(rest) = value.strip_prefix("http://") {
        value = rest;
    }
    if let Some(rest) = value.strip_prefix("https://") {
        value = rest;
    }
    value = value.split('/').next().unwrap_or(value);
    if value.is_empty() {
        return None;
    }
    if value.contains(':') {
        return Some(value.to_string());
    }
    if value.chars().all(|ch| ch.is_ascii_digit()) {
        return Some(format!("localhost:{value}"));
    }
    Some(value.to_string())
}

pub fn build_rpc_url(_input: &str) -> String {
    let addr = normalize_service_addr(_input).unwrap_or_else(|| "localhost:48760".to_string());
    format!("http://{addr}/rpc")
}

pub fn summarize_statuses<I, S>(_items: I) -> StatusSummary
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut summary = StatusSummary::default();
    for item in _items {
        let raw = item.as_ref().trim();
        if raw.is_empty() {
            continue;
        }
        let key = raw.to_ascii_lowercase();
        *summary.by_status.entry(key).or_insert(0) += 1;
        summary.total += 1;
    }
    summary
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct RegisterInput {
    pub accounts: Option<String>,
    pub proxy: Option<String>,
    pub workers: Option<i64>,
    pub login_mode: Option<bool>,
    pub skip_finished: Option<bool>,
    pub duckmail: Option<DuckMailInput>,
    pub duckmail_generate: Option<DuckMailGenerateInput>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct DuckMailInput {
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub mailbox_password: Option<String>,
    pub poll_seconds: Option<i64>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct DuckMailGenerateInput {
    pub domain: Option<String>,
    pub prefix: Option<String>,
    pub count: Option<i64>,
    pub openai_password: Option<String>,
}

pub fn build_register_payload(input: &RegisterInput) -> Result<Value, String> {
    let accounts_raw = input
        .accounts
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_string();
    let proxy = input.proxy.clone().unwrap_or_default();
    let workers = input.workers.unwrap_or(1).max(1);
    let login_mode = input.login_mode.unwrap_or(false);
    let skip_finished = input.skip_finished.unwrap_or(false);

    if !accounts_raw.is_empty() {
        return Ok(serde_json::json!({
            "accounts": accounts_raw,
            "proxy": proxy,
            "workers": workers,
            "login_mode": login_mode,
            "skip_finished": skip_finished,
        }));
    }

    let duckmail = input
        .duckmail
        .clone()
        .ok_or_else(|| "未提供账号列表，需填写 DuckMail 配置".to_string())?;
    let mailbox_password = duckmail
        .mailbox_password
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_string();
    if mailbox_password.len() < 6 {
        return Err("DuckMail 邮箱密码至少 6 位".to_string());
    }

    let base_url = duckmail
        .base_url
        .as_deref()
        .unwrap_or("https://api.duckmail.sbs")
        .trim()
        .to_string();
    let api_key = duckmail
        .api_key
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_string();
    let poll_seconds = duckmail.poll_seconds.unwrap_or(3).max(1);

    let gen = input.duckmail_generate.clone().unwrap_or_default();
    let domain = gen
        .domain
        .as_deref()
        .unwrap_or("duckmail.sbs")
        .trim()
        .to_string();
    if domain.is_empty() {
        return Err("DuckMail 域名不能为空".to_string());
    }
    let prefix = gen
        .prefix
        .as_deref()
        .unwrap_or("duck")
        .trim()
        .to_string();
    let count = match gen.count {
        Some(value) if value > 0 => value,
        _ => 5,
    };
    let openai_password = gen
        .openai_password
        .as_deref()
        .unwrap_or("Qwer1234!")
        .trim()
        .to_string();
    if openai_password.is_empty() {
        return Err("OpenAI 密码不能为空".to_string());
    }

    let accounts = generate_duckmail_accounts(
        count as usize,
        &domain,
        &prefix,
        &openai_password,
    );

    let mut duckmail_obj = serde_json::Map::new();
    duckmail_obj.insert("base_url".to_string(), Value::String(base_url));
    if !api_key.is_empty() {
        duckmail_obj.insert("api_key".to_string(), Value::String(api_key));
    }
    duckmail_obj.insert(
        "mailbox_password".to_string(),
        Value::String(mailbox_password),
    );
    duckmail_obj.insert("poll_seconds".to_string(), Value::from(poll_seconds));

    Ok(serde_json::json!({
        "accounts": accounts,
        "proxy": proxy,
        "workers": workers,
        "login_mode": login_mode,
        "skip_finished": skip_finished,
        "duckmail": Value::Object(duckmail_obj),
    }))
}

fn generate_duckmail_accounts(count: usize, domain: &str, prefix: &str, password: &str) -> String {
    let mut rng = rand::thread_rng();
    let mut lines = Vec::with_capacity(count);
    for _ in 0..count {
        let rand_part = Alphanumeric
            .sample_string(&mut rng, 6)
            .to_ascii_lowercase();
        let suffix: u16 = rng.gen_range(0..1000);
        let email = format!("{prefix}{rand_part}{suffix}@{domain}");
        lines.push(format!("{email}----{password}"));
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn normalize_service_addr_accepts_scheme_and_port() {
        assert_eq!(
            normalize_service_addr("http://localhost:48760/"),
            Some("localhost:48760".to_string())
        );
    }

    #[test]
    fn normalize_service_addr_accepts_host_port() {
        assert_eq!(
            normalize_service_addr("127.0.0.1:9999"),
            Some("127.0.0.1:9999".to_string())
        );
    }

    #[test]
    fn normalize_service_addr_accepts_port_only() {
        assert_eq!(
            normalize_service_addr("48760"),
            Some("localhost:48760".to_string())
        );
    }

    #[test]
    fn build_rpc_url_uses_normalized_addr() {
        assert_eq!(
            build_rpc_url("localhost:48760"),
            "http://localhost:48760/rpc"
        );
    }

    #[test]
    fn summarize_statuses_counts_by_status() {
        let summary = summarize_statuses(["active", "active", "inactive", "", "low"]);
        assert_eq!(summary.total, 4);
        assert_eq!(summary.by_status.get("active"), Some(&2));
        assert_eq!(summary.by_status.get("inactive"), Some(&1));
        assert_eq!(summary.by_status.get("low"), Some(&1));
    }

    #[test]
    fn register_payload_prefers_accounts_when_provided() {
        let input = RegisterInput {
            accounts: Some("demo@outlook.com----pass".to_string()),
            proxy: Some("".to_string()),
            workers: Some(3),
            login_mode: Some(false),
            skip_finished: Some(true),
            duckmail: Some(DuckMailInput {
                base_url: Some("https://api.duckmail.sbs".to_string()),
                api_key: Some("dk_test".to_string()),
                mailbox_password: Some("Duck123!".to_string()),
                poll_seconds: Some(3),
            }),
            duckmail_generate: Some(DuckMailGenerateInput {
                domain: Some("duckmail.sbs".to_string()),
                prefix: Some("duck".to_string()),
                count: Some(2),
                openai_password: Some("Qwer1234!".to_string()),
            }),
        };

        let payload = build_register_payload(&input).expect("payload");
        assert_eq!(
            payload.get("accounts").and_then(Value::as_str),
            Some("demo@outlook.com----pass")
        );
        assert!(payload.get("duckmail").is_none());
    }

    #[test]
    fn register_payload_defaults_to_duckmail_when_accounts_empty() {
        let input = RegisterInput {
            accounts: Some("".to_string()),
            proxy: Some("http://127.0.0.1:8080".to_string()),
            workers: Some(4),
            login_mode: Some(false),
            skip_finished: Some(true),
            duckmail: Some(DuckMailInput {
                base_url: Some("https://api.duckmail.sbs".to_string()),
                api_key: None,
                mailbox_password: Some("Duck123!".to_string()),
                poll_seconds: Some(3),
            }),
            duckmail_generate: Some(DuckMailGenerateInput {
                domain: Some("duckmail.sbs".to_string()),
                prefix: Some("duck".to_string()),
                count: Some(2),
                openai_password: Some("Qwer1234!".to_string()),
            }),
        };

        let payload = build_register_payload(&input).expect("payload");
        let accounts = payload
            .get("accounts")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let lines: Vec<&str> = accounts.lines().collect();
        assert_eq!(lines.len(), 2);
        for line in lines {
            assert!(line.starts_with("duck"));
            assert!(line.contains("@duckmail.sbs"));
            assert!(line.ends_with("----Qwer1234!"));
        }
        assert!(payload.get("duckmail").is_some());
    }

    #[test]
    fn register_payload_requires_duckmail_when_accounts_missing() {
        let input = RegisterInput {
            accounts: None,
            proxy: None,
            workers: None,
            login_mode: None,
            skip_finished: None,
            duckmail: None,
            duckmail_generate: None,
        };

        let err = build_register_payload(&input).expect_err("expected error");
        assert!(err.contains("DuckMail"));
    }

    #[test]
    fn hub_index_includes_duckmail_form_fields() {
        let html = include_str!("../assets/index.html");
        assert!(html.contains("DuckMail"));
        assert!(html.contains("duckmailCount"));
        assert!(html.contains("账号数量"));
    }
}

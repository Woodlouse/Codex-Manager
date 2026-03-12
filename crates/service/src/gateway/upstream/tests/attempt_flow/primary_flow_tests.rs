use super::resolve_chatgpt_primary_bearer;
use codexmanager_core::storage::Token;

fn build_token(access_token: &str) -> Token {
    Token {
        account_id: "acc-test".to_string(),
        id_token: "id-token".to_string(),
        access_token: access_token.to_string(),
        refresh_token: "refresh-token".to_string(),
        api_key_access_token: Some("api-key-token".to_string()),
        last_refresh: 0,
    }
}

#[test]
fn chatgpt_primary_bearer_prefers_access_token() {
    let token = build_token("access-token");
    assert_eq!(
        resolve_chatgpt_primary_bearer(&token).as_deref(),
        Some("access-token")
    );
}

#[test]
fn chatgpt_primary_bearer_rejects_empty_access_token() {
    let token = build_token("   ");
    assert!(resolve_chatgpt_primary_bearer(&token).is_none());
}

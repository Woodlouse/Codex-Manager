use std::sync::OnceLock;

static RPC_AUTH_TOKEN: OnceLock<String> = OnceLock::new();

fn build_rpc_auth_token() -> String {
    if let Some(token) = crate::process_env::read_rpc_token_from_env_or_file() {
        std::env::set_var(crate::process_env::ENV_RPC_TOKEN, &token);
        return token;
    }

    let generated = crate::process_env::generate_rpc_token_hex_32bytes();
    std::env::set_var(crate::process_env::ENV_RPC_TOKEN, &generated);

    if let Some(existing) = crate::process_env::persist_rpc_token_if_missing(&generated) {
        std::env::set_var(crate::process_env::ENV_RPC_TOKEN, &existing);
        return existing;
    }

    generated
}

pub fn rpc_auth_token() -> &'static str {
    RPC_AUTH_TOKEN.get_or_init(build_rpc_auth_token).as_str()
}

pub(crate) fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let mut diff = 0u8;
    for (a, b) in left.iter().zip(right.iter()) {
        diff |= a ^ b;
    }
    diff == 0
}

pub fn rpc_auth_token_matches(candidate: &str) -> bool {
    let expected = rpc_auth_token();
    constant_time_eq(expected.as_bytes(), candidate.trim().as_bytes())
}

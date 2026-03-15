use codexmanager_core::rpc::types::RequestLogSummary;

use crate::storage_helpers::open_storage;

fn normalize_upstream_url(raw: Option<&str>) -> Option<String> {
    raw.map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

pub(crate) fn read_request_logs(
    query: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<RequestLogSummary>, String> {
    let storage = open_storage().ok_or_else(|| "open storage failed".to_string())?;
    let logs = storage
        .list_request_logs(query.as_deref(), limit.unwrap_or(200))
        .map_err(|err| format!("list request logs failed: {err}"))?;
    Ok(logs
        .into_iter()
        .map(|item| RequestLogSummary {
            trace_id: item.trace_id,
            key_id: item.key_id,
            account_id: item.account_id,
            request_path: item.request_path,
            original_path: item.original_path,
            adapted_path: item.adapted_path,
            method: item.method,
            model: item.model,
            reasoning_effort: item.reasoning_effort,
            response_adapter: item.response_adapter,
            upstream_url: normalize_upstream_url(item.upstream_url.as_deref()),
            status_code: item.status_code,
            duration_ms: item.duration_ms,
            input_tokens: item.input_tokens,
            cached_input_tokens: item.cached_input_tokens,
            output_tokens: item.output_tokens,
            total_tokens: item.total_tokens,
            reasoning_output_tokens: item.reasoning_output_tokens,
            estimated_cost_usd: item.estimated_cost_usd,
            error: item.error,
            created_at: item.created_at,
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::normalize_upstream_url;

    #[test]
    fn normalize_upstream_url_keeps_official_domains() {
        assert_eq!(
            normalize_upstream_url(Some(
                "https://chatgpt.com/backend-api/codex/responses"
            ))
            .as_deref(),
            Some("https://chatgpt.com/backend-api/codex/responses")
        );
        assert_eq!(
            normalize_upstream_url(Some("https://api.openai.com/v1/responses"))
                .as_deref(),
            Some("https://api.openai.com/v1/responses")
        );
    }

    #[test]
    fn normalize_upstream_url_keeps_local_addresses() {
        assert_eq!(
            normalize_upstream_url(Some("http://127.0.0.1:3000/relay")).as_deref(),
            Some("http://127.0.0.1:3000/relay")
        );
        assert_eq!(
            normalize_upstream_url(Some("http://localhost:3000/relay")).as_deref(),
            Some("http://localhost:3000/relay")
        );
    }

    #[test]
    fn normalize_upstream_url_keeps_custom_addresses() {
        assert_eq!(
            normalize_upstream_url(Some("https://gateway.example.com/v1")).as_deref(),
            Some("https://gateway.example.com/v1")
        );
    }

    #[test]
    fn normalize_upstream_url_trims_empty_values() {
        assert_eq!(normalize_upstream_url(None), None);
        assert_eq!(normalize_upstream_url(Some("   ")), None);
        assert_eq!(
            normalize_upstream_url(Some(" https://api.openai.com/v1/responses ")).as_deref(),
            Some("https://api.openai.com/v1/responses")
        );
    }
}

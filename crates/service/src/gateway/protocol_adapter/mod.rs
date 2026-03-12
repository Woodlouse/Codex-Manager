use serde_json::Value;

pub(super) mod prompt_cache;
mod request_mapping;
mod request_router;
mod response_conversion;
mod types;

pub(super) use self::request_router::adapt_request_for_protocol;
pub(super) use self::types::{AdaptedGatewayRequest, ResponseAdapter, ToolNameRestoreMap};

pub(super) fn adapt_upstream_response(
    adapter: ResponseAdapter,
    upstream_content_type: Option<&str>,
    body: &[u8],
) -> Result<(Vec<u8>, &'static str), String> {
    response_conversion::adapt_upstream_response(adapter, upstream_content_type, body, None)
}

pub(super) fn adapt_upstream_response_with_tool_name_restore_map(
    adapter: ResponseAdapter,
    upstream_content_type: Option<&str>,
    body: &[u8],
    tool_name_restore_map: Option<&ToolNameRestoreMap>,
) -> Result<(Vec<u8>, &'static str), String> {
    response_conversion::adapt_upstream_response(
        adapter,
        upstream_content_type,
        body,
        tool_name_restore_map,
    )
}

pub(super) fn build_anthropic_error_body(message: &str) -> Vec<u8> {
    response_conversion::build_anthropic_error_body(message)
}

pub(super) fn convert_openai_completions_stream_chunk(value: &Value) -> Option<Value> {
    response_conversion::convert_openai_completions_stream_chunk(value)
}

#[allow(dead_code)]
pub(super) fn convert_openai_chat_stream_chunk(value: &Value) -> Option<Value> {
    response_conversion::convert_openai_chat_stream_chunk(value)
}

pub(super) fn convert_openai_chat_stream_chunk_with_tool_name_restore_map(
    value: &Value,
    tool_name_restore_map: Option<&ToolNameRestoreMap>,
) -> Option<Value> {
    response_conversion::convert_openai_chat_stream_chunk_with_tool_name_restore_map(
        value,
        tool_name_restore_map,
    )
}

#[cfg(test)]
#[path = "tests/protocol_adapter_tests.rs"]
mod tests;

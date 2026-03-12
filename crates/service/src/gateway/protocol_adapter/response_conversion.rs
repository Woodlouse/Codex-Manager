use serde_json::Value;

mod adapter_dispatch;
mod json_conversion;
mod openai_chat;
mod openai_completions;
mod sse_conversion;
mod stream_events;
mod tool_mapping;

type ToolNameRestoreMap = super::ToolNameRestoreMap;

pub(super) use self::openai_completions::convert_openai_completions_stream_chunk;

#[allow(dead_code)]
pub(super) fn convert_openai_chat_stream_chunk(value: &Value) -> Option<Value> {
    openai_chat::convert_openai_chat_stream_chunk(value)
}

pub(super) fn adapt_upstream_response(
    adapter: super::ResponseAdapter,
    upstream_content_type: Option<&str>,
    body: &[u8],
    tool_name_restore_map: Option<&ToolNameRestoreMap>,
) -> Result<(Vec<u8>, &'static str), String> {
    adapter_dispatch::adapt_upstream_response(
        adapter,
        upstream_content_type,
        body,
        tool_name_restore_map,
    )
}

pub(super) fn build_anthropic_error_body(message: &str) -> Vec<u8> {
    adapter_dispatch::build_anthropic_error_body(message)
}

pub(super) fn is_response_completed_event_type(kind: &str) -> bool {
    stream_events::is_response_completed_event_type(kind)
}

pub(super) fn parse_openai_sse_event_value(data: &str, event_name: Option<&str>) -> Option<Value> {
    stream_events::parse_openai_sse_event_value(data, event_name)
}

pub(super) fn stream_event_response_id(value: &Value) -> String {
    stream_events::stream_event_response_id(value)
}

pub(super) fn stream_event_model(value: &Value) -> String {
    stream_events::stream_event_model(value)
}

pub(super) fn stream_event_created(value: &Value) -> i64 {
    stream_events::stream_event_created(value)
}

pub(super) fn convert_openai_chat_stream_chunk_with_tool_name_restore_map(
    value: &Value,
    tool_name_restore_map: Option<&ToolNameRestoreMap>,
) -> Option<Value> {
    openai_chat::convert_openai_chat_stream_chunk_with_tool_name_restore_map(
        value,
        tool_name_restore_map,
    )
}

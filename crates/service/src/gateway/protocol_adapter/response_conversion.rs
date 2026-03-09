use serde_json::{json, Value};

use crate::gateway::request_helpers::is_html_content_type;

use super::ResponseAdapter;
use json_conversion::convert_openai_json_to_anthropic;
use openai_completions::{
    convert_openai_json_to_completions, convert_openai_sse_to_completions_json,
};
use openai_chat::{
    convert_openai_json_to_chat_completions, convert_openai_sse_to_chat_completions_json,
};
use sse_conversion::{
    convert_anthropic_json_to_sse, convert_anthropic_sse_to_json, convert_openai_sse_to_anthropic,
};

mod json_conversion;
mod openai_completions;
mod openai_chat;
mod sse_conversion;
mod tool_mapping;
pub(super) fn is_response_completed_event_type(kind: &str) -> bool {
    let normalized = kind.trim().to_ascii_lowercase();
    normalized == "response.completed" || normalized == "response.done"
}

pub(super) fn parse_openai_sse_event_value(data: &str, event_name: Option<&str>) -> Option<Value> {
    let mut value = serde_json::from_str::<Value>(data).ok()?;
    let event_name = event_name
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_string);
    if let Some(event_name) = event_name {
        if value.get("type").and_then(Value::as_str).is_none() {
            if let Some(obj) = value.as_object_mut() {
                obj.insert("type".to_string(), Value::String(event_name));
            }
        }
    }
    Some(value)
}

pub(super) fn stream_event_response_id(value: &Value) -> String {
    openai_chat::stream_event_response_id(value)
}

pub(super) fn stream_event_model(value: &Value) -> String {
    openai_chat::stream_event_model(value)
}

pub(super) fn stream_event_created(value: &Value) -> i64 {
    openai_chat::stream_event_created(value)
}

pub(super) use self::openai_completions::convert_openai_completions_stream_chunk;

#[allow(dead_code)]
pub(super) fn convert_openai_chat_stream_chunk(value: &Value) -> Option<Value> {
    openai_chat::convert_openai_chat_stream_chunk(value)
}

pub(super) fn convert_openai_chat_stream_chunk_with_tool_name_restore_map(
    value: &Value,
    tool_name_restore_map: Option<&super::ToolNameRestoreMap>,
) -> Option<Value> {
    openai_chat::convert_openai_chat_stream_chunk_with_tool_name_restore_map(
        value,
        tool_name_restore_map,
    )
}

pub(super) fn adapt_upstream_response(
    adapter: ResponseAdapter,
    upstream_content_type: Option<&str>,
    body: &[u8],
    tool_name_restore_map: Option<&super::ToolNameRestoreMap>,
) -> Result<(Vec<u8>, &'static str), String> {
    match adapter {
        ResponseAdapter::Passthrough => Ok((body.to_vec(), "application/octet-stream")),
        ResponseAdapter::AnthropicJson => {
            if upstream_content_type.is_some_and(is_html_content_type) {
                return Err("upstream returned html challenge".to_string());
            }
            let is_sse = upstream_content_type
                .map(|value| value.to_ascii_lowercase().contains("text/event-stream"))
                .unwrap_or(false);
            if is_sse || looks_like_sse_payload(body) {
                let (anthropic_sse, _) = convert_openai_sse_to_anthropic(body)?;
                return convert_anthropic_sse_to_json(&anthropic_sse);
            }
            convert_openai_json_to_anthropic(body)
        }
        ResponseAdapter::AnthropicSse => {
            if upstream_content_type.is_some_and(is_html_content_type) {
                return Err("upstream returned html challenge".to_string());
            }
            let is_json = upstream_content_type
                .map(|value| {
                    value
                        .trim()
                        .to_ascii_lowercase()
                        .starts_with("application/json")
                })
                .unwrap_or(false);
            if is_json {
                let (anthropic_json, _) = convert_openai_json_to_anthropic(body)?;
                return convert_anthropic_json_to_sse(&anthropic_json);
            }
            convert_openai_sse_to_anthropic(body)
        }
        ResponseAdapter::OpenAIChatCompletionsJson | ResponseAdapter::OpenAIChatCompletionsSse => {
            if upstream_content_type.is_some_and(is_html_content_type) {
                return Err("upstream returned html challenge".to_string());
            }
            let is_sse = upstream_content_type
                .map(|value| value.to_ascii_lowercase().starts_with("text/event-stream"))
                .unwrap_or(false);
            if is_sse || looks_like_sse_payload(body) {
                return convert_openai_sse_to_chat_completions_json(body, tool_name_restore_map);
            }
            convert_openai_json_to_chat_completions(body, tool_name_restore_map)
        }
        ResponseAdapter::OpenAICompletionsJson | ResponseAdapter::OpenAICompletionsSse => {
            if upstream_content_type.is_some_and(is_html_content_type) {
                return Err("upstream returned html challenge".to_string());
            }
            let is_sse = upstream_content_type
                .map(|value| value.to_ascii_lowercase().starts_with("text/event-stream"))
                .unwrap_or(false);
            if is_sse || looks_like_sse_payload(body) {
                return convert_openai_sse_to_completions_json(body);
            }
            convert_openai_json_to_completions(body)
        }
    }
}

pub(super) fn build_anthropic_error_body(message: &str) -> Vec<u8> {
    serde_json::to_vec(&json!({
        "type": "error",
        "error": {
            "type": "api_error",
            "message": message,
        }
    }))
    .unwrap_or_else(|_| {
        b"{\"type\":\"error\",\"error\":{\"type\":\"api_error\",\"message\":\"unknown error\"}}"
            .to_vec()
    })
}

fn looks_like_sse_payload(body: &[u8]) -> bool {
    let Ok(text) = std::str::from_utf8(body) else {
        return false;
    };
    let trimmed = text.trim_start();
    trimmed.starts_with("data:")
        || trimmed.starts_with("event:")
        || text.contains("\ndata:")
        || text.contains("\nevent:")
}

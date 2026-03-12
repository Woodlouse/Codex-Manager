use serde_json::Value;

use super::openai_chat;

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

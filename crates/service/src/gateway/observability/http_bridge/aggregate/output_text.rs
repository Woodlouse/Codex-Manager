use serde_json::{Map, Value};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::OnceLock;

const OUTPUT_TEXT_LIMIT_BYTES_ENV: &str = "CODEXMANAGER_HTTP_BRIDGE_OUTPUT_TEXT_LIMIT_BYTES";
const DEFAULT_OUTPUT_TEXT_LIMIT_BYTES: usize = 128 * 1024;
pub(in super::super) const OUTPUT_TEXT_TRUNCATED_MARKER: &str = "[output_text truncated]";
static OUTPUT_TEXT_LIMIT_BYTES: AtomicUsize = AtomicUsize::new(DEFAULT_OUTPUT_TEXT_LIMIT_BYTES);
static OUTPUT_TEXT_LIMIT_LOADED: OnceLock<()> = OnceLock::new();

#[derive(Debug, Clone, Default)]
pub(crate) struct UpstreamResponseUsage {
    pub input_tokens: Option<i64>,
    pub cached_input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub total_tokens: Option<i64>,
    pub reasoning_output_tokens: Option<i64>,
    pub output_text: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct UpstreamResponseBridgeResult {
    pub usage: UpstreamResponseUsage,
    pub stream_terminal_seen: bool,
    pub stream_terminal_error: Option<String>,
    pub delivery_error: Option<String>,
    pub upstream_error_hint: Option<String>,
}

impl UpstreamResponseBridgeResult {
    pub(crate) fn is_ok(&self, is_stream: bool) -> bool {
        if self.delivery_error.is_some() {
            return false;
        }
        if is_stream {
            if !self.stream_terminal_seen {
                return false;
            }
            if self.stream_terminal_error.is_some() {
                return false;
            }
        }
        true
    }

    pub(crate) fn error_message(&self, is_stream: bool) -> Option<String> {
        if let Some(err) = self.stream_terminal_error.as_ref() {
            return Some(err.clone());
        }
        if is_stream && !self.stream_terminal_seen {
            return Some("stream disconnected before completion".to_string());
        }
        if let Some(err) = self.delivery_error.as_ref() {
            return Some(format!("response write failed: {err}"));
        }
        None
    }
}

pub(in super::super) fn merge_usage(
    target: &mut UpstreamResponseUsage,
    source: UpstreamResponseUsage,
) {
    if source.input_tokens.is_some() {
        target.input_tokens = source.input_tokens;
    }
    if source.cached_input_tokens.is_some() {
        target.cached_input_tokens = source.cached_input_tokens;
    }
    if source.output_tokens.is_some() {
        target.output_tokens = source.output_tokens;
    }
    if source.total_tokens.is_some() {
        target.total_tokens = source.total_tokens;
    }
    if source.reasoning_output_tokens.is_some() {
        target.reasoning_output_tokens = source.reasoning_output_tokens;
    }
    if let Some(source_text) = source.output_text {
        let target_text = target.output_text.get_or_insert_with(String::new);
        append_output_text_raw(target_text, source_text.as_str());
    }
}

pub(in super::super) fn usage_has_signal(usage: &UpstreamResponseUsage) -> bool {
    usage.input_tokens.is_some()
        || usage.cached_input_tokens.is_some()
        || usage.output_tokens.is_some()
        || usage.total_tokens.is_some()
        || usage.reasoning_output_tokens.is_some()
        || usage
            .output_text
            .as_ref()
            .is_some_and(|text| !text.trim().is_empty())
}

fn parse_usage_from_object(usage: Option<&Map<String, Value>>) -> UpstreamResponseUsage {
    let input_tokens = usage
        .and_then(|map| map.get("input_tokens").and_then(Value::as_i64))
        .or_else(|| usage.and_then(|map| map.get("prompt_tokens").and_then(Value::as_i64)));
    let output_tokens = usage
        .and_then(|map| map.get("output_tokens").and_then(Value::as_i64))
        .or_else(|| usage.and_then(|map| map.get("completion_tokens").and_then(Value::as_i64)));
    let total_tokens = usage.and_then(|map| map.get("total_tokens").and_then(Value::as_i64));
    let cached_input_tokens = usage
        .and_then(|map| map.get("input_tokens_details"))
        .and_then(Value::as_object)
        .and_then(|details| details.get("cached_tokens"))
        .and_then(Value::as_i64)
        .or_else(|| {
            usage
                .and_then(|map| map.get("prompt_tokens_details"))
                .and_then(Value::as_object)
                .and_then(|details| details.get("cached_tokens"))
                .and_then(Value::as_i64)
        });
    let reasoning_output_tokens = usage
        .and_then(|map| map.get("output_tokens_details"))
        .and_then(Value::as_object)
        .and_then(|details| details.get("reasoning_tokens"))
        .and_then(Value::as_i64)
        .or_else(|| {
            usage
                .and_then(|map| map.get("completion_tokens_details"))
                .and_then(Value::as_object)
                .and_then(|details| details.get("reasoning_tokens"))
                .and_then(Value::as_i64)
        });
    UpstreamResponseUsage {
        input_tokens,
        cached_input_tokens,
        output_tokens,
        total_tokens,
        reasoning_output_tokens,
        output_text: None,
    }
}

pub(in super::super) fn append_output_text(buffer: &mut String, text: &str) {
    if text.is_empty() {
        return;
    }
    let limit = output_text_limit_bytes();
    if limit > 0 && buffer.len() >= limit {
        mark_output_text_truncated(buffer, limit);
        return;
    }
    if !buffer.is_empty() {
        if limit > 0 && buffer.len() + 1 > limit {
            mark_output_text_truncated(buffer, limit);
            return;
        }
        buffer.push('\n');
    }
    if limit == 0 {
        buffer.push_str(text);
        return;
    }
    let remaining = limit.saturating_sub(buffer.len());
    if remaining == 0 {
        mark_output_text_truncated(buffer, limit);
        return;
    }
    let slice = truncate_str_to_bytes(text, remaining);
    buffer.push_str(slice);
    if slice.len() < text.len() {
        mark_output_text_truncated(buffer, limit);
    }
}

pub(in super::super) fn append_output_text_raw(buffer: &mut String, text: &str) {
    if text.is_empty() {
        return;
    }
    let limit = output_text_limit_bytes();
    if limit > 0 && buffer.len() >= limit {
        mark_output_text_truncated(buffer, limit);
        return;
    }
    if limit == 0 {
        buffer.push_str(text);
        return;
    }
    let remaining = limit.saturating_sub(buffer.len());
    if remaining == 0 {
        mark_output_text_truncated(buffer, limit);
        return;
    }
    let slice = truncate_str_to_bytes(text, remaining);
    buffer.push_str(slice);
    if slice.len() < text.len() {
        mark_output_text_truncated(buffer, limit);
    }
}

pub(in super::super) fn collect_response_output_text(value: &Value, output: &mut String) {
    match value {
        Value::String(text) => append_output_text(output, text),
        Value::Array(items) => {
            for item in items {
                collect_response_output_text(item, output);
            }
        }
        Value::Object(map) => {
            if let Some(text) = map.get("output_text").and_then(Value::as_str) {
                append_output_text(output, text);
            }
            if let Some(text) = map.get("text").and_then(Value::as_str) {
                append_output_text(output, text);
            }
            if let Some(content) = map.get("content") {
                collect_response_output_text(content, output);
            }
            if let Some(message) = map.get("message") {
                collect_response_output_text(message, output);
            }
            if let Some(output_field) = map.get("output") {
                collect_response_output_text(output_field, output);
            }
            if let Some(delta) = map.get("delta") {
                collect_response_output_text(delta, output);
            }
        }
        _ => {}
    }
}

pub(in super::super) fn output_text_limit_bytes() -> usize {
    let _ = OUTPUT_TEXT_LIMIT_LOADED.get_or_init(reload_from_env);
    OUTPUT_TEXT_LIMIT_BYTES.load(Ordering::Relaxed)
}

pub(in super::super) fn reload_from_env() {
    let raw = std::env::var(OUTPUT_TEXT_LIMIT_BYTES_ENV).unwrap_or_default();
    let limit = raw
        .trim()
        .parse::<usize>()
        .unwrap_or(DEFAULT_OUTPUT_TEXT_LIMIT_BYTES);
    OUTPUT_TEXT_LIMIT_BYTES.store(limit, Ordering::Relaxed);
}

fn truncate_str_to_bytes(text: &str, max_bytes: usize) -> &str {
    if max_bytes >= text.len() {
        return text;
    }
    let mut idx = max_bytes;
    while idx > 0 && !text.is_char_boundary(idx) {
        idx -= 1;
    }
    &text[..idx]
}

fn truncate_string_to_bytes(value: &mut String, max_bytes: usize) {
    if max_bytes >= value.len() {
        return;
    }
    let mut idx = max_bytes;
    while idx > 0 && !value.is_char_boundary(idx) {
        idx -= 1;
    }
    value.truncate(idx);
}

fn mark_output_text_truncated(buffer: &mut String, limit: usize) {
    if limit == 0 {
        return;
    }
    if buffer.ends_with(OUTPUT_TEXT_TRUNCATED_MARKER) {
        return;
    }
    let newline_bytes = if buffer.is_empty() { 0 } else { 1 };
    let marker_bytes = OUTPUT_TEXT_TRUNCATED_MARKER.len();
    if buffer.len() + newline_bytes + marker_bytes <= limit {
        if !buffer.is_empty() {
            buffer.push('\n');
        }
        buffer.push_str(OUTPUT_TEXT_TRUNCATED_MARKER);
        return;
    }
    if limit <= marker_bytes {
        truncate_string_to_bytes(buffer, limit);
        return;
    }
    let target = limit.saturating_sub(marker_bytes + newline_bytes);
    truncate_string_to_bytes(buffer, target);
    if !buffer.is_empty() {
        buffer.push('\n');
    }
    buffer.push_str(OUTPUT_TEXT_TRUNCATED_MARKER);
}

pub(in super::super) fn collect_output_text_from_event_fields(value: &Value, output: &mut String) {
    if let Some(item) = value.get("item") {
        collect_response_output_text(item, output);
    }
    if let Some(output_item) = value.get("output_item") {
        collect_response_output_text(output_item, output);
    }
    if let Some(part) = value.get("part") {
        collect_response_output_text(part, output);
    }
    if let Some(content_part) = value.get("content_part") {
        collect_response_output_text(content_part, output);
    }
}

fn extract_output_text_from_json(value: &Value) -> Option<String> {
    let mut output = String::new();
    if let Some(text) = value.get("output_text").and_then(Value::as_str) {
        append_output_text(&mut output, text);
    }
    if let Some(response) = value.get("response") {
        collect_response_output_text(response, &mut output);
    }
    if let Some(top_level_output) = value.get("output") {
        collect_response_output_text(top_level_output, &mut output);
    }
    if let Some(choices) = value.get("choices") {
        collect_response_output_text(choices, &mut output);
    }
    if let Some(item) = value.get("item") {
        collect_response_output_text(item, &mut output);
    }
    if let Some(part) = value.get("part") {
        collect_response_output_text(part, &mut output);
    }
    if output.trim().is_empty() {
        None
    } else {
        Some(output)
    }
}

pub(in super::super) fn parse_usage_from_json(value: &Value) -> UpstreamResponseUsage {
    let mut usage = parse_usage_from_object(value.get("usage").and_then(Value::as_object));
    let response_usage = value
        .get("response")
        .and_then(|response| response.get("usage"))
        .and_then(Value::as_object);
    merge_usage(&mut usage, parse_usage_from_object(response_usage));
    usage.output_text = extract_output_text_from_json(value);
    usage
}

pub(in super::super) fn extract_error_message_from_json(value: &Value) -> Option<String> {
    fn extract_message_from_error_map(err_obj: &Map<String, Value>) -> Option<String> {
        let message = err_obj
            .get("message")
            .and_then(Value::as_str)
            .or_else(|| err_obj.get("error").and_then(Value::as_str))
            .map(str::trim)
            .filter(|msg| !msg.is_empty());
        let code = err_obj
            .get("code")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|v| !v.is_empty());
        let kind = err_obj
            .get("type")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|v| !v.is_empty());
        let param = err_obj
            .get("param")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|v| !v.is_empty());

        if let Some(message) = message {
            let mut prefixes = Vec::new();
            if let Some(code) = code {
                prefixes.push(format!("code={code}"));
            }
            if let Some(kind) = kind {
                prefixes.push(format!("type={kind}"));
            }
            if let Some(param) = param {
                prefixes.push(format!("param={param}"));
            }
            return if prefixes.is_empty() {
                Some(message.to_string())
            } else {
                Some(format!("{} {}", prefixes.join(" "), message))
            };
        }

        serde_json::to_string(err_obj)
            .ok()
            .map(|text| text.trim().to_string())
            .filter(|v| !v.is_empty())
    }

    fn extract_message_from_error_value(err_value: Option<&Value>) -> Option<String> {
        let err_value = err_value?;
        if let Some(message) = err_value.as_str() {
            let msg = message.trim();
            if !msg.is_empty() {
                return Some(msg.to_string());
            }
            return None;
        }
        if let Some(err_obj) = err_value.as_object() {
            return extract_message_from_error_map(err_obj);
        }
        None
    }

    if let Some(message) = extract_message_from_error_value(value.get("error")) {
        return Some(message);
    }
    if let Some(message) = extract_message_from_error_value(value.pointer("/response/error")) {
        return Some(message);
    }
    if let Some(message) =
        extract_message_from_error_value(value.pointer("/response/status_details/error"))
    {
        return Some(message);
    }
    if value
        .get("type")
        .and_then(Value::as_str)
        .is_some_and(|t| t.eq_ignore_ascii_case("error"))
    {
        if let Some(message) = value.get("message").and_then(Value::as_str) {
            let msg = message.trim();
            if !msg.is_empty() {
                return Some(msg.to_string());
            }
        }
    }
    None
}

pub(in super::super) fn extract_error_hint_from_body(
    status_code: u16,
    body: &[u8],
) -> Option<String> {
    if status_code < 400 || body.is_empty() {
        return None;
    }
    if let Ok(value) = serde_json::from_slice::<Value>(body) {
        if let Some(message) = extract_error_message_from_json(&value) {
            return Some(message);
        }
    }
    std::str::from_utf8(body)
        .ok()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(|text| {
            let mut chars = text.chars();
            let snippet = chars.by_ref().take(240).collect::<String>();
            if chars.next().is_some() {
                format!("{snippet}...")
            } else {
                snippet
            }
        })
}

use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

const DEFAULT_COMPLETIONS_PROMPT: &str = "Complete this:";
const DEFAULT_OPENAI_REASONING: &str = "medium";
pub(super) const MAX_OPENAI_TOOL_NAME_LEN: usize = 64;

pub(super) fn shorten_openai_tool_name_candidate(name: &str) -> String {
    if name.len() <= MAX_OPENAI_TOOL_NAME_LEN {
        return name.to_string();
    }
    if name.starts_with("mcp__") {
        if let Some(idx) = name.rfind("__") {
            if idx > 0 {
                let mut candidate = format!("mcp__{}", &name[idx + 2..]);
                if candidate.len() > MAX_OPENAI_TOOL_NAME_LEN {
                    candidate.truncate(MAX_OPENAI_TOOL_NAME_LEN);
                }
                return candidate;
            }
        }
    }
    name.chars().take(MAX_OPENAI_TOOL_NAME_LEN).collect()
}

fn collect_openai_tool_names(obj: &serde_json::Map<String, Value>) -> Vec<String> {
    let mut names = Vec::new();

    if let Some(tools) = obj.get("tools").and_then(Value::as_array) {
        for tool in tools {
            let Some(tool_obj) = tool.as_object() else {
                continue;
            };
            let tool_type = tool_obj
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if !tool_type.is_empty() && tool_type != "function" {
                continue;
            }
            let name = tool_obj
                .get("function")
                .and_then(|function| function.get("name"))
                .or_else(|| tool_obj.get("name"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty());
            if let Some(name) = name {
                names.push(name.to_string());
            }
        }
    }

    if let Some(dynamic_tools) = get_dynamic_tools_array(obj) {
        for dynamic_tool in dynamic_tools {
            let Some(name) = dynamic_tool
                .get("name")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
            else {
                continue;
            };
            names.push(name.to_string());
        }
    }

    if let Some(name) = obj
        .get("tool_choice")
        .and_then(Value::as_object)
        .and_then(|tool_choice| {
            let tool_type = tool_choice
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if tool_type != "function" {
                return None;
            }
            tool_choice
                .get("function")
                .and_then(|function| function.get("name"))
                .or_else(|| tool_choice.get("name"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
        })
    {
        names.push(name.to_string());
    }

    if let Some(messages) = obj.get("messages").and_then(Value::as_array) {
        for message in messages {
            let Some(message_obj) = message.as_object() else {
                continue;
            };
            if message_obj.get("role").and_then(Value::as_str) != Some("assistant") {
                continue;
            }
            let Some(tool_calls) = message_obj.get("tool_calls").and_then(Value::as_array) else {
                continue;
            };
            for tool_call in tool_calls {
                let Some(name) = tool_call
                    .get("function")
                    .and_then(|function| function.get("name"))
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                else {
                    continue;
                };
                names.push(name.to_string());
            }
        }
    }

    names
}

fn get_dynamic_tools_array<'a>(obj: &'a serde_json::Map<String, Value>) -> Option<&'a Vec<Value>> {
    obj.get("dynamic_tools")
        .or_else(|| obj.get("dynamicTools"))
        .and_then(Value::as_array)
}

fn map_dynamic_tool_to_responses_tool(
    tool_obj: &serde_json::Map<String, Value>,
    tool_name_map: &BTreeMap<String, String>,
) -> Option<Value> {
    let name = tool_obj
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    let mapped_name = shorten_openai_tool_name_with_map(name, tool_name_map);
    let description = tool_obj
        .get("description")
        .cloned()
        .unwrap_or_else(|| Value::String(String::new()));
    let parameters = tool_obj
        .get("input_schema")
        .or_else(|| tool_obj.get("inputSchema"))
        .or_else(|| tool_obj.get("parameters"))
        .cloned()
        .unwrap_or_else(|| json!({ "type": "object", "properties": {} }));

    let mut mapped = serde_json::Map::new();
    mapped.insert("type".to_string(), Value::String("function".to_string()));
    mapped.insert("name".to_string(), Value::String(mapped_name));
    mapped.insert("description".to_string(), description);
    mapped.insert("parameters".to_string(), parameters);
    if let Some(strict) = tool_obj.get("strict") {
        mapped.insert("strict".to_string(), strict.clone());
    }
    Some(Value::Object(mapped))
}

fn build_openai_tool_name_map(obj: &serde_json::Map<String, Value>) -> BTreeMap<String, String> {
    let mut unique_names = BTreeSet::new();
    for name in collect_openai_tool_names(obj) {
        unique_names.insert(name);
    }

    let mut used = BTreeSet::new();
    let mut out = BTreeMap::new();
    for name in unique_names {
        let base = shorten_openai_tool_name_candidate(name.as_str());
        let mut candidate = base.clone();
        let mut suffix = 1usize;
        while used.contains(&candidate) {
            let suffix_text = format!("_{suffix}");
            let mut truncated = base.clone();
            let limit = MAX_OPENAI_TOOL_NAME_LEN.saturating_sub(suffix_text.len());
            if truncated.len() > limit {
                truncated = truncated.chars().take(limit).collect();
            }
            candidate = format!("{truncated}{suffix_text}");
            suffix += 1;
        }
        used.insert(candidate.clone());
        out.insert(name, candidate);
    }
    out
}

pub(super) fn shorten_openai_tool_name_with_map(
    name: &str,
    tool_name_map: &BTreeMap<String, String>,
) -> String {
    tool_name_map
        .get(name)
        .cloned()
        .unwrap_or_else(|| shorten_openai_tool_name_candidate(name))
}

fn build_openai_tool_name_restore_map(
    tool_name_map: &BTreeMap<String, String>,
) -> super::ToolNameRestoreMap {
    let mut restore_map = super::ToolNameRestoreMap::new();
    for (original, shortened) in tool_name_map {
        if original != shortened {
            restore_map.insert(shortened.clone(), original.clone());
        }
    }
    restore_map
}

fn normalize_openai_role_for_responses(role: &str) -> Option<&'static str> {
    match role {
        "system" | "developer" => Some("system"),
        "user" => Some("user"),
        "assistant" => Some("assistant"),
        "tool" => Some("tool"),
        _ => None,
    }
}

fn extract_openai_message_content_text(content: &Value) -> String {
    match content {
        Value::String(text) => text.clone(),
        Value::Array(items) => {
            let mut out = String::new();
            for item in items {
                if let Some(text) = item.as_str() {
                    out.push_str(text);
                    continue;
                }
                let Some(item_obj) = item.as_object() else {
                    continue;
                };
                let item_type = item_obj
                    .get("type")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                match item_type {
                    "text" | "input_text" | "output_text" => {
                        if let Some(text) = item_obj.get("text").and_then(Value::as_str) {
                            out.push_str(text);
                        }
                    }
                    _ => {}
                }
            }
            out
        }
        Value::Null => String::new(),
        other => serde_json::to_string(other).unwrap_or_default(),
    }
}

fn normalize_openai_chat_messages_for_responses(messages: &[Value]) -> Vec<Value> {
    let mut normalized = Vec::new();
    for message in messages {
        let Some(message_obj) = message.as_object() else {
            continue;
        };
        let Some(role) = message_obj.get("role").and_then(Value::as_str) else {
            continue;
        };
        let Some(normalized_role) = normalize_openai_role_for_responses(role) else {
            continue;
        };
        let mut out = serde_json::Map::new();
        out.insert(
            "role".to_string(),
            Value::String(normalized_role.to_string()),
        );

        if normalized_role == "tool" {
            if let Some(call_id) = message_obj
                .get("tool_call_id")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                out.insert(
                    "tool_call_id".to_string(),
                    Value::String(call_id.to_string()),
                );
            }
        }

        if let Some(content) = message_obj.get("content") {
            let content_text = extract_openai_message_content_text(content);
            if !content_text.trim().is_empty() {
                out.insert("content".to_string(), Value::String(content_text));
            }
        }

        if normalized_role == "assistant" {
            if let Some(tool_calls) = message_obj.get("tool_calls").and_then(Value::as_array) {
                let mapped_calls = tool_calls
                    .iter()
                    .filter_map(|tool_call| {
                        let tool_obj = tool_call.as_object()?;
                        let id = tool_obj
                            .get("id")
                            .and_then(Value::as_str)
                            .map(str::trim)
                            .filter(|value| !value.is_empty())
                            .unwrap_or("call_0");
                        let fn_obj = tool_obj.get("function").and_then(Value::as_object)?;
                        let name = fn_obj
                            .get("name")
                            .and_then(Value::as_str)
                            .map(str::trim)
                            .filter(|value| !value.is_empty())?;
                        let arguments = fn_obj
                            .get("arguments")
                            .map(|value| {
                                if let Some(text) = value.as_str() {
                                    text.to_string()
                                } else {
                                    serde_json::to_string(value)
                                        .unwrap_or_else(|_| "{}".to_string())
                                }
                            })
                            .unwrap_or_else(|| "{}".to_string());
                        Some(json!({
                            "id": id,
                            "type": "function",
                            "function": {
                                "name": name,
                                "arguments": arguments
                            }
                        }))
                    })
                    .collect::<Vec<_>>();
                if !mapped_calls.is_empty() {
                    out.insert("tool_calls".to_string(), Value::Array(mapped_calls));
                }
            }
        }

        normalized.push(Value::Object(out));
    }
    normalized
}

fn map_openai_chat_tools_to_responses(
    obj: &serde_json::Map<String, Value>,
    tool_name_map: &BTreeMap<String, String>,
) -> Option<Vec<Value>> {
    let mut out = Vec::new();
    if let Some(tools) = obj.get("tools").and_then(Value::as_array) {
        for tool in tools {
            let Some(tool_obj) = tool.as_object() else {
                continue;
            };
            let tool_type = tool_obj
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if tool_type != "function" {
                out.push(tool.clone());
                continue;
            }
            let Some(function) = tool_obj.get("function").and_then(Value::as_object) else {
                continue;
            };
            let Some(name) = function
                .get("name")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
            else {
                continue;
            };
            let mapped_name = shorten_openai_tool_name_with_map(name, tool_name_map);
            let mut mapped = serde_json::Map::new();
            mapped.insert("type".to_string(), Value::String("function".to_string()));
            mapped.insert("name".to_string(), Value::String(mapped_name));
            if let Some(description) = function.get("description") {
                mapped.insert("description".to_string(), description.clone());
            }
            if let Some(parameters) = function.get("parameters") {
                mapped.insert("parameters".to_string(), parameters.clone());
            }
            if let Some(strict) = function.get("strict") {
                mapped.insert("strict".to_string(), strict.clone());
            }
            out.push(Value::Object(mapped));
        }
    }

    if let Some(dynamic_tools) = get_dynamic_tools_array(obj) {
        for dynamic_tool in dynamic_tools {
            let Some(tool_obj) = dynamic_tool.as_object() else {
                continue;
            };
            if let Some(mapped_tool) = map_dynamic_tool_to_responses_tool(tool_obj, tool_name_map) {
                out.push(mapped_tool);
            }
        }
    }

    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

fn map_openai_chat_tool_choice_to_responses(
    value: &Value,
    tool_name_map: &BTreeMap<String, String>,
) -> Option<Value> {
    if let Some(raw) = value.as_str() {
        return Some(Value::String(raw.to_string()));
    }
    let obj = value.as_object()?;
    let tool_type = obj.get("type").and_then(Value::as_str).unwrap_or_default();
    if tool_type != "function" {
        return Some(value.clone());
    }
    let name = obj
        .get("function")
        .and_then(|function| function.get("name"))
        .and_then(Value::as_str)
        .or_else(|| obj.get("name").and_then(Value::as_str))
        .map(str::trim)
        .filter(|candidate| !candidate.is_empty())?;
    let mapped_name = shorten_openai_tool_name_with_map(name, tool_name_map);
    Some(json!({
        "type": "function",
        "name": mapped_name
    }))
}

fn map_openai_chat_text_controls_to_responses(
    obj: &serde_json::Map<String, Value>,
) -> Option<Value> {
    let mut mapped = obj
        .get("text")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();

    if let Some(verbosity) = obj
        .get("verbosity")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        mapped.insert(
            "verbosity".to_string(),
            Value::String(verbosity.to_string()),
        );
    }
    if let Some(format) = obj.get("response_format").cloned() {
        mapped.insert("format".to_string(), format);
    }

    if mapped.is_empty() {
        None
    } else {
        Some(Value::Object(mapped))
    }
}

pub(crate) fn convert_openai_chat_completions_request(
    body: &[u8],
) -> Result<(Vec<u8>, bool, super::ToolNameRestoreMap), String> {
    let payload: Value = serde_json::from_slice(body)
        .map_err(|_| "invalid chat.completions request json".to_string())?;
    let Some(obj) = payload.as_object() else {
        return Err("chat.completions request body must be an object".to_string());
    };

    let tool_name_map = build_openai_tool_name_map(obj);
    let stream = obj.get("stream").and_then(Value::as_bool).unwrap_or(false);
    let source_messages = obj
        .get("messages")
        .and_then(Value::as_array)
        .ok_or_else(|| "chat.completions messages field is required".to_string())?;
    let normalized_messages = normalize_openai_chat_messages_for_responses(source_messages);
    let (instructions, input_items) =
        super::convert_chat_messages_to_responses_input(&normalized_messages, &tool_name_map)?;

    let mut out = serde_json::Map::new();
    if let Some(model) = obj.get("model") {
        out.insert("model".to_string(), model.clone());
    }
    out.insert(
        "instructions".to_string(),
        Value::String(instructions.unwrap_or_default()),
    );
    out.insert("input".to_string(), Value::Array(input_items));
    out.insert("stream".to_string(), Value::Bool(stream));
    out.insert("store".to_string(), Value::Bool(false));
    let stream_passthrough = obj
        .get("stream_passthrough")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    out.insert(
        "stream_passthrough".to_string(),
        Value::Bool(stream_passthrough),
    );

    let reasoning_effort = obj
        .get("reasoning_effort")
        .and_then(Value::as_str)
        .and_then(crate::reasoning_effort::normalize_reasoning_effort)
        .or_else(|| {
            obj.get("reasoning")
                .and_then(|reasoning| reasoning.get("effort"))
                .and_then(Value::as_str)
                .and_then(crate::reasoning_effort::normalize_reasoning_effort)
        })
        .unwrap_or(DEFAULT_OPENAI_REASONING)
        .to_string();
    out.insert(
        "reasoning".to_string(),
        json!({
            "effort": reasoning_effort
        }),
    );

    let parallel_tool_calls = obj
        .get("parallel_tool_calls")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    out.insert(
        "parallel_tool_calls".to_string(),
        Value::Bool(parallel_tool_calls),
    );
    out.insert(
        "include".to_string(),
        Value::Array(vec![Value::String(
            "reasoning.encrypted_content".to_string(),
        )]),
    );
    if let Some(service_tier) = obj.get("service_tier") {
        out.insert("service_tier".to_string(), service_tier.clone());
    }

    if let Some(tools) = map_openai_chat_tools_to_responses(obj, &tool_name_map) {
        if !tools.is_empty() {
            out.insert("tools".to_string(), Value::Array(tools));
        }
    }
    if let Some(tool_choice) = obj
        .get("tool_choice")
        .and_then(|value| map_openai_chat_tool_choice_to_responses(value, &tool_name_map))
    {
        out.insert("tool_choice".to_string(), tool_choice);
    }
    if let Some(text) = map_openai_chat_text_controls_to_responses(obj) {
        out.insert("text".to_string(), text);
    }

    let tool_name_restore_map = build_openai_tool_name_restore_map(&tool_name_map);
    serde_json::to_vec(&Value::Object(out))
        .map(|bytes| (bytes, stream, tool_name_restore_map))
        .map_err(|err| format!("convert chat.completions request failed: {err}"))
}

fn stringify_completion_prompt(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        Value::Array(items) => {
            let parts = items
                .iter()
                .filter_map(stringify_completion_prompt)
                .collect::<Vec<_>>();
            if parts.is_empty() {
                None
            } else {
                Some(parts.join("\n"))
            }
        }
        Value::Null => None,
        other => serde_json::to_string(other).ok(),
    }
}

pub(crate) fn convert_openai_completions_request(body: &[u8]) -> Result<(Vec<u8>, bool), String> {
    let payload: Value =
        serde_json::from_slice(body).map_err(|_| "invalid completions request json".to_string())?;
    let Some(obj) = payload.as_object() else {
        return Err("completions request body must be an object".to_string());
    };

    let stream = obj.get("stream").and_then(Value::as_bool).unwrap_or(false);
    let prompt = obj
        .get("prompt")
        .and_then(stringify_completion_prompt)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_COMPLETIONS_PROMPT.to_string());

    let mut out = serde_json::Map::new();
    if let Some(model) = obj.get("model") {
        out.insert("model".to_string(), model.clone());
    }
    out.insert(
        "messages".to_string(),
        json!([
            {
                "role": "user",
                "content": prompt
            }
        ]),
    );

    const COPIED_KEYS: [&str; 12] = [
        "max_tokens",
        "temperature",
        "top_p",
        "frequency_penalty",
        "presence_penalty",
        "stop",
        "stream",
        "logprobs",
        "top_logprobs",
        "n",
        "user",
        "stream_passthrough",
    ];
    for key in COPIED_KEYS {
        if let Some(value) = obj.get(key) {
            out.insert(key.to_string(), value.clone());
        }
    }

    serde_json::to_vec(&Value::Object(out))
        .map(|bytes| (bytes, stream))
        .map_err(|err| format!("convert completions request failed: {err}"))
}

#[allow(unused_imports)]
use super::{
    adapt_request_for_protocol, adapt_upstream_response_with_tool_name_restore_map,
    convert_openai_chat_stream_chunk_with_tool_name_restore_map, ResponseAdapter,
    ToolNameRestoreMap,
};
use crate::apikey_profile::PROTOCOL_OPENAI_COMPAT;

#[test]
fn openai_chat_completions_are_adapted_to_responses() {
    let body = br#"{"model":"gpt-5.3-codex","messages":[{"role":"user","content":"hi"}]}"#.to_vec();
    let adapted = adapt_request_for_protocol(PROTOCOL_OPENAI_COMPAT, "/v1/chat/completions", body)
        .expect("adapt request");
    let value: serde_json::Value =
        serde_json::from_slice(&adapted.body).expect("parse adapted body");
    assert_eq!(adapted.path, "/v1/responses");
    assert_eq!(
        adapted.response_adapter,
        ResponseAdapter::OpenAIChatCompletionsJson
    );
    assert_eq!(
        value
            .get("input")
            .and_then(|input| input.get(0))
            .and_then(|item| item.get("role"))
            .and_then(serde_json::Value::as_str),
        Some("user")
    );
    assert_eq!(
        value
            .get("input")
            .and_then(|input| input.get(0))
            .and_then(|item| item.get("content"))
            .and_then(|content| content.get(0))
            .and_then(|part| part.get("text"))
            .and_then(serde_json::Value::as_str),
        Some("hi")
    );
    assert_eq!(
        value
            .get("stream_passthrough")
            .and_then(serde_json::Value::as_bool),
        Some(false)
    );
}

#[test]
fn openai_chat_completions_stream_uses_sse_adapter() {
    let body =
        br#"{"model":"gpt-5.3-codex","messages":[{"role":"user","content":"hi"}],"stream":true}"#
            .to_vec();
    let adapted = adapt_request_for_protocol(PROTOCOL_OPENAI_COMPAT, "/v1/chat/completions", body)
        .expect("adapt request");
    assert_eq!(adapted.path, "/v1/responses");
    assert_eq!(
        adapted.response_adapter,
        ResponseAdapter::OpenAIChatCompletionsSse
    );
}

#[test]
fn openai_chat_completions_forward_service_tier_to_responses() {
    let body = br#"{"model":"gpt-5.3-codex","messages":[{"role":"user","content":"hi"}],"service_tier":"flex"}"#.to_vec();
    let adapted = adapt_request_for_protocol(PROTOCOL_OPENAI_COMPAT, "/v1/chat/completions", body)
        .expect("adapt request");
    let value: serde_json::Value =
        serde_json::from_slice(&adapted.body).expect("parse adapted body");
    assert_eq!(
        value
            .get("service_tier")
            .and_then(serde_json::Value::as_str),
        Some("flex")
    );
}

#[test]
fn openai_chat_completions_forward_text_verbosity_to_responses() {
    let body = br#"{"model":"gpt-5.3-codex","messages":[{"role":"user","content":"hi"}],"verbosity":"low","response_format":{"type":"json_schema","json_schema":{"name":"answer","schema":{"type":"object"}}}}"#.to_vec();
    let adapted = adapt_request_for_protocol(PROTOCOL_OPENAI_COMPAT, "/v1/chat/completions", body)
        .expect("adapt request");
    let value: serde_json::Value =
        serde_json::from_slice(&adapted.body).expect("parse adapted body");
    assert_eq!(
        value
            .get("text")
            .and_then(|text| text.get("verbosity"))
            .and_then(serde_json::Value::as_str),
        Some("low")
    );
    assert_eq!(
        value
            .get("text")
            .and_then(|text| text.get("format"))
            .and_then(|format| format.get("type"))
            .and_then(serde_json::Value::as_str),
        Some("json_schema")
    );
}

#[test]
fn openai_chat_completions_map_dynamic_tools_to_responses_tools() {
    let original_tool_name =
        "mcp__dynamic_tool_server_namespace_for_codex_manager_gateway_alignment__very_long_tool_name";
    let body = serde_json::json!({
        "model": "gpt-5.3-codex",
        "messages": [{ "role": "user", "content": "hi" }],
        "dynamic_tools": [{
            "name": original_tool_name,
            "description": "dynamic tool",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "city": { "type": "string" }
                },
                "required": ["city"]
            }
        }]
    });
    let adapted = adapt_request_for_protocol(
        PROTOCOL_OPENAI_COMPAT,
        "/v1/chat/completions",
        serde_json::to_vec(&body).expect("serialize body"),
    )
    .expect("adapt request");
    let value: serde_json::Value =
        serde_json::from_slice(&adapted.body).expect("parse adapted body");
    let shortened_name = value
        .get("tools")
        .and_then(|tools| tools.get(0))
        .and_then(|tool| tool.get("name"))
        .and_then(serde_json::Value::as_str)
        .expect("tools[0].name")
        .to_string();
    assert_ne!(shortened_name, original_tool_name);
    assert!(shortened_name.len() <= 64);
    assert_eq!(
        adapted.tool_name_restore_map.get(&shortened_name),
        Some(&original_tool_name.to_string())
    );
    assert_eq!(
        value
            .get("tools")
            .and_then(|tools| tools.get(0))
            .and_then(|tool| tool.get("description"))
            .and_then(serde_json::Value::as_str),
        Some("dynamic tool")
    );
    assert_eq!(
        value
            .get("tools")
            .and_then(|tools| tools.get(0))
            .and_then(|tool| tool.get("parameters"))
            .and_then(|parameters| parameters.get("properties"))
            .and_then(|properties| properties.get("city"))
            .and_then(|city| city.get("type"))
            .and_then(serde_json::Value::as_str),
        Some("string")
    );
}

#[test]
fn openai_chat_completions_shortens_tool_names_and_builds_restore_map() {
    let original_tool_name =
        "mcp__tool_server_namespace_for_codex_manager_gateway_adapter_alignment__very_long_tool_operation_name";
    let body = serde_json::json!({
        "model": "gpt-5.3-codex",
        "messages": [
            {
                "role": "assistant",
                "tool_calls": [{
                    "id": "call_1",
                    "type": "function",
                    "function": {
                        "name": original_tool_name,
                        "arguments": "{}"
                    }
                }]
            },
            {
                "role": "user",
                "content": "hi"
            }
        ],
        "tools": [{
            "type": "function",
            "function": {
                "name": original_tool_name,
                "description": "test tool",
                "parameters": { "type": "object" }
            }
        }],
        "tool_choice": {
            "type": "function",
            "function": {
                "name": original_tool_name
            }
        }
    });
    let adapted = adapt_request_for_protocol(
        PROTOCOL_OPENAI_COMPAT,
        "/v1/chat/completions",
        serde_json::to_vec(&body).expect("serialize body"),
    )
    .expect("adapt request");
    let value: serde_json::Value =
        serde_json::from_slice(&adapted.body).expect("parse adapted body");
    let shortened_name = value
        .get("tools")
        .and_then(|tools| tools.get(0))
        .and_then(|tool| tool.get("name"))
        .and_then(serde_json::Value::as_str)
        .expect("tools[0].name")
        .to_string();
    assert_ne!(shortened_name, original_tool_name);
    assert!(shortened_name.len() <= 64);
    assert_eq!(
        adapted.tool_name_restore_map.get(&shortened_name),
        Some(&original_tool_name.to_string())
    );
    assert_eq!(
        value
            .get("tool_choice")
            .and_then(|tool_choice| tool_choice.get("name"))
            .and_then(serde_json::Value::as_str),
        Some(shortened_name.as_str())
    );
    assert_eq!(
        value
            .get("input")
            .and_then(serde_json::Value::as_array)
            .and_then(|items| {
                items.iter().find(|item| {
                    item.get("type").and_then(serde_json::Value::as_str) == Some("function_call")
                })
            })
            .and_then(|item| item.get("name"))
            .and_then(serde_json::Value::as_str),
        Some(shortened_name.as_str())
    );
}

#[test]
fn openai_chat_completions_stream_passthrough_is_forwarded() {
    let body = br#"{"model":"gpt-5.3-codex","messages":[{"role":"user","content":"hi"}],"stream":false,"stream_passthrough":true}"#.to_vec();
    let adapted = adapt_request_for_protocol(PROTOCOL_OPENAI_COMPAT, "/v1/chat/completions", body)
        .expect("adapt request");
    let value: serde_json::Value =
        serde_json::from_slice(&adapted.body).expect("parse adapted body");
    assert_eq!(adapted.path, "/v1/responses");
    assert_eq!(
        value
            .get("stream_passthrough")
            .and_then(serde_json::Value::as_bool),
        Some(true)
    );
}

#[test]
fn openai_chat_json_response_restores_shortened_tool_name() {
    let original_tool_name =
        "mcp__tool_server_namespace_for_codex_manager_gateway_adapter_alignment__very_long_tool_operation_name";
    let request = serde_json::json!({
        "model": "gpt-5.3-codex",
        "messages": [{ "role": "user", "content": "hi" }],
        "tools": [{
            "type": "function",
            "function": {
                "name": original_tool_name,
                "description": "test tool",
                "parameters": { "type": "object" }
            }
        }]
    });
    let adapted = adapt_request_for_protocol(
        PROTOCOL_OPENAI_COMPAT,
        "/v1/chat/completions",
        serde_json::to_vec(&request).expect("serialize request"),
    )
    .expect("adapt request");
    let adapted_value: serde_json::Value =
        serde_json::from_slice(&adapted.body).expect("parse adapted body");
    let shortened_name = adapted_value
        .get("tools")
        .and_then(|tools| tools.get(0))
        .and_then(|tool| tool.get("name"))
        .and_then(serde_json::Value::as_str)
        .expect("tools[0].name");
    let upstream = serde_json::json!({
        "id": "resp_restore_1",
        "object": "response",
        "created": 1700001000,
        "model": "gpt-5.3-codex",
        "output": [{
            "type": "function_call",
            "call_id": "call_restore_1",
            "name": shortened_name,
            "arguments": "{}"
        }]
    });
    let upstream_body = serde_json::to_vec(&upstream).expect("serialize upstream");
    let (body, content_type) = adapt_upstream_response_with_tool_name_restore_map(
        ResponseAdapter::OpenAIChatCompletionsJson,
        Some("application/json"),
        &upstream_body,
        Some(&adapted.tool_name_restore_map),
    )
    .expect("convert response");
    let value: serde_json::Value = serde_json::from_slice(&body).expect("parse converted body");
    assert_eq!(content_type, "application/json");
    assert_eq!(
        value
            .get("choices")
            .and_then(|choices| choices.get(0))
            .and_then(|choice| choice.get("message"))
            .and_then(|message| message.get("tool_calls"))
            .and_then(|tool_calls| tool_calls.get(0))
            .and_then(|tool_call| tool_call.get("function"))
            .and_then(|function| function.get("name"))
            .and_then(serde_json::Value::as_str),
        Some(original_tool_name)
    );
}

#[test]
fn openai_chat_stream_chunk_restores_shortened_tool_name() {
    let mut restore_map = super::ToolNameRestoreMap::new();
    restore_map.insert(
        "mcp__run_query_short".to_string(),
        "mcp__tool_server_namespace_for_codex_manager_gateway_adapter_alignment__run_query"
            .to_string(),
    );
    let value = serde_json::json!({
        "type": "response.output_item.added",
        "response_id": "resp_stream_restore_1",
        "created": 1700001100,
        "model": "gpt-5.3-codex",
        "output_index": 0,
        "item": {
            "type": "function_call",
            "call_id": "call_restore_stream_1",
            "name": "mcp__run_query_short"
        }
    });
    let mapped =
        convert_openai_chat_stream_chunk_with_tool_name_restore_map(&value, Some(&restore_map))
            .expect("map tool chunk");
    assert_eq!(
        mapped
            .get("choices")
            .and_then(|choices| choices.get(0))
            .and_then(|choice| choice.get("delta"))
            .and_then(|delta| delta.get("tool_calls"))
            .and_then(|tool_calls| tool_calls.get(0))
            .and_then(|tool_call| tool_call.get("function"))
            .and_then(|function| function.get("name"))
            .and_then(serde_json::Value::as_str),
        Some("mcp__tool_server_namespace_for_codex_manager_gateway_adapter_alignment__run_query")
    );
}

#[test]
fn openai_responses_passthrough_keeps_responses_path() {
    let body = br#"{"model":"gpt-5.3-codex","input":"hi"}"#.to_vec();
    let adapted = adapt_request_for_protocol(PROTOCOL_OPENAI_COMPAT, "/v1/responses", body.clone())
        .expect("adapt request");
    assert_eq!(adapted.path, "/v1/responses");
    assert_eq!(adapted.body, body);
    assert_eq!(adapted.response_adapter, ResponseAdapter::Passthrough);
}

#[test]
fn openai_completions_are_adapted_to_responses() {
    let body = br#"{"model":"gpt-5.3-codex","prompt":"hello","max_tokens":16}"#.to_vec();
    let adapted = adapt_request_for_protocol(PROTOCOL_OPENAI_COMPAT, "/v1/completions", body)
        .expect("adapt request");
    let value: serde_json::Value =
        serde_json::from_slice(&adapted.body).expect("parse adapted body");
    assert_eq!(adapted.path, "/v1/responses");
    assert_eq!(
        adapted.response_adapter,
        ResponseAdapter::OpenAICompletionsJson
    );
    assert_eq!(
        value
            .get("input")
            .and_then(|input| input.get(0))
            .and_then(|item| item.get("role"))
            .and_then(serde_json::Value::as_str),
        Some("user")
    );
    assert_eq!(
        value
            .get("input")
            .and_then(|input| input.get(0))
            .and_then(|item| item.get("content"))
            .and_then(|content| content.get(0))
            .and_then(|part| part.get("text"))
            .and_then(serde_json::Value::as_str),
        Some("hello")
    );
}

#[test]
fn openai_completions_stream_uses_sse_adapter() {
    let body = br#"{"model":"gpt-5.3-codex","prompt":"hello","stream":true}"#.to_vec();
    let adapted = adapt_request_for_protocol(PROTOCOL_OPENAI_COMPAT, "/v1/completions", body)
        .expect("adapt request");
    assert_eq!(adapted.path, "/v1/responses");
    assert_eq!(
        adapted.response_adapter,
        ResponseAdapter::OpenAICompletionsSse
    );
}

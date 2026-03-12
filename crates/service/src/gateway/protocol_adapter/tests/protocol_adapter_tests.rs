use super::{
    adapt_request_for_protocol, adapt_upstream_response,
    adapt_upstream_response_with_tool_name_restore_map, convert_openai_chat_stream_chunk,
    convert_openai_chat_stream_chunk_with_tool_name_restore_map,
    convert_openai_completions_stream_chunk, ResponseAdapter, ToolNameRestoreMap,
};

#[path = "protocol_adapter_tests/anthropic_request.rs"]
mod anthropic_request;
#[path = "protocol_adapter_tests/anthropic_response.rs"]
mod anthropic_response;
#[path = "protocol_adapter_tests/openai_request.rs"]
mod openai_request;
#[path = "protocol_adapter_tests/openai_response.rs"]
mod openai_response;

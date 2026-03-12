use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ResponseAdapter {
    Passthrough,
    AnthropicJson,
    AnthropicSse,
    OpenAIChatCompletionsJson,
    OpenAIChatCompletionsSse,
    OpenAICompletionsJson,
    OpenAICompletionsSse,
}

pub(crate) type ToolNameRestoreMap = BTreeMap<String, String>;

#[derive(Debug)]
pub(crate) struct AdaptedGatewayRequest {
    pub(crate) path: String,
    pub(crate) body: Vec<u8>,
    pub(crate) response_adapter: ResponseAdapter,
    pub(crate) tool_name_restore_map: ToolNameRestoreMap,
}

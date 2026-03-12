use codexmanager_core::rpc::types::{JsonRpcRequest, JsonRpcResponse};

use crate::startup_snapshot;

pub(super) fn try_handle(req: &JsonRpcRequest) -> Option<JsonRpcResponse> {
    let result = match req.method.as_str() {
        "startup/snapshot" => {
            let request_log_limit = super::i64_param(req, "requestLogLimit");
            super::value_or_error(startup_snapshot::read_startup_snapshot(request_log_limit))
        }
        _ => return None,
    };

    Some(super::response(req, result))
}

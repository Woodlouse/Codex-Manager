# Service 治理阶段报告

## 已完成
- [x] 恢复 `crates/service/tests/gateway_logs` 测试基座契约，补回 `support.rs` 兼容层与 `TestServer`。
- [x] 修复 `crates/service/tests/gateway_logs.rs` 的根层可见性错误，恢复 `cargo test -p codexmanager-service --no-run`。
- [x] 将 `crates/service/src/usage/usage_refresh.rs` 收口为真正门面，实现迁入 `crates/service/src/usage/refresh/mod.rs`。
- [x] 保留 `usage/refresh/{batch,errors,queue,runner,settings}.rs` 为职责子模块，移除根文件对 `#[path]` 子模块拼装的强耦合。
- [x] 将 `crates/service/src/app_settings/api` 的内部依赖收敛到 `crates/service/src/app_settings/api/mod.rs`，减少 `super::super::*` 反向依赖。
- [x] 清理 `crates/service/src/app_settings/mod.rs` 中已不再需要的内部 re-export，缩小顶层暴露面。
- [x] 将 `gateway/observability/http_bridge/stream_readers/*` 的 `use super::*` 改为显式依赖导入。
- [x] 将 `gateway/protocol_adapter/response_conversion/*` 收为门面 wrapper，减少 `pub(in super::super)` 暴露面与二级父模块 restore-map 引用。
- [x] 清理 `app_settings/env_overrides/*` 的残余 `super::super::*` 访问，为本层补齐显式门面。
- [x] 为 `usage`、`auth`、`requestlog`、`account`、`apikey` 建立子域 `mod.rs`，并在 `lib.rs` 通过别名导出保留既有调用路径。
- [x] 为 `storage_helpers.rs` 建立 `crates/service/src/storage/mod.rs` 门面，根层改为通过 `storage::helpers` 访问。
- [x] 将 `bootstrap.rs`、`startup.rs`、`shutdown.rs` 迁入 `crates/service/src/lifecycle/`，并通过 `lib.rs` 继续导出既有启动/关闭 API。
- [x] 将 `process_env.rs`、`lock_utils.rs`、`reasoning_effort.rs` 迁入 `crates/service/src/runtime/`，保留 `crate::process_env` / `crate::lock_utils` / `crate::reasoning_effort` 兼容入口。
- [x] 清理 `gateway/protocol_adapter/request_mapping/*` 对二级父模块的直接耦合，为 prompt cache key 与 tool restore map 补齐本层门面。
- [x] 清理 `gateway/protocol_adapter/tests/*` 中的 wildcard 导入，改为显式依赖引用。
- [x] 将 `rpc_auth.rs`、`web_access.rs` 迁入 `crates/service/src/auth/`，认证相关能力统一回收到 `auth` 子域。
- [x] 将 `error_codes.rs` 迁入 `crates/service/src/errors/`，并在 `lib.rs` 保留 `error_codes` 兼容别名。
- [x] 将 `gateway/protocol_adapter.rs` 与 `gateway/observability/http_bridge.rs` 迁入各自目录的 `mod.rs`，根入口改为真实目录门面。
- [x] 将 `gateway/protocol_adapter` 的共享契约抽到 `types.rs`，将请求改写入口抽到 `request_router.rs`，并把 prompt cache runtime reload 职责从根门面挪走。
- [x] 完成剩余治理项评估并形成决策文档，关闭 `rpc_dispatch`、`protocol_adapter/http_bridge` 二次拆分、`tests` 共享支持层三个悬空待办。

## 本轮验证
- [x] `cargo test -p codexmanager-service --no-run`
- [x] `cargo test -p codexmanager-service --test gateway_logs -- --nocapture`
- [x] `cargo test -p codexmanager-service --test app_settings -- --nocapture`
- [x] `cargo test -p codexmanager-service usage_refresh -- --nocapture`
- [x] `cargo test -p codexmanager-service protocol_adapter -- --nocapture`
- [x] `cargo test -p codexmanager-service --test shutdown_flag -- --nocapture`
- [x] `cargo test -p codexmanager-service --test default_addr -- --nocapture`
- [x] `cargo test -p codexmanager-service --test rpc -- --nocapture`

## 当前结构状态
- `gateway/upstream/`：已完成目录化，当前可作为后续治理基线。
- `gateway_logs`：已恢复旧 helper 契约，测试重新通过。
- `usage/refresh/`：已从“假拆分”收口为真实目录模块，根文件只保留门面职责。
- `app_settings/api/`：已从跨层直接引用改为通过 `api/mod.rs` 汇总依赖。
- `http_bridge/stream_readers/`：已去掉 wildcard 导入，依赖来源更明确。
- `response_conversion/`：已改为门面包装调用，模块可见性边界更稳。
- `protocol_adapter/`：根入口已切换为目录 `mod.rs`，共享类型已沉到 `types.rs`，请求入口已沉到 `request_router.rs`，prompt cache runtime reload 已从根门面移出。
- `http_bridge/`：根入口已切换为目录 `mod.rs`，聚合、OpenAI 转换、投递、stream reader 结构保持同域收口。
- `storage/`：已建立 `helpers` 子门面，根层不再直接挂 `storage_helpers.rs`。
- `lifecycle/`：已收拢启动、一次性启动、关闭请求等生命周期职责。
- `runtime/`：已承接进程环境、锁恢复、reasoning effort 归一化等运行时辅助职责。
- `auth/`：已统一承接登录、token、RPC 鉴权、Web 访问密码等认证相关职责。
- `errors/`：已从单根文件收成错误头、错误码、错误负载的统一门面。
- `lib.rs`：已把 `usage`、`auth`、`requestlog`、`account`、`apikey`、`storage`、`lifecycle`、`runtime`、`errors` 收为子域别名，根级长清单继续缩短。

## 剩余主要问题
- 当前未发现需要立即继续拆分的高收益结构治理项；后续是否继续下沉，以新增复杂度是否突破当前门面承载边界为准。

## 结论
当前 `service` 治理已从“半整理且阻塞编译”推进到“关键子域已门面化、根模块噪音明显下降、悬空待办已收敛为明确决策、关键回归持续全绿”的状态。本轮结构治理可以视为阶段性完成。

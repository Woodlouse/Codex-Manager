# gateway 目录说明

## 目标

`crates/service/src/gateway/` 是 CodexManager 最复杂的服务端域之一，负责本地网关、上游转发、协议适配、可观测性与选路逻辑。

本文档帮助协作者快速判断改动应该落在哪个子目录，避免把不同职责继续堆进单个大文件。

## 子目录职责

### `auth/`

负责：

- 上游鉴权补全
- token exchange
- OpenAI fallback 认证相关逻辑

### `core/`

负责：

- 网关运行时核心配置
- 与 gateway 自身行为直接相关的底层状态

### `local_validation/`

负责：

- 本地预校验
- 请求/鉴权/输入前置检查

### `model_picker/`

负责：

- 模型选择与解析
- 与请求模型决策相关的轻量逻辑

### `observability/`

负责：

- HTTP bridge
- trace log
- request log
- metrics

高风险文件：

- `observability/http_bridge.rs`

### `protocol_adapter/`

负责：

- OpenAI/Codex 输入输出适配
- request mapping
- response conversion
- prompt cache
- tools / `tool_calls` 聚合与还原

高风险文件：

- `protocol_adapter/request_mapping.rs`
- `protocol_adapter/response_conversion.rs`
- `protocol_adapter/response_conversion/sse_conversion.rs`

### `request/`

负责：

- 进入 gateway 前的请求规范化
- 本地能力请求（模型、计数等）
- chat / responses 请求改写

### `routing/`

负责：

- 选路
- cooldown
- failover
- request gate
- route quality / hint

### `upstream/`

负责：

- 上游候选管理
- 超时、重试、退避
- 代理配置
- transport 发送
- 不同上游协议实现

## 核心链路

典型链路：

1. `request/` 处理传入请求
2. `routing/` 选择候选账号与策略
3. `auth/` / `upstream/` 组装并发送上游请求
4. `protocol_adapter/` 转换输入输出
5. `observability/` 写入 trace、日志和指标

## 修改建议

### 改请求字段映射

优先查看：

- `protocol_adapter/request_mapping.rs`
- `request/request_rewrite_*.rs`

### 改 tools / `tool_calls`

优先查看：

- `protocol_adapter/response_conversion/tool_mapping.rs`
- `protocol_adapter/response_conversion.rs`
- `protocol_adapter/response_conversion/sse_conversion.rs`

### 改日志/错误头/trace

优先查看：

- `observability/http_bridge.rs`
- `request_log.rs`
- `trace_log.rs`
- `error_response.rs`

### 改代理/重试/超时

优先查看：

- `upstream/config.rs`
- `upstream/proxy.rs`
- `upstream/retry.rs`
- `upstream/transport.rs`
- `upstream/deadline.rs`

## 测试入口

- 单元/模块测试：各子目录 `tests/`
- service 兼容测试：`crates/service/tests/gateway/`
- 手工探针：`scripts/tests/gateway_regression_suite.ps1`

## 当前治理重点

- 持续拆小 `http_bridge.rs`
- 持续拆小 `request_mapping.rs`
- 持续拆小 `response_conversion.rs` / `sse_conversion.rs`
- 把协议兼容回归固定到脚本与 Rust 测试双路径

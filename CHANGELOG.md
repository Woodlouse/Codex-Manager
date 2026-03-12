# 更新日志

本文件用于记录 CodexManager 的对外可见变更，作为版本历史的唯一事实源。
格式参考 Keep a Changelog，并结合当前项目的实际维护方式做最小收敛。

## [Unreleased]

## [0.1.8] - 2026-03-11

### Fixed
- Removed the default `https://api.openai.com/v1` fallback path for ChatGPT-backed requests; upstream `challenge` and `403` outcomes are now returned from the primary login-account path instead of being rewritten into local fallback errors.
- ChatGPT login-account requests now recover from `401` by refreshing the local `access_token` with the stored `refresh_token` and retrying the current request once.

### Changed
- ChatGPT login-account turns now use `access_token` directly on the primary upstream path and no longer mix in `api_key_access_token` semantics.
- Synthetic gateway terminal failures now return structured OpenAI-style `error.message / error.type / error.code` payloads while keeping the existing trace and error-code headers.

## [0.1.7] - 2026-03-11

### Added
- 设置页新增网关传输参数：支持直接配置上游流式超时与 SSE keepalive 间隔，并在 service 运行时热生效。
- 桌面端启动快照补齐：仪表盘统计、账号用量状态、请求日志首屏会优先恢复最近一次快照，减少源码运行或服务重启后的全 0 / 未知状态。

### Fixed
- 修复 `codexmanager-web` 的访问密码会话跨重启仍可继续使用的问题；关闭并重新打开 Web 进程后，旧登录 Cookie 会失效，需要重新验证密码。
- 修复源码运行 `codexmanager-web` 时的启动与根路由兼容问题，减少 Web 静态资源与根路径在 Axum 路由下的不一致行为。
- 修复长输出场景下的 SSE 空闲断流重连问题，降低长时流式响应被误判中断的概率。
- 修复设置页保存上游代理、平台密钥创建弹窗关闭与重复提交、登录成功后账号表格未刷新等桌面交互问题。
- 修复模型拉取默认附加版本参数导致的部分上游兼容性问题，模型请求改为默认不附带版本号。
- 修复账号导入与登录回调两条链路的账号归并逻辑不一致问题，统一按同一身份规则新增或更新账号。
- 修复 Claude / Anthropic `/v1/messages` 适配在多 MCP server 场景下的工具截断问题；不再因前 16 个工具占满而丢失后续 server 的工具。
- 修复 Claude / Anthropic `/v1/messages` 链路缺少长工具名缩短与响应还原的问题，避免 MCP 工具名过长时映射不稳定。

### Changed
- 网关失败响应增加结构化 `errorCode` / `errorDetail` 字段，并同步补充 `X-CodexManager-Error-Code`、`X-CodexManager-Trace-Id` 响应头，便于客户端与日志系统追踪失败链路。
- 协议适配继续对齐 Codex / OpenAI 兼容生态：进一步统一 `/v1/chat/completions`、`/v1/responses`、Claude `/v1/messages` 的转发语义，并稳固 `tools` / `tool_calls`、thinking / reasoning、流式桥接和响应还原链路。
- 设置页与运行时配置继续收敛：背景任务、网关传输、上游代理、Web 安全等高频配置统一由 `app_settings` 持久化并回填到当前进程。
- 桌面与 service 启动链路继续治理，收敛 Web / service / desktop 之间的启动边界与启动顺序，减少源码运行与打包运行的行为分叉。
- 项目内部继续推进长期维护向的重构治理：前端主入口、设置页、请求日志视图、Tauri 命令注册、service 生命周期、gateway protocol adapter、HTTP bridge、upstream attempt flow 等区域已进一步拆分模块边界，减少大文件与根层门面耦合。
- service / gateway 目录结构继续收敛，更多通配导入、跨层直连和超长门面清单已被显式依赖与分层模块替代，后续维护和协议回归定位成本更低。
- 发布链路继续收敛到 `release-all.yml` 单入口，并复用前端构建产物与协议回归基线，减少重复构建与发布时的协议回归风险。

## [0.1.6] - 2026-03-07

### Fixed
- 修复 `release-all.yml` 在手动关闭 `run_verify` 时仍强依赖预构建前端工件的问题；各平台任务缺少 `codexmanager-frontend-dist` 时会自动回退到本地 `pnpm install + build`。

### Changed
- Windows 桌面端发布产物继续收敛，仅保留 `CodexManager-portable.exe` 便携版，不再额外生成 `CodexManager-windows-portable.zip`。
- 完善 SOCKS5 上游代理支持与归一化，并补充设置页中的代理协议提示文案。

## [0.1.5] - 2026-03-06

### Added
- 新增“按文件夹导入”：桌面端可直接选择目录，递归扫描其中 `.json` 文件并批量导入账号。
- 新增 OpenAI 上游代理配置与请求头收敛策略开关，可在设置页直接保存并即时生效。
- 补充 chat tools 命中探针脚本，便于本地验证工具调用是否真正命中与透传。

### Fixed
- 修复 `tool_calls` / `tools` 相关回归：补齐 chat 聚合路径中的工具调用保留、工具名缩短与响应还原链路，避免工具调用在 OpenAI 兼容返回、流式增量和适配转换中丢失或名称错乱。
- 完善 OpenClaw / Anthropic 兼容返回适配，确保工具调用、SSE 增量和非流式 JSON 响应都能按兼容格式正确还原。
- 请求日志追踪增强，补充原始路径、适配路径和更多上下文，便于定位 `/v1/chat/completions -> /v1/responses` 转发与协议适配问题。

### Changed
- 网关协议适配进一步对齐 Codex CLI：`/v1/chat/completions` 与 `/v1/responses` 两条链路统一收敛到 Codex `responses` 语义，上游流式/非流式行为与官方更接近，兼容 Cherry Studio 等客户端的 OpenAI 兼容调用。
- 设置页顶部常用配置改为统一的三列行布局，代理配置与其保持一致；同时支持关闭窗口后隐藏到系统托盘运行。
- 发布流程整合为单一一键多平台 workflow，并收敛桌面端产物形态；Windows 直接提供 portable exe，macOS 统一使用 DMG 分发。

## [0.1.4] - 2026-03-03

### Added
- 新增“一键移除不可用 Free 账号”：批量清理“不可用 + free 计划”账号，并返回扫描/跳过/删除统计。
- 新增“导出用户”：支持选择本地目录并按“一个账号一个 JSON 文件”导出。
- 导入兼容增强：支持 `tokens.*`、顶层 `*_token`、camelCase 字段（如 `accessToken` / `idToken` / `refreshToken`）自动识别。

### Fixed
- 兼容旧 service：前端导入前会自动归一化顶层 token 格式，避免旧版后端报 `missing field: tokens`。

### Changed
- 账号管理页操作区整合为单一“账号操作”下拉菜单，替代右侧多按钮堆叠，界面更简洁。

[Unreleased]: https://github.com/qxcnm/Codex-Manager/compare/v0.1.8...HEAD
[0.1.8]: https://github.com/qxcnm/Codex-Manager/releases/tag/v0.1.8
[0.1.7]: https://github.com/qxcnm/Codex-Manager/releases/tag/v0.1.7
[0.1.6]: https://github.com/qxcnm/Codex-Manager/releases/tag/v0.1.6
[0.1.5]: https://github.com/qxcnm/Codex-Manager/releases/tag/v0.1.5
[0.1.4]: https://github.com/qxcnm/Codex-Manager/releases/tag/v0.1.4

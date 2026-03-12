# apps 测试说明

## 目标

本文件用于区分 `apps/src/**/tests` 与 `apps/tests` 的边界，避免前端测试持续无序扩张。

## 目录边界

### `apps/src/**/tests`

适合放：

- 单个模块的纯逻辑测试
- 轻量 DOM 辅助测试
- 与具体文件强绑定的回归测试
- 不依赖完整页面装配的局部行为验证

当前典型示例：

- `apps/src/services/tests/`
- `apps/src/settings/tests/`
- `apps/src/ui/tests/`
- `apps/src/views/tests/`
- `apps/src/utils/tests/`

约束：

- 测试文件应尽量贴近被测模块
- 不要在这里验证整页结构、入口装配、跨模块联动

### `apps/tests`

适合放：

- 页面级结构测试
- 启动装配测试
- 跨模块联动测试
- 大块 UI 约束与回归测试
- “从入口看行为”的集成型前端测试

当前典型示例：

- `refresh-flow.test.js`
- `service-toggle.test.js`
- `requestlogs-page.test.js`
- `codexmanager-layout.test.js`

约束：

- 这里的测试应站在页面或入口角度，不要退化成重复单元测试
- 若只测一个工具函数，不应放到 `apps/tests`

## 运行方式

- 全量前端测试：`pnpm -C apps run test`
- 页面/结构测试：`pnpm -C apps run test:ui`
- 前端构建验证：`pnpm -C apps run build`

## 新增测试时的判断标准

1. 被测对象是否能通过单模块 import 独立构造？如果可以，优先放 `src/**/tests`
2. 是否依赖 `main.js` 装配、页面 DOM、入口 wiring？如果是，优先放 `apps/tests`
3. 是否会随着文件移动而一起维护？如果是，优先贴近模块放置
4. 是否要防止入口层回归？如果是，优先放 `apps/tests`

## 当前维护约定

- `src/**/tests/*.test.js`：贴近模块的轻量测试。`apps/tests/*.test.js`：页面/入口结构测试。
- 后续若统一命名，需要连同 `scripts/run-tests.mjs` 与现有目录边界一起调整，而不是只改后缀



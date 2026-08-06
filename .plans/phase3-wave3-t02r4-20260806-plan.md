# Wave 3：T02-R4 学生核心流程失败反馈矩阵

**计划编号**：PHASE3-WAVE3-T02R4-20260806
**状态**：📝 已创建；用户已于 2026-08-06 指示推进 Wave 3
**日期**：2026-08-06
**上游**：`PHASE3-REOPEN-HIGH-WEIGHT-20260728` Wave 3；T02A（统一错误边界）、T02C（env 脱敏）、T05-1（日志脱敏）

## 1. 目标

对 S1/S2/S3/S4/S5/S7 核心路径建立**可操作且脱敏**的失败反馈矩阵：输入错误、不存在、未配置、超时/下游失败、未知异常、重试建议。前端只展示脱敏中文行动建议，不展示内部栈、路径、Provider 响应或秘密。

## 2. 现状

- 后端：`api-error-handler.ts` 已实现安全错误映射（NOT_FOUND/INVALID_JSON/FILE_TOO_LARGE/BAD_REQUEST/INTERNAL_ERROR 等固定码）。
- 前端：`use-api-request.ts` 显示 `ApiClientError.message`（来自后端 API message）；`FeedbackMessage`/`PageState` 组件支持 error 状态。
- 差距：各业务服务抛出的 `ApiError` message 是否**可操作**（告诉学生下一步）且**脱敏**（无内部信息）需逐系统核查。

## 3. 实施内容

### 3.1 错误分类矩阵（后端 message 规范化）

| 类别 | 后端错误码前缀 | 前端显示 | 重试建议 |
|---|---|---|---|
| 输入错误 | `*_INPUT_INVALID`/`*_INVALID` | 固定中文提示（具体字段） | 修正后重试 |
| 不存在 | `*_NOT_FOUND` | "未找到…" | 返回/刷新 |
| 未配置 | `*_NOT_CONFIGURED`/`*_UNAVAILABLE` | "需要先在设置中配置…" | 跳转设置 |
| 超时/下游失败 | `*_TIMEOUT`/`*_FAILED`/`*_UNAVAILABLE` | "服务暂时不可用" | 稍后重试 |
| 未知异常 | `INTERNAL_ERROR` | "发生未知错误" | 稍后重试 |

### 3.2 逐系统核查与修复

- S1（study-rhythm）、S2（note-builder）、S3（practice-runner）、S4（error-fixer）、S5（exam-crammer）、S7（class-capture）：逐服务核查抛出的错误 message，规范化到上述矩阵；确认不含路径、UUID、Provider URL、秘密、堆栈。
- S7 特别：无合法 CLI/模型时输出"未配置"状态而非伪造成功。

### 3.3 前端

- 确认 `use-api-request` 展示后端 message（已是），无需重复映射。
- 抽查核心页面错误态（空/失败/重试）已有 PageState 覆盖（T09D 已实现）。

## 4. 验证

- 后端：新增/更新错误分类测试（每类至少 1 个用例断言 message 可操作且脱敏）。
- 前端：现有测试 + 抽查错误态渲染。
- 浏览器：失败路径（如未配置 AI 时生成笔记）显示中文行动建议。
- `pnpm type-check`、后端/前端 build、`pnpm test`、文档治理、`git diff --check`。

## 5. 非目标

- 不做 T02-R6 总体验收（Wave 4）。
- 不新增功能；仅规范错误反馈。
- 不运行真实外部服务。

## 6. 交付

- 错误 message 规范化 + 分类矩阵测试 + docs/04 登记 → 合入 master → 推送。

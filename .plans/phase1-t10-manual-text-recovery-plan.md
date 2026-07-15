# Phase 1-T10：人工补文恢复闭环计划

**状态**：已批准，已完成实现与自动化验证
**日期**：2026-07-15
**任务归属**：S2 资料笔记（NoteBuilder）

## 1. 目标

补齐资料处理失败后的人工恢复闭环，让学生在浏览器中能够理解当前状态、选择合适恢复动作，并在需要时粘贴一份完整可用正文重新触发笔记生成。

本任务只覆盖 S2 的失败恢复，不实现考试项目工作台、考试确认、学习任务创建、Provider 健康熔断、S3 练习或 S4 错题。

## 2. 当前事实与缺口

- 后端已有 `POST /materials/:id/replace-text`、`retry-conversion`、`retry-ai-generation`。
- 前端 API 已封装 `replaceText()`，`MaterialStatus` 也预留 `onReplaceText`，但 `MaterialUploadPage` 没有接入该回调、没有输入 UI，浏览器无法完成手动补文。
- 后端 `replaceText()` 只接受 `conversion_failed` 或 `pending`，会拒绝真实 AI 降级的 `pending_quality_check`；这与 T09 发现的“无 Provider 可读文本但没有人工补文入口”冲突。
- 当前 `pending` 是 Worker 正在等待的正常状态，不是人工恢复态；继续允许它进入手动补文有并发覆盖风险。
- S2 PRD 当前把自动与手动尝试合并限制为最多 3 次，但人工提交的新完整正文属于新的文本版本；若仍与旧文本共享耗尽的 AI 次数，`pending_quality_check` 无法恢复。

## 3. 设计决策（已批准）

### 3.1 状态与动作矩阵

| Material 状态 | 学生可见动作 | 后端行为 |
| --- | --- | --- |
| `conversion_failed` | “粘贴完整正文后继续”与“重试转换” | 手动正文替换后进入 `converted`，创建 `note_generate` Job |
| `pending_quality_check` | “重试生成笔记”与“替换正文后重新生成” | 重试沿用现有动作；替换正文后进入新的 AI 生成周期 |
| `pending` / `converting` / `note_generating` | 不显示手动正文入口 | 保持 Worker 所有权，拒绝手动覆盖 |
| `completed` | “查看笔记” | 不允许替换正文 |

### 3.2 人工补文语义

- 表单要求学生粘贴**完整、可独立用于生成笔记的正文**，不是增量拼接、不是富文本笔记编辑器。
- 最小输入长度仍为 1，最大为 1,048,576 字符；提交前进行 trim 校验，并显示字数与明确错误提示。
- 保留原始上传文件；只替换该 material 的 `normalized_texts` 记录。
- `normalized_texts.metadata_json` 写入 `converter: "manual"`、`recoveryFrom` 和 `recoveredAt`，不保存浏览器本地草稿到 localStorage/IndexedDB。
- 成功提交后清空旧的转换/AI 失败摘要，刷新资料列表并继续使用现有轮询观察后续状态。

### 3.3 重试预算

- 普通自动重试和“重试生成笔记”继续受当前单个 Job 最多 3 次的限制。
- **手动替换完整正文视为新的文本版本**：创建新的 `note_generate` Job，并给予该新 Job 最多 3 次执行机会；这不是对同一份旧输入无限重试。
- 同时更新 S2 PRD 的重试表述，明确“每个文本版本”的边界，避免现有 PRD 与代码/恢复流程冲突。

### 3.4 页面交互

- 不新增路由、不新增数据表、不做弹窗库或笔记编辑器。
- 在资料状态卡内展开一个受控 textarea 表单：状态解释 → 完整正文输入 → 字数 → “重新生成笔记”/“取消”。
- 展开前不请求或展示完整 `normalized_text`，避免把可能很长的资料正文无必要地回填到页面；学生自行粘贴确认后的完整正文。
- 提交进行中禁用提交与相同资料的恢复按钮；成功后关闭表单，失败时在该资料卡附近显示可恢复错误。
- `pending_quality_check` 的文案要明确区分“可先重试 AI”和“正文需要更正时替换后重新生成”；`conversion_failed` 要明确提示原始文件仍被保留。

## 4. 涉及文件与所有权

| 文件 | 动作 | 责任 |
| --- | --- | --- |
| `docs/subsystems/03-S2-资料笔记子系统PRD-NoteBuilder.md` | 更新 | 修正人工恢复状态与“每个文本版本”重试预算语义 |
| `docs/04-开发任务清单-Todo-List.md` | 更新收尾 | 仅在全部验证和提交时把 Phase 1-T10 标为完成，并记录范围 |
| `packages/backend/src/services/note-builder-service.ts` | 修改 | 将人工文本替换仅允许在失败恢复态，清理错误摘要，写入恢复来源元数据并安全创建新 Job |
| `packages/backend/src/api/note-builder.ts` | 视需要修改 | 保持标准 API 信封；仅在需要更清晰输入校验时调整 |
| `packages/backend/test/manual-text-recovery-api.test.mjs` | 新建 | API/DB 集成测试，不 mock DB |
| `packages/backend/test/manual-text-recovery-worker.test.mjs` | 新建或合并现有 Worker 测试 | 用注入的假 AI 验证人工替换后可完成笔记、模块和 StudyEvent |
| `packages/frontend/src/pages/material-upload-page.tsx` | 修改 | 接入 `replaceText`、表单状态、提交/取消/错误与刷新 |
| `packages/frontend/src/components/material-status.tsx` | 修改 | 暴露状态说明、恢复动作与插槽/受控表单入口，保持状态卡职责清晰 |
| `packages/frontend/test/material-upload-page.test.tsx` | 新建 | 验证 `pending_quality_check`/`conversion_failed` 的动作、表单、payload、成功与错误状态 |
| `packages/frontend/src/styles/global.css` | 最小修改 | textarea 与恢复区域的紧凑可读样式；不重做页面视觉 |

不修改 Provider Router、数据库 schema、共享 API 信封结构或 S3/S4 设计文档。

## 5. 实施步骤

1. 在隔离分支/worktree 创建 Phase 1-T10 实现环境；主 checkout 保持干净。
2. 先补/调整后端集成测试，锁定状态矩阵：`conversion_failed` 和 `pending_quality_check` 可人工恢复；`pending`、处理中和 `completed` 被拒绝；非法正文和跨学期 ID 仍按现有错误信封返回。
3. 修改 `replaceText()`：在一个事务中替换纯文本、写入恢复元数据、清空失败摘要、设置 `converted` 并插入新的 `note_generate` Job；不得吞掉除“已有 pending/running Job”外的数据库错误。
4. 用注入的假 AI 跑 Worker，证明人工文本替换后可以落库笔记、知识模块和 `material_note_completed` 事件；同时证明原文件未被删除。
5. 在前端接入 textarea 恢复表单和 `replaceText()`，使用现有 `useMaterialPolling` 与列表 refetch；不把正文草稿持久化到浏览器。
6. 添加前端 jsdom 测试：渲染失败状态、展开输入、输入/取消、提交 payload、提交中禁用、API 失败提示和成功后列表刷新。
7. 更新 S2 PRD 的状态/重试规则；全部验证通过且提交前才更新 `docs/04` 的 T10 状态。

## 6. 测试与验收策略

### 自动化

```powershell
pnpm type-check
pnpm -r --filter backend run build
pnpm -r --filter @ai-studybuddy/frontend run build
pnpm test
```

重点断言：

- `pending_quality_check` 不再返回 `INVALID_STATUS`；`pending` 仍返回 `INVALID_STATUS`。
- 手动正文替换后状态为 `converted`，新 Job 为 `pending`，失败摘要已清空，元数据可追溯恢复来源。
- 假 AI 成功时，人工恢复可得到 `completed`、笔记、知识模块和 StudyEvent。
- 前端仅在两个失败恢复态显示相应动作；没有正文时不发请求；成功和失败都不会白屏。

### 浏览器 smoke（隔离数据）

```powershell
$env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t10-smoke'
pnpm -r --filter backend run dev
```

1. 创建隔离学期与课程。
2. 让资料进入 `conversion_failed` 或 `pending_quality_check`；确认状态说明、恢复入口和取消动作可用。
3. 粘贴合成文本，提交后确认状态变化、刷新后不丢失、原始文件仍存在。
4. 无 Provider 环境下，验证恢复后的 AI 失败仍保持可读文本且页面不白屏；完整“人工文本 → 成功笔记”由自动化假 AI 覆盖。
5. 如另行批准真实 Provider 验证，必须使用独立 `APP_DATA_ROOT`，并只记录脱敏摘要、token、耗时和截图路径。

## 7. 治理与提交

- 更新文档后运行：

  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
  git diff --check
  ```

- 提交前只暂存本计划与上述批准文件，并运行 `git diff --cached --check`。
- 提交消息：`feat(s2): 完成人工补文恢复闭环`。
- 默认不推送、不合并；完成后交付改动、验证、浏览器证据摘要和未实现边界。

## 8. 风险审查

| 风险 | 处理方式 |
| --- | --- |
| 手动正文与正在运行的 Worker 竞争 | 只允许两个终态失败状态，不允许 `pending`/处理中状态；后端再次校验状态 |
| AI 已用尽重试次数后仍无法恢复 | 让“完整正文替换”成为新文本版本，建立新的受限 Job；同步修正 S2 PRD |
| 用户把“补文”理解为追加片段 | 文案明确要求粘贴完整正文；本期不做合并、Diff 或富文本编辑 |
| 前端隐藏了原文，学生不知道输入什么 | 保留原始文件、状态提示和简短 normalized preview；不在列表直接回填完整长文本 |
| 失败摘要或手动正文泄露 | 沿用脱敏错误摘要；不写浏览器持久化、不把正文写日志或测试输出 |
| scope 扩张到 Provider 熔断或笔记编辑器 | 两者明确不属于 T10，分别保留到 T02 / 后续产品决策 |

## 9. 非目标

- 不实现 Provider 连续失败熔断。
- 不新增 AI Provider，不修改 Router 排序或 fallback 策略。
- 不做富文本笔记编辑、正文拼接、版本历史 UI、云同步或多端协作。
- 不创建 S3/S4 PRD，不实现练习和错题功能。
- 不实现 T11 的考试/任务浏览器闭环或“考试项目工作台”。


## 9. 执行记录

- 2026-07-15：用户批准后实施 Phase 1-T10。
- 后端 `replaceText()` 改为人工完整正文恢复语义，支持 `conversion_failed` / `pending_quality_check`，拒绝正常处理态与完成态。
- 前端资料页接入卡片内人工补文表单，提交后重新触发笔记生成并刷新列表。
- 新增 API、Worker 与前端测试。
- 隔离 `APP_DATA_ROOT=I:\ai-studybuddy-tmp\runs\phase1-t10-full-test` 下 `pnpm test` 已通过。
- 隔离 smoke run 使用 Edge 真实浏览器验证资料页人工补文闭环，并保存截图到 `I:\ai-studybuddy-tmp\runs\phase1-t10-smoke\browser-smoke-success.png`。

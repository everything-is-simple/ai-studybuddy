# Phase 1.5-T01：S7 课堂采集 PRD 行动计划

**版本**：v1.0
**日期**：2026-07-21
**任务分支**：`codex/phase1-5-t01-s7-prd`
**任务类型**：门禁审计 + 纯文档任务
**批准状态**：用户已于 2026-07-21 明确批准本计划；批准范围仅限 T01，不授权 T02–T06。

---

## 1. 任务目标

Phase 1.5-T01 的单一责任是创建并登记 S7 课堂采集子系统轻量 PRD：

```text
docs/subsystems/07-S7-课堂录音子系统PRD-ClassCapture.md
```

本任务只定义 S7 的产品边界、S2 复用关系、输入输出、职责划分、失败与隐私边界、验收标准及后续门禁；不实现 ASR、FFmpeg、上传 API、Job Worker、前端页面或任何业务代码。

---

## 2. 门禁审计

### 2.1 文档与任务依据

已按仓库顺序核对：

1. `docs/00-文档索引-Index.md`
2. `docs/04-开发任务清单-Todo-List.md`
3. `docs/01-总PRD-产品需求-Product-Requirements.md`
4. `docs/02-七子系统地图-Scenario-Systems.md`
5. `docs/08-共同底座架构-Architecture.md`
6. `docs/10-后端开发规范-Backend-Guidelines.md`
7. `docs/11-前端开发规范-Frontend-Guidelines.md`
8. `docs/12-开发规范-Dev-Rules.md`
9. `docs/subsystems/03-S2-资料笔记子系统PRD-NoteBuilder.md`
10. 现有 `.plans/` PRD 任务范式

`docs/04` 已存在 Phase 1.5-T01 任务行，单一责任为创建目标 PRD；不需要新增任务编号。

### 2.2 目标文件存在性

- 目标 S7 PRD 当前不存在。
- `.plans/` 中此前不存在 S7、ASR 或 ClassCapture 的行动计划。
- `docs/00` 将目标 PRD 标记为“未创建”，触发条件为 Phase 1.5。

### 2.3 前置能力

- 最新 `origin/master` 已登记 Phase 0.8、Phase 1、Phase 2-T01–T06 与 POST-PHASE2 完成主线复验和推送。
- S2 已完成资料上传、格式转换、`normalized_texts` 持久化、AI 笔记、导图与知识模块主链路。
- 现有转换层统一返回 `ConverterResult`；Material Worker 已负责转换完成后进入 S2 笔记生成阶段。
- 因此，“Phase 1 中 S2 笔记管道稳定运行”的 T01 前置条件已经满足。

### 2.4 门禁结论

**Phase 1.5-T01 可以实施。**

本结论只允许创建和登记 S7 PRD。SenseVoice/FunASR 与 FFmpeg 尚未形成当前 S7 的 composer smoke 证据，不能把 T02/T03 描述为已完成；正式 Adapter、API、Job Worker 与前端也不得在本任务中创建。

---

## 3. PRD 内容设计

PRD 固定覆盖以下内容：

1. 子系统定位与用户价值。
2. 主流程：课堂录音文件 → 音频预处理 → 本地 ASR → 纯文本 `ConverterResult` → S2 笔记生成管道。
3. Phase 1.5 MVP 范围与完整产品方向。
4. 输入、输出以及与学期、课程、资料、笔记对象的关系。
5. composer、`AuralConverter`、后端/API、Job Worker、前端和 S2 的职责矩阵。
6. 状态、失败、重试、幂等和降级原则，但不冻结具体 Schema、路由或枚举。
7. 本地优先、日志最小化、StudyEvent 与家长报告的隐私边界。
8. T01 验收标准、T02–T06 路线与独立门禁。
9. 非目标和安全边界。

PRD不得把未来接口方向写成当前已实现事实；`AuralConverter` 只说明复用 `ConverterResult` 的方向，具体类型扩展、MIME 白名单、上传路由和 Job 状态由 T04/T05 的独立计划决定。

---

## 4. 文件白名单

本任务只允许修改：

```text
.plans/phase1-5-t01-s7-prd-plan.md
docs/subsystems/07-S7-课堂录音子系统PRD-ClassCapture.md
docs/00-文档索引-Index.md
docs/04-开发任务清单-Todo-List.md
```

禁止修改 `packages/`、数据库 migration、环境变量模板、锁文件、构建配置，以及任何 T02–T06 实现文件。

---

## 5. 验证与交付

### 5.1 计划检查点

1. fresh-pass 核对本计划与 `docs/01`、`docs/02`、`docs/08`、S2 PRD 和开发规范的一致性。
2. 运行 `git diff --check`。
3. 仅暂存本计划并运行 `git diff --cached --check`。
4. 提交 `docs(s7): 登记课堂采集 PRD 行动计划` 并推送任务分支。

### 5.2 PRD 收口

1. 创建 S7 PRD并更新 `docs/00`、`docs/04`。
2. fresh-pass 核对 S2 复用链路、职责边界、失败/隐私边界和 T02–T06 非实现范围。
3. 运行：
   - `powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1`
   - `git diff --check`
   - 暂存后 `git diff --cached --check`
4. 提交 `docs(s7): 创建课堂录音子系统 PRD` 并推送任务分支。
5. 将任务分支 rebase 到最新 `master`，以 `git merge --ff-only` 合入。
6. 在 `master` 重新运行文档治理和 diff 检查，再推送 `origin/master`。

纯文档任务不运行 type-check、构建或业务测试。若发现业务代码进入 diff，立即停止并移出本任务范围。

---

## 6. 完成标准

- S7 PRD 已创建并进入有效文档索引。
- `docs/04` 将 T01 标记为完成并登记计划、批准、验证和 Git 证据。
- Phase 1.5 只登记 T01 完成，T02–T06 保持未启动。
- 任务分支已快进合入 `master`，主线治理检查通过且已推送 `origin/master`。
- 下一步只建议制定并审批 T02 ASR composer smoke 行动计划，不自动开始 T02。

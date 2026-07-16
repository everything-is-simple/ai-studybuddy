# Phase 1-T04: S4 错题改错子系统 PRD 实施计划

**版本**：v0.1
**日期**：2026-07-16
**状态**：计划已创建并完成独立自审，等待用户明确批准
**任务分支**：`codex/phase1-t04-s4-prd-plan`

---

## 1. 任务目标

在用户明确批准本计划后，创建 S4 错题改错子系统的轻量 PRD，记录其产品边界、与既有 S1/S2/S3 的输入输出关系、隐私约束、非目标及后续拆分门禁。

本任务是文档任务，不实施 S4。提交范围只允许：

- 新建 `docs/subsystems/05-S4-错题改错子系统PRD-ErrorFixer.md`；
- 更新 `docs/00-文档索引-Index.md` 的 S4 PRD 状态与索引记录；
- 更新 `docs/04-开发任务清单-Todo-List.md` 的 T04 文档任务完成证据和下一门禁；
- 保留本计划文件作为决策和审批记录。

用户未批准前，只允许保留和审查本 `.plans/` 文件；不得创建 S4 PRD 正文，亦不得修改正式文档或业务代码。

---

## 2. 已读依据与当前事实

- `docs/00-文档索引-Index.md` v2.13：S3 MVP 已完成，S4 PRD 触发条件满足，但仍需独立计划和用户明确批准。
- `docs/04-开发任务清单-Todo-List.md` v1.21：当前下一门禁为 T04；T04 后续才是 T04A Schema 与归档、T04B 前端。
- `docs/01-总PRD-产品需求-Product-Requirements.md`：S4 的目标是把“做错了”变成“知道为什么错，并安排重做”；共同对象链为 `KnowledgeModule -> Question -> PracticeSession / PracticeAnswer -> Mistake -> WeakPoint`。
- `docs/02-七子系统地图-Scenario-Systems.md`：S4 以可追溯学习证据为输入，不能取代 S1 的时间线、S2 的知识模块或 S3 的练习和批改。
- `docs/08-共同底座架构-Architecture.md`：业务数据按学期 SQLite 隔离，跨子系统必须通过已定义对象和服务边界协作。
- `docs/10-后端开发规范-Backend-Guidelines.md`、`docs/11-前端开发规范-Frontend-Guidelines.md`：未来实现必须分别遵守路径、API 信封、数据隔离及前端仅消费 API 的规则；本次不触发任何实现。
- `docs/12-开发规范-Dev-Rules.md`：计划获批前不得修改正式文档或业务代码；纯文档提交须通过文档治理与 diff 检查。
- `docs/subsystems/03-S3-限时练习子系统PRD-PracticeRunner.md`：S3 已在批改后写入 `practice_answers`，其中 `is_correct = false` 是 S4 的可消费错题事实；S3 不负责归档、薄弱点、重做或回流。

已发现一处待获批时校正的文档漂移：`docs/04` 的总览和 T04 路线图仍正确说明“需要独立计划、审查和用户明确批准”，但 T04 小节的门禁括号误写为“文档计划已批准”。本计划、`docs/00` 与当前用户指令均确认尚未批准；该括号不得被解释为实施授权，且应在获批创建 PRD 时改为与实际状态一致的完成/下一门禁说明。

当前 `master` 与 `origin/master` 均为 `9045318`。本计划在隔离 worktree 的任务分支中编写，不触碰主 checkout 的既有工作树状态。

---

## 3. 获批后将创建的 PRD 结构

目标文件：`docs/subsystems/05-S4-错题改错子系统PRD-ErrorFixer.md`。

PRD 使用与 S3 一致的轻量结构，并只定义以下产品设计层内容：

1. **问题、目标与成功标准**：明确 S4 把错误作答转为可解释、可重做、可观察的复习闭环，不能把一次错误直接判定为学生不掌握。
2. **用户故事与流程**：说明错误作答进入待处理错题、学生查看来源和关联知识模块、补充或选择错因、安排/完成重做、更新掌握证据的概念流程。
3. **S3 输入边界**：明确只读取同学期、同课程、已经规则批改的 `practice_answers.is_correct = false` 及其关联的 `Question`、`PracticeSession`、`KnowledgeModule`。错题来源必须可追溯到原练习，S4 不更改 S3 的题干、答案、批改结果或历史作答。
4. **概念对象与状态边界**：仅在 PRD 中描述 `Mistake`、`WeakPoint`、错因、重做记录、掌握状态和复习优先级的职责及关系；不规定表字段、迁移版本、SQL、API DTO、路由或前端组件。
5. **改错和复习边界**：区分原题重做、同类题重做和变题重做的用户意图；把实际归档、重做、薄弱点归纳和优先级回流分别留给 T04A、T04B、T05 的独立获批计划。
6. **隐私与可解释性**：错因可以由学生确认或 AI 建议，但 AI 不能替学生伪造原因或作最终学习判断；S6 将来只能读取脱敏汇总，不能读取题干、答案、错题正文或学生原始作答。
7. **验收边界和非目标**：列出 S4 PRD 本身所定义的验收方向，并重申本任务没有任何可运行实现。

---

## 4. 文件级执行步骤（仅在获批后）

### 步骤 1：复核文档门禁与范围

1. 重新读取 `docs/00-文档索引-Index.md`、`docs/04-开发任务清单-Todo-List.md`、`docs/01-总PRD-产品需求-Product-Requirements.md`、`docs/02-七子系统地图-Scenario-Systems.md`、`docs/08-共同底座架构-Architecture.md`、`docs/12-开发规范-Dev-Rules.md` 和 S3 PRD。
2. 确认 S4 PRD 文件尚不存在，S3 MVP 完成状态没有漂移，且用户已明确批准本计划。
3. 若任一条件不成立，停止，不创建 S4 PRD。

### 步骤 2：创建 S4 PRD 正文

创建 `docs/subsystems/05-S4-错题改错子系统PRD-ErrorFixer.md`，按第 3 节列出的结构写入产品需求和边界。

文档必须以现有 S3 事实为准：错误作答来自 `practice_answers.is_correct = false`，并通过 `question_id`、`session_id` 和 `Question.knowledge_module_id` 保持可追溯关系。不得把 S4 写成 S3 的补充 API，也不得将概念对象描述为已存在的表或实现。

### 步骤 3：同步索引与任务清单

修改 `docs/00-文档索引-Index.md`：

- 在有效文档表中添加 S4 PRD 链接；
- 将 S4 状态改为“PRD 已创建，T04A 仍需独立计划和用户明确批准”；
- 更新 Phase 1 阅读/门禁说明与版本历史，不改变 S5/S6/S7 的触发状态。

修改 `docs/04-开发任务清单-Todo-List.md`：

- 仅勾选 T04 PRD 的两项文档工作；
- 登记 PRD 路径、文档治理和 diff 验证结果；
- 将下一门禁表述为 T04A 的独立 Schema/归档计划和明确批准；
- 校正 T04 小节中“文档计划已批准”的过期门禁措辞，使其与本次实际完成记录一致；
- 不勾选 T04A、T04B、T05、T06 或任何实现子项。

### 步骤 4：文档审查与验证

执行以下检查：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
```

人工文档审查必须确认：索引链接和文件名一致；任务状态没有把未实施工作误写为完成；S3/S4 边界与总 PRD 一致；文档中没有真实资料、完整 UUID、Provider URL、密钥或绝对运行路径。

### 步骤 5：提交和后续集成

只暂存获批范围内的 `.plans/`、S4 PRD、`docs/00` 与 `docs/04`。提交信息使用：

```text
docs(s4): 创建错题改错子系统 PRD
```

按 `docs/12` 的快进合并流程 rebase 到最新 `origin/master`，合入后在 `master` 重跑第 4 步验证，再推送 `origin/master`。用户未给予合并授权或验证失败时停止并报告。

---

## 5. 明确不包含

在本计划阶段和获批后的 T04 PRD 文档阶段，均不执行以下事项：

- 不创建、修改或迁移 `mistakes`、`weak_points` 或任何其他数据库表；
- 不修改 `practice_answers`、`questions`、`practice_sessions`，不改变 S3 批改或 `practice_completed` 事件；
- 不实现错题归档、重复错误计数、错因分类、薄弱点归纳、重做、掌握状态、间隔复习或优先级回流；
- 不新增或修改后端 Service、API、shared 类型、Worker、Adapter、环境变量或测试；
- 不新增或修改前端页面、路由、API 封装、工作台“查漏补缺”入口或浏览器验收；
- 不创建或触碰 S5、S6、S7 的 PRD、代码、Schema、流程或 Provider smoke；
- 不调用真实外部 Provider，不使用真实学习资料、密钥、Provider URL 或正式运行数据。

T04A、T04B 和 T05 各自必须先有独立 `.plans/`、独立审查和用户明确批准。

---

## 6. 独立自审

### 门禁与文件范围

- 计划阶段只新增 `.plans/phase1-t04-s4-prd-plan.md`，没有创建 `docs/subsystems/05-S4-错题改错子系统PRD-ErrorFixer.md`。
- 获批后文件范围严格限于 S4 PRD、`docs/00`、`docs/04` 和本计划；没有业务代码、Schema 或测试文件。
- 文档索引确认 S4 的触发条件满足，但 `docs/12` 的批准门禁仍然有效。
- 已识别并隔离 `docs/04` 的过期“计划已批准”措辞；计划没有把这项不一致视为用户批准，也不会在批准前修改该正式文档。

### S3 / S4 边界

- S3 继续拥有练习生成、作答、规则批改、`practice_answers` 和 `practice_completed` 事件。
- S4 只把 `practice_answers.is_correct = false` 视为可追溯事实输入，不反写或重新判定 S3 结果。
- `Mistake` 和 `WeakPoint` 在本次仅是 PRD 概念，不能被写成现有的存储事实。

### 未来任务隔离

- T04A 才能讨论/实施归档和 Schema；T04B 才能讨论/实施错题前端；T05 才能讨论/实施回流规则。
- S5、S6、S7 的门禁、PRD 和实现完全不在本任务范围。

### 安全与验证

- PRD 只引用对象名称和抽象关系，不包含资料原文、答案、完整 UUID、密钥、Provider URL 或正式数据路径。
- 纯文档任务只要求 `scripts/check-docs-governance.ps1` 与 `git diff --check`；不应借机运行会写数据的服务、真实 Provider 或浏览器 smoke。
- 计划文本已扫描，不含未填充的占位符和与已知任务状态冲突的实施承诺。

---

## 7. 批准记录

截至 2026-07-16，本计划尚未获用户明确批准。下一步只能等待用户批准；批准前不得创建 S4 PRD 正文、修改索引/任务清单，或进行任何业务实现。

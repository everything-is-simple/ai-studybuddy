# Phase 1-T05：回流规则实施计划

**版本**：v0.1（待批准）
**日期**：2026-07-17
**任务分支**：`codex/phase1-t05-feedback-rules-plan`
**状态**：计划已创建并完成自审；等待用户明确批准。批准前不得实现 T05。

---

## 1. 目标与边界

T05 要把 S4 的错题、重做证据和薄弱点，回流到 S1/S2 的学习节奏和知识模块状态中，让学生在现有工作台、任务和模块状态里看到“需要复习 / 优先复习 / 已掌握后降频”的结果。

本计划推荐一个 **不新增 Schema 的第一版**：用现有 `knowledge_modules.learn_status`、`study_tasks`、`StudyRhythmService.toTaskDto()` 的派生 `priorityBucket`、`weak_points.status` 和 `study_events` 承载 T05。只有实现中证明现有字段无法表达规则时，才另行提出 migration；本计划不预设新表。

**本轮实现非目标**：

- 不删除、覆盖或压缩 `mistakes`、`mistake_evidence`、`practice_answers` 或重做历史；
- 不做 S5 模拟考、临考速背、冲刺计划或同类题/变题生成；
- 不做 S6 家长报告聚合，不向家长暴露题干、答案、错因正文或学生作答；
- 不做 AI 错因建议、AI 掌握判断、真实 Provider 调用或 Worker；
- 不改 S3 出题、限时、提交、规则批改语义；
- 不提前实现 T07 时间线筛选扩展，只写现有 `study_events` 摘要证据。

---

## 2. 当前可用事实

### 2.1 S4 可用数据

- `mistakes`
  - `status`: `pending_review | needs_review | mastered`
  - `error_count`
  - `course_instance_id`
  - `assessment_attempt_id`
  - `knowledge_module_id`
  - `question_id`
  - `latest_practice_answer_id`
  - `first_error_at` / `latest_error_at`
  - `error_cause_category` / `error_cause_note` / `error_cause_confirmed_at`
- `mistake_evidence`
  - `evidence_type`: `practice_error | redo_correct | redo_incorrect`
  - `source_practice_answer_id`
  - `course_instance_id`
  - `knowledge_module_id`
  - `question_id`
  - `occurred_at`
- `weak_points`
  - `status`: `active | mastered`
  - `evidence_count`
  - `first_detected_at` / `latest_detected_at`
- 已有行为
  - S3 普通练习提交后，错误作答归档为 `practice_error`；
  - S4 原题重做失败写 `redo_incorrect`，成功写 `redo_correct`；
  - 重做失败会保持或改回 `mistakes.status = needs_review`；
  - 标记掌握需要重做通过证据，或学生显式确认。

### 2.2 S1/S2/S3 可用结构

- S1
  - `course_instances`
  - `assessment_attempts`
  - `study_tasks`
    - `type`: `material_note | practice | error_review | exam_cram | custom`
    - `status`: `todo | doing | pending_quality_check | done | skipped`
    - `knowledge_module_id`
    - `assessment_attempt_id`
    - `deadline_at`
  - `StudyTaskDto.priorityBucket`
    - 当前是派生字段，不入库；
    - 现规则：逾期为 0，已确认考试相关任务为 1，有截止时间为 2，其余为 3。
  - `study_events`
    - 已有 `evidence_ref`、`source_confidence`、`quality_gate`；
    - 可写 S4/S2 摘要事件，但不能写题干、答案或错因正文。
- S2
  - `knowledge_modules`
    - `learn_status`: `not_started | learning | mastered`
    - `importance`
    - `difficulty`
    - `last_reviewed_at`
    - `source_evidence`
  - 现有 `PATCH /api/knowledge-modules/:id` 可改变学习状态，但 T05 服务应在事务内直接执行规则，避免前端拼接跨系统逻辑。
- S3
  - `practice_sessions`
  - `questions`
  - `practice_answers`
  - `session_kind`: `practice | mistake_redo`
  - T05 只读取练习/重做证据，不改变批改事实。

---

## 3. 推荐架构

新增后端服务 `FeedbackRulesService`，作为 S4 到 S1/S2 的规则层。S4 操作完成后在同一学期库事务内调用它；它不直接发起 AI、Worker 或外部请求。

建议文件：

- Create: `packages/backend/src/services/feedback-rules-service.ts`
  - 计算指定 `course_instance_id + knowledge_module_id` 的回流状态；
  - 创建/闭合 `error_review` 学习任务；
  - 更新 `knowledge_modules.learn_status`；
  - 更新 `weak_points.status`；
  - 写 `study_events` 摘要证据。
- Modify: `packages/backend/src/services/error-fixer-query-service.ts`
  - `confirmErrorCause()`、`updateStatus()` 成功后调用回流服务。
- Modify: `packages/backend/src/services/error-fixer-service.ts`
  - `archiveIncorrectPracticeAnswers()` 和 `recordRedoEvidence()` 成功写入证据后调用回流服务。
- Modify: `packages/backend/src/services/study-rhythm-service.ts`
  - 扩展 `toTaskDto()` 的派生优先级：关联 active weak point 或 needs_review mistake 的 `error_review` 任务优先级提升。
- Modify: `packages/shared/src/types.ts`
  - 原则上不新增类型；如测试证明需要公开新的事件或 DTO 字段，再在计划批准后小步补充。
- Tests:
  - `packages/backend/test/feedback-rules-service.test.mjs`
  - 必要时扩展 `packages/backend/test/error-fixer-t04b-api.test.mjs`
  - 必要时扩展 `packages/backend/test/study-rhythm-api.test.mjs`

不建议新增公开 T05 API。前端应通过既有任务列表、知识模块列表、错题/薄弱点页面看到回流后的结果；T05 不是一个新页面。

---

## 4. 回流规则

### 4.1 需要复习：知识模块状态

把“需要复习”映射到现有 `knowledge_modules.learn_status = 'learning'`，不新增枚举。

触发条件：

- `mistakes.status = 'needs_review'`；
- 或 `weak_points.status = 'active'`；
- 或最新证据为 `redo_incorrect`；
- 或已 `mastered` 的错题再次出现 `practice_error`，S4 已将其重新打开为 `needs_review`。

动作：

- 如果模块当前是 `not_started` 或 `mastered`，改为 `learning`；
- 写一条 `study_events`：
  - `source_system = 'S4'`
  - `event_type = 'feedback_review_required'`
  - `title = '知识模块需要复习'`
  - `evidence_ref = 'km:<knowledge_module_id>'`
  - `quality_gate = 'passed'`
  - `parent_visible = 1`
- 不写题干、答案、错因备注或完整 UUID。

只保留证据、不改变模块的情况：

- 新错题仍是 `pending_review`，且没有 active weak point，也没有学生确认错因或重做失败；
- 只有单条 `practice_error`，证据不足以形成薄弱点；
- 错误来自归档/迁移回放且没有新的用户动作。

### 4.2 提升任务优先级

不把 `priorityBucket` 入库；继续作为 S1 DTO 派生值。

任务创建规则：

- 当模块进入需要复习态时，查找同课程、同模块、类型为 `error_review`、状态为 `todo | doing | pending_quality_check` 的现有任务；
- 若存在，则不重复创建，只更新 `deadline_at` 为更紧迫但不早于当前时间的值；
- 若不存在，则创建一条 `study_tasks`：
  - `type = 'error_review'`
  - `title = '复习薄弱点：<知识模块标题>'`
  - `knowledge_module_id = <module id>`
  - `assessment_attempt_id = latest mistake assessment_attempt_id`，若为空则保持 `NULL`
  - `estimated_minutes = 20`
  - `deadline_at`
    - active weak point 或 `redo_incorrect`：24 小时内；
    - 普通 `needs_review`：72 小时内。

派生优先级规则：

- 逾期仍是 `priorityBucket = 0`；
- `error_review` 任务若关联 active weak point 或 `needs_review` mistake，则最高提升到 `1`；
- 若只是有截止时间但没有 active weak point / needs_review mistake，则保持现有 `2`；
- 其他任务不因同模块薄弱点被改写，除非它本身关联同一 `knowledge_module_id` 且类型为 `error_review`。

只保留证据、不改变任务的情况：

- `pending_review` 错题还未确认错因或重做；
- 单次错误没有 active weak point；
- 该模块已有进行中的 `error_review` 任务，且截止时间已比新规则更紧迫；
- 相关课程或模块不存在，事务应失败而不是创建孤立任务。

### 4.3 已掌握后降低复习频率

触发条件：

- `mistakes.status` 从 `needs_review` 改为 `mastered`；
- 并且同一 `course_instance_id + knowledge_module_id` 下不存在 `pending_review` 或 `needs_review` 的错题；
- 并且最近证据包含 `redo_correct`，或学生使用显式确认掌握。

动作：

- 若存在 `weak_points`，将其 `status` 更新为 `mastered`，保留 `evidence_count`、检测时间和所有证据；
- 将对应 `knowledge_modules.learn_status` 更新为 `mastered`；
- 将未完成的同模块 `error_review` 任务置为 `done`，`completed_at` 使用当前时间；
- 写一条 `study_events`：
  - `source_system = 'S4'`
  - `event_type = 'feedback_review_mastered'`
  - `title = '错题复习已掌握'`
  - `evidence_ref = 'km:<knowledge_module_id>'`
  - `quality_gate = 'passed'`
  - `parent_visible = 1`

降低频率不是删除任务历史，也不是删除错题。后续再次答错时，S4 的既有逻辑会重新打开错题；T05 再把模块改回 `learning` 并创建/提升新的复习任务。

### 4.4 weak_points 证据数变化

- `practice_error` 与 `redo_incorrect` 计入薄弱证据；
- `redo_correct` 是掌握证据，不减少 `evidence_count`；
- `weak_points.evidence_count` 记录历史错误/失败证据数，不因掌握而清零；
- `weak_points.status = mastered` 表示当前无需优先复习，不表示历史薄弱点消失；
- 新的 `practice_error` 或 `redo_incorrect` 会把 `weak_points.status` 改回 `active`。

---

## 5. 幂等性、事务与边界

- 所有 T05 回流都在调用方的学期库事务内完成；
- `FeedbackRulesService.applyForModule(db, { courseInstanceId, knowledgeModuleId, reason, occurredAt })` 可重复调用；
- 同一模块同一状态重复回流时，不重复创建 open `error_review` 任务；
- `StudyEvent` 可按状态变化写入，不因重复调用刷屏；
- 所有查询限定在同一学期库、同一 `course_instance_id` 和同一 `knowledge_module_id`；
- 不跨学期写任务、不复制历史错题到新学期；
- 对重修或跨学期复用，仅保留为后续显式功能，本计划不做；
- 日志和事件不记录题干、正确答案、学生答案、错因备注、资料正文、Provider URL、密钥或完整外部标识。

---

## 6. 实施步骤（批准后）

1. 从最新 `master` 创建实现分支：`codex/phase1-t05-feedback-rules`
2. 写 `feedback-rules-service.test.mjs` 的 RED 测试：
   - pending_review 单错题只保留证据，不改模块/任务；
   - 错因确认后模块变 `learning`，创建 `error_review` 任务；
   - active weak point 提升 `error_review` 任务 `priorityBucket`；
   - redo_incorrect 保持/打开复习并激活 weak point；
   - redo_correct + 无其他未掌握错题后模块变 `mastered`，open 复习任务完成；
   - mastered 后再次 practice_error 重新进入 `learning` 且任务重新出现；
   - 重复调用不重复创建 open 任务或重复状态事件。
3. 实现 `FeedbackRulesService`。
4. 将服务挂入 S4 归档、重做证据、错因确认、状态更新路径。
5. 扩展 `StudyRhythmService.toTaskDto()` 派生优先级。
6. 跑专项测试，修正事务/幂等问题。
7. 运行后端与共享类型检查；如没有新增前端类型或 UI，不新增前端页面。
8. 更新 `docs/04`：实现合入 `master` 后才勾选 T05 子项并登记验证证据。

---

## 7. 测试计划

后端测试优先，使用真实 SQLite，不 mock DB。

- `packages/backend/test/feedback-rules-service.test.mjs`
  - 覆盖规则服务、幂等、事务内多表状态；
  - 使用隔离 `APP_DATA_ROOT`；
  - 不访问真实 Provider。
- `packages/backend/test/error-fixer-t04b-api.test.mjs`
  - 增补 S4 API 操作后的回流断言；
  - 确认重做失败不新建错题但会回流复习；
  - 确认重做通过后掌握降频。
- `packages/backend/test/study-rhythm-api.test.mjs`
  - 增补 `priorityBucket` 派生规则；
  - 确认逾期仍优先于回流提升。
- `pnpm test`
  - 全量回归，确保 S3/S4/S1 既有行为不被破坏。

前端测试：

- 如果只复用既有任务/模块/错题页面，不新增前端测试；
- 如果 shared DTO 或页面展示文案发生变化，补充对应前端组件测试；
- Playwright e2e 暂不作为必需项，因为 T05 第一版不新增页面或跨端新流程。若实现时改变工作台可见闭环，必须增加隔离 `APP_DATA_ROOT` 的 e2e，覆盖“做错题 → 确认/重做 → 工作台任务优先级变化”。

---

## 8. 验证命令

计划批准并实现后至少运行：

```powershell
pnpm type-check
pnpm -r --filter backend run build
pnpm -r --filter @ai-studybuddy/frontend run build
pnpm test
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
```

若实现中新增或修改前端闭环：

```powershell
$env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t05-feedback-rules-e2e'
pnpm test:e2e
```

---

## 9. 交付说明要求

T05 实现交付时必须写清：

- 当前分支；
- 任务分支名；
- 提交哈希；
- 是否已推任务分支；
- 是否已合入 `master`；
- 是否已推送 `origin/master`；
- `docs/04` 更新位置；
- 验证命令与结果；
- 明确未实现：AI 错因建议、同类题/变题、S5/S6/S7、Worker、真实 Provider、跨学期复用。

---

## 10. 独立自审

| 检查点                         | 结论                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------- |
| 是否只是 T05 计划，不是实现    | 通过。本文件只描述批准后实施范围，本轮不改业务代码。                         |
| 是否没有改 Schema              | 通过。推荐第一版不新增 migration；如实现中发现不足，必须另行说明并等待批准。 |
| 是否没有触碰 S5/S6/S7          | 通过。全部列为非目标。                                                       |
| 是否没有恢复仓库外 dirty patch | 通过。未读取或恢复仓库外备份 patch。                                         |
| 是否符合 S1/S4 边界            | 通过。S4 保留错题事实和证据；S1/S2 只接收状态、任务和摘要事件。              |
| 是否保留历史证据               | 通过。所有规则都不删除错题、证据、练习或重做历史。                           |
| 是否明确 T05 实现门禁          | 通过。用户明确批准前不得实现。                                               |

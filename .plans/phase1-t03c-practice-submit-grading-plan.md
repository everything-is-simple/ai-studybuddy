# Phase 1-T03C：S3 限时作答与规则批改实施计划

> **For agentic workers:** 如环境提供 `superpowers:test-driven-development` 与 `superpowers:executing-plans`，实施阶段按其步骤逐项执行。未经用户明确批准，不得修改业务代码、Schema、测试、shared 类型或任务完成状态。

**状态**：待用户批准；当前仅完成只读核查、计划编写与自审

**日期**：2026-07-16

**任务归属**：Phase 1-T03C / S3 PracticeRunner；只实现练习提交、客观题规则批改、答题记录、session 汇总与 `practice_completed` StudyEvent。

**Goal:** 在 T03A/T03B 已验收的 S3 Schema 与练习生成 API 基础上，实现 `POST /api/practice-sessions/:id/submit`，学生提交答案后由确定性规则批改客观题，写入 `practice_answers`，更新 `practice_sessions` 的得分、正确率、超时和总用时，并写入一条摘要化的 S3 StudyEvent。

**重要前置核查:** 本地 checkout 当前未找到用户指定的 `.plans/phase1-t03b-practice-generation-api-plan.md`，且 `packages/backend/src` 尚无 practice API/service 文件；但本轮用户给定事实为“Phase 1-T03B 已完成并验证”。实施 T03C 前必须先确认 T03A/T03B 代码与测试已经同步到当前工作区；若仍缺失，不得在 T03C 中补做 T03B 生成 API，应先停下请求同步或批准新的前置修复。

**Tech Stack:** TypeScript 5、Express、better-sqlite3、SQLite transaction、Node.js test runner、pnpm workspace、`@ai-studybuddy/shared` API 信封。

---

## 1. 已确认边界

### 允许范围

- `POST /api/practice-sessions/:id/submit`
- 单选、多选、填空的客观题规则批改
- 写入 `practice_answers`
- 计算并写入 `practice_sessions.total_score`、`correct_rate`、`overtime`、`total_duration_seconds`
- 写入 `practice_completed` StudyEvent
- 后端集成测试

### 明确不做

- 前端练习页面、前端 API 封装、倒计时 UI 或结果页
- 错题归档、`mistakes`、`weak_points`、薄弱点归纳或复习排程
- S4 PRD、S4 Schema 或任何 S5-S7 内容
- 真实外部 Provider smoke、AI 批改、Worker 或异步 Job
- 主观题、部分得分、错因分析、练习推荐或模拟考

---

## 2. 文件范围

### 获批后预计修改

- `packages/backend/src/api/practice-runner.ts`：在 T03B 已有路由上增加 `POST /practice-sessions/:id/submit`。
- `packages/backend/src/services/practice-runner-service.ts`：增加提交事务、批改调用、答案写入、session 汇总与 StudyEvent 写入。
- `packages/shared/src/types.ts`：如 T03B 尚未提供 submit DTO，则补充 `PracticeSubmitRequestDto`、`PracticeSubmitResultDto` 等跨端类型；不得加入 S4 字段。
- `packages/backend/test/practice-submit-api.test.mjs`：新增 T03C 后端集成测试，不 mock DB。
- `.plans/phase1-t03c-practice-submit-grading-plan.md`：获批后登记批准状态；完成后登记验证结果。
- `docs/04-开发任务清单-Todo-List.md`：仅在实现与验证通过后，把 T03C 勾选并登记证据。
- `docs/00-文档索引-Index.md`：仅在 T03C 完成后校准下一门禁到 T03D；不创建新编号文档。

### 可能新增

- `packages/backend/src/services/practice-grading.ts`：若 T03B service 已较大，将纯规则批改抽成无副作用函数，便于单元级覆盖；仍由 API 集成测试证明数据库写入。

### 明确不修改

- `packages/backend/src/db/sql/schema-semester.ts` 和已发布 migrations。
- `packages/backend/src/services/material-job-worker.ts`、AI Provider Router、S1/S2 Worker。
- `packages/frontend/**`。
- S4-S7 PRD、Schema 或代码。

---

## 3. API 契约

### Request

`POST /api/practice-sessions/:id/submit`

```json
{
  "semesterId": "uuid",
  "answers": [
    { "questionId": "uuid", "answer": "A", "timeSpentSeconds": 25 },
    { "questionId": "uuid", "answer": "B,D", "timeSpentSeconds": 40 },
    { "questionId": "uuid", "answer": "线性空间", "timeSpentSeconds": 15 }
  ],
  "totalDurationSeconds": 320
}
```

### Response

```json
{
  "success": true,
  "data": {
    "sessionId": "uuid",
    "status": "graded",
    "totalScore": 7,
    "questionCount": 10,
    "correctRate": 0.7,
    "overtime": false,
    "totalDurationSeconds": 320,
    "answers": [
      {
        "questionId": "uuid",
        "studentAnswer": "A",
        "correctAnswer": "A",
        "isCorrect": true,
        "explanation": "..."
      }
    ]
  }
}
```

### 错误码

- `PRACTICE_SUBMIT_INPUT_INVALID`：请求体缺字段、`semesterId` 非 UUID、`answers` 非数组、重复 `questionId`、`timeSpentSeconds` 或 `totalDurationSeconds` 非非负整数。
- `PRACTICE_SESSION_NOT_FOUND`：指定 session 不存在于该学期库。
- `PRACTICE_SESSION_STATE_INVALID`：session 不是 `in_progress`，不得重复提交或改写结果。
- `PRACTICE_QUESTION_MISMATCH`：答案引用了不属于该 session 的题目。
- `PRACTICE_ANSWER_INVALID`：题型对应的答案格式不合法。

所有错误走 `{ success: false, error: { code, message } }` 信封，不输出堆栈、答案全文集合或完整隐私上下文。

---

## 4. 业务规则

### 4.1 提交状态机

- 仅允许 `in_progress` session 提交。
- 提交事务中即时完成规则批改，最终状态直接写为 `graded`；`submitted_at` 与 `graded_at` 可使用同一 UTC ISO 时间。
- 已 `graded` 或 `submitted` 的 session 返回 409，不做幂等覆盖，避免学生改答案。
- 提交时若某题未出现在 `answers` 中，按未作答处理：`student_answer = NULL`、`is_correct = false`，仍写入一条 `practice_answers`。
- 若请求包含未知题目、重复题目或跨 session 题目，整次提交失败并回滚。

### 4.2 批改规则

- 单选题：将学生答案和标准答案规范为选项标签后精确匹配；标签使用 `trim()` + 大写，合法标签来自题目选项。
- 多选题：将逗号分隔答案规范为唯一、排序后的标签集合，与标准答案集合完全相等才正确；少选、多选、错选均错误。
- 填空题：候选正确答案为 `correct_answer` 加 `acceptable_answers_json`；任一候选经归一化后相等即正确。
- 填空归一化：`trim()` → `String.prototype.normalize('NFKC')` → 统一小写 → 连续空白折叠为单个空格。
- 空字符串答案视为未作答；选择题空答案为错误，填空空答案为错误。
- 每题 1 分，不做部分得分；`total_score = 正确题数`。
- `correct_rate = total_score / question_count`，响应和数据库均保存为 0 到 1 的数字；测试使用精确值或容忍浮点误差。

### 4.3 用时与超时

- `totalDurationSeconds` 必须为非负整数，作为 session 总用时写入。
- `timeSpentSeconds` 可选；存在时必须为非负整数，逐题写入。
- `time_limit_seconds IS NULL` 时 `overtime = false`。
- 有限时时，`totalDurationSeconds > time_limit_seconds` 才标记 `overtime = true`；等于限时不算超时。
- 超时不阻止提交。

### 4.4 StudyEvent

提交成功后在同一 transaction 写入一条：

- `source_system = 'S3'`
- `event_type = 'practice_completed'`
- `title = '完成限时练习'` 或包含得分摘要的短标题
- `course_instance_id = practice_sessions.course_instance_id`
- `evidence_ref = 'practice_session:<sessionId>'`
- `workload_minutes = ceil(totalDurationSeconds / 60)`
- `parent_visible = 1`
- `occurred_at = submitted_at`

事件只存摘要和证据引用，不存逐题答案、正确答案、题干、解析或资料正文。

---

## 5. 实施步骤

- [ ] **Step 1：实施前同步核查**

  运行：

  ```powershell
  git status --short --branch
  rg -n "practice-sessions|PracticeRunner|practice_sessions" packages/backend packages/shared .plans docs
  ```

  确认 T03A/T03B 已存在并通过验证：`practice_sessions`、`questions`、`practice_answers` Schema 已落地，创建练习与获取练习详情 API 已存在。若缺失，停止 T03C。

- [ ] **Step 2：补 submit DTO 与错误边界**

  在 shared 中复用 T03A/T03B 已有枚举与 DTO；只补 submit request/result 所需字段。所有类型采用 camelCase，不暴露数据库 snake_case。

- [ ] **Step 3：先写集成测试 RED**

  创建 `packages/backend/test/practice-submit-api.test.mjs`。测试使用隔离 `APP_DATA_ROOT` 和真实 SQLite，直接 seed 课程、考试、知识模块、practice session 与 questions，避免真实 AI 和 T03B 生成不稳定性。

- [ ] **Step 4：实现纯规则批改函数**

  若抽文件，`practice-grading.ts` 只接收题目记录与学生答案，返回 `{ studentAnswer, isCorrect }`，不得打开数据库、写日志或访问 Provider。

- [ ] **Step 5：实现 Service 事务**

  事务内完成：读取 session → 校验状态 → 读取题目并排序 → 校验答案集合 → 批改 → 插入全部 `practice_answers` → 更新 `practice_sessions` → 插入 StudyEvent → 返回结果 DTO。任一步失败整体回滚。

- [ ] **Step 6：挂载 API 路由**

  在 T03B 已有 practice router 中增加 `POST /practice-sessions/:id/submit`，并确认 `server.ts` 已挂载该 router。若 T03B 未挂载，不在 T03C 中顺手补做生成端点，只处理 submit 所需挂载。

- [ ] **Step 7：错误处理与隐私审查**

  错误响应只包含稳定 code/message；日志不得包含答案数组、正确答案列表、题干、资料正文、完整 UUID 批量列表或 Provider 配置。

- [ ] **Step 8：文档与任务清单收尾**

  全部验证通过后，必须先用 `rg -n "T03C|批改|practice_completed" docs/04-开发任务清单-Todo-List.md` 定位 T03C 条目，再更新 `docs/04` 中 T03C 勾选项和收尾证据；必要时更新 `docs/00` 的下一门禁为 T03D。交付说明必须明确写出 `docs/04` 已更新。不得创建 S4 PRD。

---

## 6. 测试计划

### 专项集成测试

`packages/backend/test/practice-submit-api.test.mjs` 至少覆盖：

- [ ] 单选正确、单选错误。
- [ ] 多选顺序不同但集合相同为正确；少选、多选、错选为错误。
- [ ] 填空命中 `correct_answer`；命中 `acceptable_answers_json`；大小写、全半角和空白归一化生效。
- [ ] 缺答题目写入 `student_answer = NULL` 且 `is_correct = false`。
- [ ] 成功提交写入每题 `practice_answers`，更新 `total_score`、`correct_rate`、`overtime`、`total_duration_seconds`、`submitted_at`、`graded_at`。
- [ ] 成功提交写入一条 `practice_completed` StudyEvent，事件只含摘要字段和 `practice_session:<id>` 证据引用。
- [ ] 有限时且总用时大于限制时 `overtime = true`；等于限制时为 false；不限时始终 false。
- [ ] 重复提交返回 409，既有答案和 session 汇总不被覆盖。
- [ ] 未知题目、重复题目、跨 session 题目、非法答案格式、非法用时均返回 4xx 且无部分写入。
- [ ] 跨学期查询不到 session，不串库。
- [ ] 不创建或写入 `mistakes`、`weak_points`。

### 验证命令

实施后按顺序运行：

```powershell
pnpm type-check
pnpm -r --filter @ai-studybuddy/backend run build
pnpm --dir packages/backend exec node --test --test-concurrency=1 test/practice-submit-api.test.mjs
pnpm test
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
```

如 T03B 已有 practice 相关测试，也同步运行对应专项测试，确保 submit 不破坏生成与详情 API。

---

## 7. 自审

### 7.1 门禁与范围

- 已确认 S3 PRD 存在，T03C 是 S3 MVP 内的后端实现子任务。
- 本计划不创建新设计文档，不创建 S4 PRD，不引入 `mistakes` / `weak_points`。
- 最大风险是本地 checkout 与“T03B 已完成”事实不一致；计划已加入实施前同步核查和缺失即停止的门禁。

### 7.2 数据一致性

- 提交、批改、答案写入、session 汇总和 StudyEvent 写入必须在同一 SQLite transaction 内完成。
- 对未知/重复/跨 session 题目的请求必须在写入前拒绝，避免半成品答案。
- 重复提交拒绝覆盖，保护练习历史稳定性。

### 7.3 批改规则

- 单选、多选、填空规则均来自 S3 PRD，不使用 AI 或外部 Provider。
- 填空归一化使用 NFKC 覆盖全半角差异；仍保持确定性，不做语义相似度。
- 多选全对才得分，不做部分分，符合 MVP 范围。

### 7.4 隐私与报告边界

- StudyEvent 只写摘要和 `practice_session:<id>` 证据引用，不保存逐题答案或正确答案。
- API 成功响应会返回本次批改结果给学生；日志和事件不得复制完整答案集合。
- S6 未来只能读取脱敏聚合，本任务不提供家长查看题目/答案能力。

### 7.5 验证充分性

- 后端集成测试覆盖规则批改、事务回滚、状态机、跨学期隔离和事件写入。
- 不需要浏览器验收，因为 T03C 明确不含前端；后续 T03D 再做页面与浏览器 smoke。
- 标准验证包含 type-check、后端 build、专项测试、全量测试、文档治理和 diff 检查。

**自审结论**：计划可执行，但依赖 T03A/T03B 已同步到当前工作区。未获用户明确批准前，本计划不得进入代码实现。

---

## 8. 下一个 AI 接手 Prompt

把以下内容原样交给下一个接手 T03C 实施的 AI：

```text
你现在接手 AI StudyBuddy 主系统仓库。

沟通语言：中文。
主仓库：I:\ai-studybuddy。
当前任务：在用户明确批准后，按 `.plans/phase1-t03c-practice-submit-grading-plan.md` 实施 Phase 1-T03C “S3 限时作答与规则批改”。

开始前必须先运行：

git status --short --branch

然后按仓库规则读取：

1. AGENTS.md
2. docs/00-文档索引-Index.md
3. docs/04-开发任务清单-Todo-List.md
4. docs/subsystems/03-S3-限时练习子系统PRD-PracticeRunner.md
5. docs/08-共同底座架构-Architecture.md
6. docs/10-后端开发规范-Backend-Guidelines.md
7. docs/11-前端开发规范-Frontend-Guidelines.md
8. docs/12-开发规范-Dev-Rules.md
9. .plans/phase1-t03c-practice-submit-grading-plan.md

实施前硬门禁：

- 确认 T03A/T03B 代码已同步到当前工作区，且 `practice_sessions`、`questions`、`practice_answers`、练习生成 API 和练习详情 API 已存在；若缺失，停止并向用户说明，不得在 T03C 中补做 T03B。
- S4 仍未触发，不得创建 S4 PRD、Schema 或业务代码。
- 不得实现前端练习页面、错题归档、`mistakes`、`weak_points`、S5-S7、真实 Provider smoke 或 Worker。

T03C 允许实现：

- `POST /api/practice-sessions/:id/submit`
- 客观题规则批改
- 写入 `practice_answers`
- 计算 `practice_sessions.total_score`、`correct_rate`、`overtime`、`total_duration_seconds`
- 写入 `practice_completed` StudyEvent
- 后端集成测试

必须使用隔离测试数据，不 mock DB，不访问真实外部 Provider。

完成前必须运行计划中的验证命令，并且必须更新 `docs/04-开发任务清单-Todo-List.md`：用 `rg -n "T03C|批改|practice_completed" docs/04-开发任务清单-Todo-List.md` 定位对应条目，勾选已完成项，登记日期、改动范围、验证命令和未实现边界。未更新 docs/04，不得声称任务完成。
```

# Phase 1-T03B：S3 练习生成 API 实施计划

**版本**：v0.1
**日期**：2026-07-16
**状态**：已获用户批准并完成实施验证
**分支建议**：`codex/phase1-t03b-practice-generation-api-plan` 用于计划；实施获批后可继续使用独立实现分支或另开 worktree

---

## 1. 任务目标

在 T03A 已完成的 S3 数据库基线之上，实现 PracticeRunner 的第一段后端闭环：

1. 根据已存在的 `knowledge_modules` 生成 5-20 道客观题。
2. AI 成功后，在同一学期库事务中写入 `practice_sessions` 与 `questions`。
3. 提供 `POST /api/practice-sessions` 创建练习。
4. 提供 `GET /api/practice-sessions/:id` 获取作答前练习详情。
5. 返回给学生的题目不得包含正确答案、可接受答案或解析。

本任务只让学生“拿到一套可作答的题目”。提交、批改、结果页、错题归档和前端入口全部留给 T03C/T03D/S4。

---

## 2. 已读依据与当前事实

本计划基于以下文件与当前 Git 状态：

- `AGENTS.md`
- `docs/00-文档索引-Index.md` v2.8：T03A 已完成，下一门禁为 T03B。
- `docs/04-开发任务清单-Todo-List.md` v1.15：T03B 范围为练习生成 API，不含批改。
- `docs/subsystems/03-S3-限时练习子系统PRD-PracticeRunner.md` v0.03。
- `docs/08-共同底座架构-Architecture.md`
- `docs/10-后端开发规范-Backend-Guidelines.md`
- `docs/11-前端开发规范-Frontend-Guidelines.md`
- `docs/12-开发规范-Dev-Rules.md`
- T03A commit `2d042e07a045b997b184099c2a840149383dffcf`

当前代码事实：

- `practice_sessions`、`questions`、`practice_answers` 已由学期库 migration v4 创建。
- `packages/shared/src/types.ts` 已有 S3 存储/领域记录类型，但明确不是公开 API DTO。
- 后端现有模式为 `api/*` 负责 HTTP 信封，`services/*` 负责业务与 SQL。
- API 测试可启动 `dist/server.js` 并使用隔离 `APP_DATA_ROOT`。
- `AiProviderRouter` 已支持 `taskType: 'question_generation'`，并已有熔断与脱敏日志。

---

## 3. 范围

### 3.1 本次包含

#### Shared 类型

修改 `packages/shared/src/types.ts`，新增公开 API DTO：

- `CreatePracticeSessionRequest`
- `PracticeQuestionForStudentDto`
- `PracticeSessionDetailDto`
- `PracticeSessionSummaryDto`（如实现返回中需要）
- `CreatePracticeSessionResponse`

DTO 规则：

- 作答前题目只包含 `id`、`type`、`stem`、`options`、`difficulty`、`knowledgeModuleId`、`questionOrder`。
- 不包含 `correctAnswer`、`acceptableAnswers`、`explanation`、`sourceEvidence`、`aiModel`。
- `timeLimitSeconds` 对外使用 `number | undefined` 或 `null` 时要与现有 API 风格保持一致；服务内部写入 SQLite 时为 `NULL`。

#### 后端 Service

新增 `packages/backend/src/services/practice-runner-service.ts`：

- `PracticeRunnerError`：稳定错误码、HTTP status、中文消息。
- `PracticeRunnerService`：
  - 打开 ready 学期库，沿用现有 `APP_DATA_ROOT`、全局索引和学期库路径规则。
  - 校验 `semesterId`、`courseInstanceId`、可选 `assessmentAttemptId`。
  - 校验 `assessmentAttemptId` 属于同一课程；暂不强制 confirmed，但计划测试覆盖 pending/confirmed 均能创建，以免 T03B 改动 T11 的确认语义。
  - 校验 `knowledgeModuleIds` 为 1-10 个去重 UUID，且全部属于 `courseInstanceId`。
  - 校验 `questionCount` 为 5-20，默认 10。
  - 校验 `difficultyPreference` 为 `easy | medium | hard | mixed`，默认 `mixed`。
  - 校验 `timeLimitSeconds` 为正整数或空值；空值表示不限时。
  - 用知识模块的 `title`、`content_summary`、`importance`、`difficulty`、`exam_relevance`、`source_evidence` 构造最小 prompt，不读取资料原文、笔记全文或文件内容。
  - 通过 `AiProviderRouter` 生成结构化题目 JSON。
  - 严格解析 AI 输出：可剥离 Markdown code fence 和首尾说明，但错误消息不得回显 AI 原文。
  - 校验每道题：
    - `type` 只能是 `single_choice | multiple_choice | fill_blank`。
    - 题干非空且不超过 2000 字符。
    - 单选题恰好 4 个选项，正确答案为 A-D 中一个。
    - 多选题 4-5 个选项，正确答案为 2-4 个不重复字母并按字母排序存储。
    - 填空题无选项，正确答案非空，可接受答案数组可选。
    - `knowledge_module_id` 必须属于本次请求选择的模块集合。
    - `difficulty` 只能是 `easy | medium | hard`。
  - AI 返回题数必须等于请求题数；不自动截断或补题。
  - AI 失败或解析失败时，不创建 session，也不写入 questions。
  - AI 成功后用一个 SQLite transaction 插入 `practice_sessions` 与 `questions`。
  - `practice_sessions.status` 初始为 `in_progress`。
  - `questions.question_order` 由服务端按返回顺序生成 1-based 顺序，不信任 AI 自带顺序。
  - `GET` 详情只返回作答前 DTO，并按 `question_order` 排序。

构造函数需要支持测试注入：

- `ai?: AiProvider`
- `now?: () => string`
- `id?: () => string`
- `retryDelayMs?: number`

AI 重试策略：

- 符合 PRD：失败后重试 1 次。
- 测试中 `retryDelayMs` 注入为 0，避免测试慢。
- 不新增环境变量，不访问真实 Provider。

关于 35s/45s 超时：

- 当前 `AiProviderRouter` 的超时来自统一 `AI_TIMEOUT_MS`/Provider 构造，未支持单请求 timeout。
- T03B 实施时优先不改 Provider Router 架构；若需要严格实现 35s/45s，应在实施前补充一个小设计修订，避免在业务 Service 中用不可取消的 `Promise.race` 假装超时。

#### 后端 API

新增 `packages/backend/src/api/practice-runner.ts`：

- `POST /api/practice-sessions`
  - 成功返回 HTTP 201 + `ApiSuccess<CreatePracticeSessionResponse>`。
  - AI 未配置返回 503，错误码沿用或映射为 `AI_NOT_CONFIGURED`。
  - AI 全失败或全冷却返回 502/503 中稳定语义；错误消息不含 Provider URL、Key、prompt 或模型输出。
  - 输入错误返回 400，缺失/跨学期/跨课程返回 404 或 409。
- `GET /api/practice-sessions/:id`
  - `semesterId` 从 query 读取。
  - 只查当前学期库。
  - 不返回答案、解析和 AI 生成元数据。

修改 `packages/backend/src/server.ts`：

- 挂载 `app.use('/api', practiceRunnerRouter)`。

#### 测试

新增 `packages/backend/test/practice-generation-api.test.mjs`：

- 启动 built backend，并用本地 mock OpenAI-compatible HTTP server 作为 `AI_PROVIDERS`，不访问真实外部 Provider。
- 成功路径：初始化学期、创建课程/考试、插入或通过服务形成知识模块，POST 创建练习，GET 读回详情。
- 验证 session 与 questions 入库，题目顺序稳定。
- 验证 GET 详情不含 `correctAnswer`、`acceptableAnswers`、`explanation`。
- 验证 AI 失败不写入空 session。
- 验证 AI 输出自由文本、错误 JSON、题数不符、跨模块 ID 均被拒绝且无部分写入。
- 验证跨课程/跨学期的 `assessmentAttemptId`、`knowledgeModuleIds` 被拒绝。

可补充 `packages/backend/test/practice-generation-service.test.mjs`：

- 使用 mock `AiProvider` 直接覆盖 parser、事务与 retry，不启动 HTTP server。
- 若 API 测试已经覆盖充分，可不新增第二个测试文件，避免重复。

---

## 4. 明确不包含

- 不实现 `POST /api/practice-sessions/:id/submit`。
- 不实现规则批改、得分、正确率、超时判定或 `practice_answers` 写入。
- 不写 `practice_completed` StudyEvent。
- 不创建错题、薄弱点、S4 PRD 或 S4 Schema。
- 不实现前端练习入口、作答页、结果页或历史列表。
- 不引入 Worker；题目生成保持同步 API。
- 不接入真实外部 Provider smoke。
- 不读取资料原文、笔记全文、上传文件或本机绝对路径。
- 不修改 S1/S2 既有业务语义。
- 不提前实现 `GET /api/practice-sessions` 列表；该历史列表留到 T03D 或单独计划。

---

## 5. API 契约草案

### POST `/api/practice-sessions`

Request：

```json
{
  "semesterId": "uuid",
  "courseInstanceId": "uuid",
  "assessmentAttemptId": "uuid",
  "knowledgeModuleIds": ["uuid"],
  "questionCount": 10,
  "difficultyPreference": "mixed",
  "timeLimitSeconds": null
}
```

Response：

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "courseInstanceId": "uuid",
    "assessmentAttemptId": "uuid",
    "status": "in_progress",
    "questionCount": 10,
    "timeLimitSeconds": null,
    "difficultyPreference": "mixed",
    "startedAt": "2026-07-16T00:00:00.000Z",
    "createdAt": "2026-07-16T00:00:00.000Z",
    "updatedAt": "2026-07-16T00:00:00.000Z",
    "questions": [
      {
        "id": "uuid",
        "type": "single_choice",
        "stem": "题干",
        "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
        "difficulty": "medium",
        "knowledgeModuleId": "uuid",
        "questionOrder": 1
      }
    ]
  }
}
```

### GET `/api/practice-sessions/:id?semesterId=uuid`

Response 与 POST 成功响应同形，但从数据库读取并按 `questionOrder` 排序。

---

## 6. 错误码草案

| 错误码                          | HTTP | 场景                                                |
| ------------------------------- | ---- | --------------------------------------------------- |
| `MISSING_REQUIRED_FIELD`        | 400  | 缺少 semesterId/courseInstanceId/knowledgeModuleIds |
| `PRACTICE_INPUT_INVALID`        | 400  | 题数、难度、限时或枚举值非法                        |
| `SEMESTER_NOT_FOUND`            | 404  | 学期不存在或不是 ready                              |
| `COURSE_INSTANCE_NOT_FOUND`     | 404  | 课程不存在或不属于学期                              |
| `ASSESSMENT_ATTEMPT_NOT_FOUND`  | 404  | 考试不存在或不属于课程                              |
| `KNOWLEDGE_MODULE_NOT_FOUND`    | 404  | 模块不存在、跨课程或数量不匹配                      |
| `AI_NOT_CONFIGURED`             | 503  | 未配置 AI                                           |
| `AI_ALL_PROVIDERS_FAILED`       | 502  | AI 调用失败且至少尝试过 Provider                    |
| `AI_ALL_PROVIDERS_COOLING_DOWN` | 503  | 全部 Provider 冷却                                  |
| `PRACTICE_GENERATION_FAILED`    | 502  | AI 输出无法解析或不符合题目 JSON                    |
| `PRACTICE_SESSION_NOT_FOUND`    | 404  | GET 目标 session 不存在                             |

---

## 7. 数据写入策略

1. 先只读校验学期、课程、考试和知识模块。
2. 构造脱敏 prompt。
3. 调 AI 并严格解析。
4. 解析成功后开启 SQLite transaction。
5. 插入 `practice_sessions`：
   - `status = 'in_progress'`
   - `question_count = parsed.questions.length`
   - `started_at = created_at = updated_at = now`
   - `submitted_at/graded_at/score/rate/duration = NULL`
6. 插入 `questions`：
   - `practice_session_id = session.id`
   - `course_instance_id = request.courseInstanceId`
   - `knowledge_module_id = parsed question module`
   - `question_order = index + 1`
   - `options_json` 只用于选择题
   - `acceptable_answers_json` 只用于填空题
   - `ai_model = response.model`
   - `prompt_version = 's3-practice-v1.0'`
7. 提交后用同一映射函数返回作答前 DTO。

不在 AI 调用前创建空 session。这样可以满足 PRD 的“AI 不可用时不创建练习”。

---

## 8. 验证计划

实施完成后至少运行：

```powershell
pnpm type-check
pnpm -r --filter backend run build
pnpm -r --filter @ai-studybuddy/frontend run build
pnpm -r --filter backend run test -- practice-generation-api.test.mjs
pnpm test
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
```

HTTP smoke：

1. 使用隔离目录 `I:\ai-studybuddy-tmp\runs\phase1-t03b-smoke-<timestamp>`。
2. 启动本地 mock OpenAI-compatible provider。
3. 启动 built backend。
4. 调 dev init semester、创建课程、准备知识模块。
5. `POST /api/practice-sessions` 成功创建练习。
6. `GET /api/practice-sessions/:id` 读回题目，确认无答案字段。

本任务没有前端页面，不要求浏览器验收；若后续 T03D 做页面，必须补浏览器 smoke。

---

## 9. 文档同步计划

实施完成后再更新：

- `docs/00-文档索引-Index.md`：登记 T03B 已完成，下一门禁调整为 T03C。
- `docs/04-开发任务清单-Todo-List.md`：勾选 T03B 子项，记录 API、Service、AI mock、验证结果和未实现范围。

计划创建阶段仅登记“计划已创建并待批准”，不把 T03B 标成完成。

---

## 10. 独立自审

### 10.1 门禁审查

- T03A 已完成并推送，但尚未合并 master；本计划基于 T03A 分支创建，避免在旧 master 上规划缺失 Schema 的实现。
- T03B 是下一门禁，创建计划符合 `docs/00` 与 `docs/04`。
- 本计划不触发 S4/S5/S6/S7 PRD。

### 10.2 范围审查

- `practice_answers`、批改、得分、StudyEvent 和错题事实均留给 T03C/S4。
- 前端入口和练习页面留给 T03D。
- 不创建 `GET /api/practice-sessions` 历史列表，避免 T03B 扩大成前端历史流。

### 10.3 数据一致性审查

- AI 失败前不写 session；解析成功后 session/questions 同事务写入，避免空练习。
- T03A trigger 会兜底校验 session/course/module/order，但 Service 仍要提前给出清晰业务错误。
- GET 详情从 DB 读回，不信任创建时内存对象。

### 10.4 隐私与日志审查

- Prompt 只使用知识模块摘要和证据，不读取资料原文或笔记全文。
- 错误消息不回放 AI 原文，避免模型输出泄露资料片段或密钥样式字符串。
- 测试只使用本地 mock Provider，不使用真实 API Key、真实 Provider URL 或真实资料。

### 10.5 API 安全审查

- 作答前 DTO 明确隐藏正确答案、可接受答案和解析。
- `GET /api/practice-sessions/:id` 必须校验 semesterId，并通过学期库隔离避免跨学期读取。
- assessment 与 module 的跨课程引用都要在服务层拒绝。

### 10.6 验证审查

- 需要同时覆盖 Service 级 parser/事务和 API 级信封/HTTP 语义。
- `pnpm test` 会先 build，可覆盖 dist 运行态；专项测试仍要在全量前单独跑，方便定位。
- 文档治理和 diff 检查必须在提交前通过。

---

## 11. 批准与完成记录

用户已于 2026-07-16 明确批准 Phase 1-T03B 实施；本计划已按 TDD 完成实现与验证。

完成范围：

- 新增 `PracticeRunnerService`，按知识模块调用 AI 生成 5-20 道客观题，并在同一事务写入 `practice_sessions` 与 `questions`。
- 新增 `POST /api/practice-sessions` 与 `GET /api/practice-sessions/:id`。
- 新增作答前公开 DTO，隐藏正确答案、可接受答案、解析、来源证据与 AI 元数据。
- 新增本地 mock OpenAI-compatible Provider API 测试，覆盖成功入库、答案隐藏、AI 失败不落空 session、坏 JSON 不部分写入、跨课程模块调用 AI 前拒绝。

验证通过：

- `pnpm type-check`
- `pnpm -r --filter backend run build`
- `pnpm -r --filter @ai-studybuddy/frontend run build`
- `node --test --test-concurrency=1 test/practice-generation-api.test.mjs`
- `APP_DATA_ROOT=I:\ai-studybuddy-tmp\runs\phase1-t03b-full-test pnpm test`（后端 131/131，前端 32/32）

未实现范围保持不变：提交作答、规则批改、`practice_answers` 写入、`practice_completed` StudyEvent、前端练习页面、错题归档与 S4-S7 PRD 均留给后续门禁。

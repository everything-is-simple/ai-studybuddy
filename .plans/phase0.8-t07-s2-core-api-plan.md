# Plan: Phase 0.8 T07 — S2 资料笔记核心 API 实现

**版本**：v0.05（契约收敛修订版）  
**日期**：2026-07-13  
**状态**：实现修复中，按 PRD 契约补齐 P1/P2 遗漏  

---

## 1. 目标

实现 S2 资料笔记子系统的核心 API，使学生能够：

1. 上传 PDF / 图片 / 文本 / DOCX / PPTX 五类本地资料；
2. 由 SQLite Job Worker 异步完成格式转换 → 纯文本；
3. 由 AI Provider Router 异步生成结构化笔记（Markdown）、重点（highlights）、思维导图（Markmap）和知识模块；
4. 查询资料列表/详情、笔记详情、知识模块列表，并更新知识模块学习状态；
5. 所有状态流转与失败恢复均符合 S2 PRD 定义的状态机。

---

## 1.1 PRD 门禁与唯一事实来源

- 正式 S2 PRD 是 `docs/subsystems/03-S2-资料笔记子系统PRD-NoteBuilder.md`，已在 `docs/00-文档索引-Index.md` 登记为有效文档；它是本任务的产品与设计事实来源。
- 本文件是基于该正式 PRD 生成的唯一 T07 实现行动计划，只描述 T07 的技术落地、文件变更、测试和治理步骤。
- 原 `.plans/phase0.8-t07-s2-prd.md` 仅用于“创建 S2 PRD”的前置门禁动作。该 PRD 已创建并登记，因此该临时计划的工作已被满足，不再保留为独立行动计划。
- S2 MVP 的产品边界：学生将单份课程资料转换为纯文本，再异步生成结构化 Markdown 笔记、重点、Markmap 数据和带来源证据的知识模块；不包含笔记编辑、多资料合并、练习/错题、课堂 ASR、家长查看笔记正文或云同步。
- 既有能力边界：格式转换依赖 PdfConverter、OcrConverter、TextConverter、DocxConverter、PptxConverter；AI 生成经 AiProviderRouter；前端 Markdown/KaTeX/Markmap 展示由 T08 实现。

---

## 2. 范围

本次任务包含：

- 学期库 schema migration v3，补齐 S2 PRD 要求的字段；
- 共享 DTO 类型扩展（`packages/shared/src/types.ts`）；
- `NoteBuilderService` 业务逻辑；
- `NoteBuilderApi` HTTP 路由（挂载到 `/api`）；
- `MaterialJobWorker` 异步处理转换和 AI 生成 Job；
- 集成测试 `packages/backend/test/note-builder-api.test.mjs`；
- 更新 `docs/04-开发任务清单-Todo-List.md` 中 T07 状态。

---

## 3. 非目标

- 不做前端页面（T08 负责）；
- 不做练习/错题表（S3/S4 触发后再做）；
- 不做笔记在线编辑；
- 不做多份资料合并成一份笔记；
- 不做课堂录音 ASR（S7）；
- 不做 AI Prompt 精调，先用基础版本，后续迭代；
- 不修改 `/api/dev` 下的开发验证路由，S2 业务路由走 `/api`；
- **不做 URL 导入**（涉及外部网络、超时与 HTML 去噪；本次只处理五类本地文件，URL 导入延后到 S2-v1.1）；
- **不做长文本分段**：T07 始终完整保存 `normalized_text`；当文本超过 8,000 字时，仅截取前 8,000 字作为单次 AI 输入并将 `truncated` 置为 `true`，不删除或覆盖其余原文。分段生成与跨段合并放后续迭代。

---

## 4. 依据文档

- [`docs/00-文档索引-Index.md`](file:///i:/ai-studybuddy/docs/00-文档索引-Index.md)
- [`docs/01-总PRD-产品需求-Product-Requirements.md`](file:///i:/ai-studybuddy/docs/01-总PRD-产品需求-Product-Requirements.md)
- [`docs/02-七子系统地图-Scenario-Systems.md`](file:///i:/ai-studybuddy/docs/02-七子系统地图-Scenario-Systems.md)
- [`docs/04-开发任务清单-Todo-List.md`](file:///i:/ai-studybuddy/docs/04-开发任务清单-Todo-List.md)
- [`docs/08-共同底座架构-Architecture.md`](file:///i:/ai-studybuddy/docs/08-共同底座架构-Architecture.md)
- [`docs/10-后端开发规范-Backend-Guidelines.md`](file:///i:/ai-studybuddy/docs/10-后端开发规范-Backend-Guidelines.md)
- [`docs/subsystems/03-S2-资料笔记子系统PRD-NoteBuilder.md`](file:///i:/ai-studybuddy/docs/subsystems/03-S2-资料笔记子系统PRD-NoteBuilder.md)

---

## 5. 当前状态与前置条件

- T01–T06 已完成，S1 API 已上线 `/api`；
- `StorageAdapter`、`dispatchConverter`、`AiProviderRouter` 已就位；
  - `AiProviderRouter` 位于 `packages/backend/src/adapters/ai/router.ts`，接口：`generate(request: AiRequest): Promise<AiResponse>`；
  - `AiRequest.taskType` 已包含 `note_generation`；
  - `AiResponse.content` 为字符串，Worker 需自行 JSON.parse；
- `schema-semester.ts` 已包含 `materials`、`normalized_texts`、`structured_notes`、`mind_maps`、`knowledge_modules` 基础表，但字段未对齐 S2 PRD v0.02；
- `multer` 已在依赖中；
- 测试采用 `node --test`，模式为 spawn 后端进程 + HTTP 调用。

---

## 6. 文件变更清单

| 操作 | 文件 |
|---|---|
| 新建 | `packages/backend/src/db/sql/migration-semester-v3.ts` |
| 修改 | `packages/backend/src/db/migrations.ts` |
| 修改 | `packages/shared/src/types.ts` |
| 新建 | `packages/backend/src/services/note-builder-service.ts` |
| 新建 | `packages/backend/src/services/material-job-worker.ts` |
| 新建 | `packages/backend/src/api/note-builder.ts` |
| 修改 | `packages/backend/src/server.ts` |
| 新建 | `packages/backend/test/note-builder-api.test.mjs` |
| 修改 | `docs/04-开发任务清单-Todo-List.md` |

---

## 7. 数据模型变更（migration v3）

### 7.1 materials 表补充字段

```sql
ALTER TABLE materials ADD COLUMN original_filename TEXT;
ALTER TABLE materials ADD COLUMN title TEXT;
ALTER TABLE materials ADD COLUMN file_size_bytes INTEGER;
ALTER TABLE materials ADD COLUMN conversion_error_message TEXT;
ALTER TABLE materials ADD COLUMN ai_generation_error_message TEXT;
ALTER TABLE materials ADD COLUMN truncated INTEGER NOT NULL DEFAULT 0;
```

数据库约束与重试事实来源：
- `materials`、`normalized_texts` 是 v1 已发布表，v3 不重建表；`migration-semester-v3.ts` 为 `materials` 新增 INSERT/UPDATE 触发器，拒绝非法 `status`、非正 `file_size_bytes` 和含 `..`、`:\`、`:/` 的 `storage_key`；为 `normalized_texts` 新增触发器，拒绝空文本和超过 1,048,576 字符的 `text`。
- `status` 枚举：`pending | converting | converted | note_generating | completed | conversion_failed | pending_quality_check`。
- `storage_key` 只保存相对路径，应用层仍先经 `resolveStorageKeyToPath()` 校验。
- `truncated`：`false` 表示 AI 使用完整文本；`true` 表示仅 AI 输入被截为前 8,000 字，`normalized_texts.text` 仍保存完整原文。
- `jobs.attempts` 是转换和 AI 生成的唯一重试事实来源；不得在 `materials` 复制 retry counter。每次任务按 `jobs.material_id + job_type` 聚合已执行 attempts，跨自动与手动重试累计最多 3 次。

### 7.1a jobs 表补充 material 关联

```sql
ALTER TABLE jobs ADD COLUMN material_id TEXT;
CREATE INDEX idx_jobs_material_type_created ON jobs(material_id, job_type, created_at);
CREATE UNIQUE INDEX idx_jobs_material_type_active
  ON jobs(material_id, job_type)
  WHERE material_id IS NOT NULL AND status IN ('pending', 'running');
```

- S2 的 `material_convert` 与 `note_generate` Job 必须写入 `material_id`，同时在 `payload_json` 保留 `semesterId` 等执行上下文。
- `material_id` 作为重试聚合和待执行 Job 去重的数据库查询键；`jobs.attempts` 按 `material_id + job_type` 聚合，不能依赖解析 `payload_json`。
- 现有非 S2 Job 的 `material_id` 保持 `NULL`，不受该部分唯一索引影响；创建 S2 Job 时若命中唯一索引，API 映射为 409 `JOB_ALREADY_PENDING`。

---
### 7.2 normalized_texts 表补充字段

```sql
ALTER TABLE normalized_texts ADD COLUMN char_count INTEGER NOT NULL DEFAULT 0;
```

写入时由应用层根据实际字符数更新默认值或显式写入。

### 7.3 structured_notes 表补充字段

```sql
ALTER TABLE structured_notes ADD COLUMN model TEXT DEFAULT 'unknown';
ALTER TABLE structured_notes ADD COLUMN prompt_version TEXT DEFAULT 's2-note-v1.0';
ALTER TABLE structured_notes ADD COLUMN token_count INTEGER;
ALTER TABLE structured_notes ADD COLUMN generation_duration_ms INTEGER;
```

说明：
- 原表已有 `highlights_json TEXT`，旧行可能为 NULL；查询时使用 `COALESCE(highlights_json, '[]')`；
- SQLite `ALTER TABLE ADD COLUMN` 不支持 `NOT NULL` 对已有行生效，因此新列只用 `DEFAULT`，`NOT NULL` 约束由应用层 INSERT 时保证；
- `model`、`prompt_version` 在 INSERT 时显式写入，不依赖数据库 DEFAULT。

### 7.4 knowledge_modules 表补充字段

```sql
ALTER TABLE knowledge_modules ADD COLUMN content_summary TEXT;
ALTER TABLE knowledge_modules ADD COLUMN exam_relevance TEXT;
ALTER TABLE knowledge_modules ADD COLUMN last_reviewed_at TEXT;
```

应用层约束：
- `importance`: `low | medium | high | critical`；
- `difficulty`: `easy | medium | hard`；
- `learn_status`: `not_started | learning | mastered`；
- `source_evidence` 非空（INSERT 时校验）。

---

## 8. 接口设计

### 8.1 API 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/materials/upload` | multipart/form-data 上传资料 |
| GET | `/api/materials` | 按课程实例列出资料 |
| GET | `/api/materials/:id` | 资料详情（含转换状态、纯文本摘要） |
| POST | `/api/materials/:id/retry-conversion` | 转换失败重试 |
| POST | `/api/materials/:id/retry-ai-generation` | AI 生成失败重试 |
| POST | `/api/materials/:id/replace-text` | 手动粘贴纯文本，跳过转换 |
| GET | `/api/notes/:id` | 笔记详情 |
| GET | `/api/knowledge-modules` | 按课程列出知识模块 |
| PATCH | `/api/knowledge-modules/:id` | 更新学习状态/重要性/难度 |

### 8.2 请求/响应关键约束

- `POST /api/materials/upload`
  - 必填：`file`、`courseInstanceId`、`semesterId`；
  - 可选：`title`；
  - 文件大小 ≤ 10MB；Multer `limits.fileSize` 和 Service 层均使用 10MB 上限，路由统一将 `MulterError(LIMIT_FILE_SIZE)` 映射为 HTTP 413 + `FILE_TOO_LARGE` 标准 `ApiError`；
  - 文件类型由扩展名/MIME 推断，支持 pdf/png/jpg/jpeg/webp/txt/docx/pptx，不支持的返回 `INVALID_FILE_TYPE`；
  - 学期未 ready 或已归档返回 `SEMESTER_NOT_ACTIVE`；
  - 课程实例不存在返回 `COURSE_INSTANCE_NOT_FOUND`。

- `GET /api/materials`
  - 必填：`semesterId`、`courseInstanceId`；
  - 可选：`status`、`page`、`pageSize`（默认 page=1，pageSize=20，最大 100）。

- `GET /api/materials/:id`
  - 必填：`semesterId`（query）；
  - 返回 normalized_text 摘要（前 500 字符）和 metadata；
  - 响应中 `conversionRetryCount` 和 `aiRetryCount` 是从 jobs 表按 `material_id + job_type` 聚合 `attempts` 得到的虚拟字段（对齐 PRD 响应格式），不存储在 materials 表。

- `GET /api/notes/:id`
  - 必填：`semesterId`（query）；
  - `id` 为 `structured_notes.id`；
  - 返回 markdown、highlights、mindMap、knowledgeModules、model、tokenCount 等；
  - `highlights` 字段类型：`Array<{ content: string; importance: "high" | "medium" | "low"; position: string }>`（从 `highlights_json` 列 JSON.parse，旧行用 `COALESCE(highlights_json, '[]')`）；
  - AI Prompt 要求输出 JSON schema：
    ```json
    {
      "markdown": "string (结构化 Markdown 笔记)",
      "highlights": [{ "content": "重点句子", "importance": "high|medium|low", "position": "第X页第Y段" }],
      "mindMap": { "title": "string", "children": [{ "title": "string", "children": [] }] },
      "knowledgeModules": [{ "title": "string", "contentSummary": "string", "importance": "low|medium|high|critical", "difficulty": "easy|medium|hard", "sourceEvidence": "string", "examRelevance": "string" }]
    }
    ```

- `PATCH /api/knowledge-modules/:id`
  - 必填：`semesterId`（body）；
  - 可选：`learnStatus`、`importance`、`difficulty`、`examRelevance`；
  - `learnStatus` 变更写入 `StudyEvent`（`source_system: S2`, `event_type: knowledge_module_status_changed`, `evidence_ref: km:{id}`, `quality_gate: passed`）；
  - `study_events` 位于学期库，使用 `openReadySemesterDb(semesterId)` 写入；
  - **幂等性**：T07 不保证幂等，网络重试可能产生重复 StudyEvent。去重责任在 S1 消费层（按 source_id + event_type + timestamp 窗口），记录为 backlog。

---

## 9. 数据流

### 9.0 Worker 启动方式（审查决策）

MaterialJobWorker 导出以下入口：

```typescript
// packages/backend/src/services/material-job-worker.ts
export async function runOnce(): Promise<boolean> { /* 取一个 pending job 执行；有执行返回 true */ }
export function startPolling(intervalMs = 2000): NodeJS.Timeout { return setInterval(runOnce, intervalMs); }
export function stopPolling(timer: NodeJS.Timeout): void { clearInterval(timer); }
```

- **生产模式**：`server.ts` 启动时调用 `startPolling(2000)`，单进程串行执行，不存在并发竞争；
- **测试模式**：直接 `import { runOnce, MaterialJobWorker }`；可用 `MaterialJobWorker` 注入 mock AI 后同步触发，无需 sleep 等待；
- **关闭时**：`server.ts` 在 graceful shutdown 中调用 `stopPolling(timer)`。

### 9.1 上传与异步处理

```text
Client POST /api/materials/upload
  → NoteBuilderApi
    → NoteBuilderService.uploadMaterial
      → StorageAdapter.put (保存原始文件)
      → INSERT materials (status: pending)
      → INSERT jobs (job_type: material_convert, status: pending)
      → return MaterialDto

MaterialJobWorker.pollAndRun
  → SELECT pending job
  → 原子领取最早可执行 job：UPDATE jobs SET status = running, attempts = attempts + 1；领取前恢复 stale running job
  → 根据 job_type 分派
    → material_convert
      → StorageAdapter.get (读取文件)
      → dispatchConverter
      → IF ok
           INSERT normalized_texts
           UPDATE materials SET status = converted
           INSERT jobs (job_type: note_generate)
         ELSE
           若 material_convert 聚合 attempts < 3：UPDATE materials SET status = pending，并将同一 Job 的 available_at 设为当前时间后 5 秒；否则 UPDATE materials SET status = conversion_failed, conversion_error_message
    → note_generate
      → UPDATE materials SET status = note_generating
      → SELECT 完整 normalized_texts，再按 8,000 字生成 AI inputText；超过时只标记 truncated=true
      → AiProviderRouter.generate({ taskType: "note_generation", inputText })
      → 解析 JSON（markdown / highlights / mindMap / knowledgeModules）
      → IF ok
           INSERT structured_notes
           INSERT mind_maps
           INSERT knowledge_modules (1..N)
           UPDATE materials SET status = completed
           INSERT study_events (source_system: S2, event_type: material_note_completed)
           注意：study_events 位于学期库，使用同一个 openReadySemesterDb(semesterId) 连接写入
         ELSE
           若 note_generate 聚合 attempts < 3：UPDATE materials SET status = converted，并将同一 Job 的 available_at 设为当前时间后 5 秒；否则 UPDATE materials SET status = pending_quality_check, ai_generation_error_message
           注意：AI 返回非预期 JSON 时也走此路径（解析错误记录前 500 字符到 ai_generation_error_message）
```

### 9.2 失败恢复

- 每个 job 的 `attempts` 由 Worker 在原子领取时递增；自动重试和手动重试均按 materialId + jobType 聚合，最多执行 3 次。
- `conversion_failed` 且聚合 attempts < 3：`POST /materials/:id/retry-conversion` 在事务内确认不存在 pending/running 同类 job 后创建 `material_convert` job；响应返回当前 material 真实 status（仍为 `conversion_failed`）+ 聚合 attempts 值，Worker 领取后才将 status 转为 `converting`。否则返回 409 `MAX_RETRIES_EXCEEDED` 或 `JOB_ALREADY_PENDING`。
- `pending_quality_check` 且聚合 attempts < 3：`POST /materials/:id/retry-ai-generation` 使用相同互斥规则创建 `note_generate` job；响应返回当前 status（仍为 `pending_quality_check`）+ attempts。否则返回相同错误。
- `conversion_failed` / `pending`：允许 `POST /materials/:id/replace-text`。它在事务内 upsert `normalized_texts`、将 material 置为 `converted`，并仅在不存在 pending/running `note_generate` job 时创建该 job。

---

## 10. 错误处理

- 所有业务错误封装为 `NoteBuilderError { code, status, message }`；
- API Router 将 `NoteBuilderError` 及 `MulterError(LIMIT_FILE_SIZE)` 映射为标准 `ApiError` 和确定的 HTTP 状态码；
- 非预期错误返回 500，不暴露堆栈或数据库路径；
- AI 全部失败时不抛 500，而是将 material 标记为 `pending_quality_check`，保留 `normalized_text`；
- 转换失败不删除原始文件，学生可重试或手动粘贴。

---

## 11. 测试策略

### 11.1 单元/集成测试文件

`packages/backend/test/note-builder-api.test.mjs`

### 11.2 覆盖场景

**正常路径**
- 上传 `.txt` 文件 → 返回 material，status=pending；
- Worker 执行转换 → status 变为 converted；
- Worker 执行 AI 生成（mock 成功）→ status 变为 completed，能查到 note 和 knowledge modules；
- GET /api/materials 分页、状态过滤；
- GET /api/notes/:id 返回完整笔记数据；
- PATCH /api/knowledge-modules/:id 更新 learnStatus，并写入 StudyEvent。

**参数边界**
- 缺少必填字段；
- 无效 `courseInstanceId`；
- 不支持的文件类型（.exe、.zip）；
- 文件超过 10MB；
- 上传到已归档学期；
- 无效 `learnStatus` / `importance` / `difficulty`。

**失败路径**
- 转换失败 → status=conversion_failed，error_message 非空；
- 重试转换成功；
- 自动/手动重试累计达到 3 次后拒绝；重复 retry 请求返回 `JOB_ALREADY_PENDING`，不创建重复 Job；
- 手动 replace-text 跳过转换；
- AI 失败（mock 或 AI_PROVIDERS 未配置）→ status=pending_quality_check，normalized_text 仍可查看；
- AI 重试成功/超限。

**安全与隔离**
- 查询 A 课程的资料不返回 B 课程；
- 跨学期 courseInstanceId 返回 404；
- storage_key 不泄露绝对路径；MIME 与扩展名不一致、非法 status 与超 1MB normalized_text 均被拒绝。

### 11.3 Worker 测试策略

- 测试直接导入 `runOnce()` 并使用可注入依赖的 `MaterialJobWorker.runOnce()` 同步执行；不新增或调用 `/api/dev` 业务入口，也不依赖 sleep 或轮询时序。
- AI 生成使用注入的 mock Provider；另以 `AI_NOT_CONFIGURED` 验证降级路径。自动重试测试使用可注入时钟断言 5 秒退避，不等待真实时间。
- 覆盖 stale running Job 恢复、同类 Job 的原子领取与 created_at 顺序。

---

## 12. 验收标准

- [ ] `pnpm type-check` 通过；
- [ ] `pnpm -r --filter backend run build` 通过；
- [ ] `pnpm -r --filter backend run test` 通过（新增测试 + 原有测试不回归）；
- [ ] `scripts/check-docs-governance.ps1` 通过；
- [ ] `git diff --check` 通过；
- [ ] 上传文件后尽快返回 material_id；性能测量以文件写入与 Job 创建完成后的服务端响应为准，不将本地文件 I/O 排除在真实接口耗时之外；
- [ ] 转换成功后创建 normalized_text；
- [ ] AI 成功后创建 structured_notes、mind_maps、knowledge_modules，并写入 StudyEvent；
- [ ] AI 失败后 material 进入 pending_quality_check，不丢失 normalized_text；
- [ ] 知识模块状态变更写入 StudyEvent；
- [ ] 日志不记录 API Key、normalized_text 全文、AI 响应全文。

---

## 13. 文档与治理

- 任务完成后更新 `docs/04-开发任务清单-Todo-List.md` 中 T07 各子项；
- 不新建设计文档（S2 PRD 已存在且已登记）；
- 提交前运行治理检查脚本。

---

## 14. 风险与回滚

| 风险 | 应对 |
|---|---|
| schema migration v3 与旧测试数据不兼容 | 测试使用独立临时 `APP_DATA_ROOT`，每次启动新库 |
| AI 调用在测试中不可控 | 优先使用 mock Provider 注入；次选利用未配置降级路径 |
| Worker 异步轮询导致测试不稳定 | 提供同步触发入口或合理等待；避免真实 sleep 循环 |
| 文件过大导致 multer 内存溢出 | Multer 与 Service 层均限制 10MB，并将 `LIMIT_FILE_SIZE` 统一映射为 413 + `FILE_TOO_LARGE` |
| 多格式转换器失败 | 转换错误写入 material，不阻塞其他资料处理 |

---

## 15. 已决策事项（原待澄清问题）

| # | 问题 | 决策 |
|---|---|---|
| 1 | Worker 启动方式 | 后端启动时 `startPolling(2000)` 自动轮询，测试用 `runOnce()` 同步触发。见第 9.0 节。 |
| 2 | AI 输出解析失败 | 标记 `pending_quality_check`，保留纯文本，解析错误前 500 字符记入 `ai_generation_error_message`。 |
| 3 | 长文本分段 | T07 不实现分段；完整原文保存，超过 8,000 字时仅截断单次 AI 输入并记录 `truncated: true`。分段与合并放后续迭代。 |
| 4 | URL 导入 | T07 不做；延后到 S2-v1.1。 |

---

**下一步**：本计划经用户批准后，进入实现阶段。








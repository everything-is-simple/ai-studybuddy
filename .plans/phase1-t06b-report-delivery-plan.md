# Phase 1-T06B S6 家长报告推送渠道实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不泄露学生隐私的前提下，将 T06A 已生成的脱敏 S6 家长报告通过 QQ SMTP HTML 邮件和飞书 Webhook 卡片独立发送；支持按 `report_key + channel` 去重、失败隔离和只重试失败渠道。

**Architecture:** 新增后端一次性 `ParentReportDeliveryRunner`、`ParentReportDeliveryService` 与 SMTP / 飞书两个可注入的渠道 Adapter。runner 以 `Asia/Shanghai` 的 22:30 规则构造单个 `report:<yyyy-mm-dd>` 合并批次：日报块始终存在，周日追加周报块，月末追加月报块，已确认考试进入 7/3/1 天窗口时追加考前提醒块；同一天每渠道只发送一次。服务先冻结合并后的脱敏快照，再分别驱动渠道；`report_deliveries` 保存渠道状态，任何重试均复用快照而不重新生成事实。Windows Task Scheduler 每日 22:30 和登录补发时调用 runner，并启用 `StartWhenAvailable`；T06B 不增加 HTTP API、常驻/队列 Worker、前端或家长账号。

**Tech Stack:** TypeScript、Node.js、better-sqlite3、现有 `ParentReportService` 与学期库迁移机制、`nodemailer`（SMTP）、现有 `undici` HTTP 客户端（飞书 Webhook）、`node:test` 真实 SQLite 集成测试、PowerShell 文档治理脚本。

---

## 0. 当前事实、前置与范围

### 已确认前置

- S6 PRD 位于 `docs/subsystems/06-S6-家长观察子系统PRD-ParentReport.md`；其要求 T06B 按 `report_key + channel` 去重、双渠道失败互不阻塞，失败重试不得用不同事实覆盖原报告。
- T06A 已在 `ParentReportService` 中生成 `daily`、`weekly`、`monthly`、`exam_reminder` 脱敏规则报告和可选 AI 摘要；`reportKey` 为 `<type>:<periodStart>:<periodEnd>`，服务不写入报告或发送记录。T06B 必须把这些类型级结果组合为调度批次键 `report:<yyyy-mm-dd>`，不能将类型级键直接写入渠道去重表。
- 学期库初始化 SQL 已有 `report_deliveries(report_key, channel, status, sent_at, error_summary, created_at)`，主键为 `(report_key, channel)`；现有 v6 学期数据库还需要增量迁移才能具备 T06B 使用的完整持久化能力。
- `config.env` 已集中读取 `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_AUTH_CODE`、`SMTP_TO` 和 `FEISHU_WEBHOOK_URL`；不得将这些值写入日志、测试夹具、文档或 Git。
- 后端尚未安装 SMTP 库，也没有家长报告推送 API、报告调度 Worker 或真实渠道 smoke。

### 本任务实现边界

- 实现 QQ SMTP HTML 报告发送、飞书 Webhook 卡片发送、22:30 单批次合并、脱敏报告快照、Windows 一次性 runner / 计划任务入口、渠道发送记录、去重、失败渠道重试和专项测试。
- 使用已有的 `ParentReportService` 生成报告；T06B 不改变报告统计、AI 摘要策略、考试提醒规则或 S1/S2/S3/S4/T05 业务事实。
- 不实现 HTTP API、Express 常驻发送循环、BullMQ/SQLite 队列 Worker、前端页面、家长 Web 面板、家长账号、云同步、S5、S7 或 Phase 3。Windows Task Scheduler 只调用本任务新增的一次性 runner，不把报告投递接入现有 `MaterialJobWorker`。
- 不进行真实 QQ SMTP、真实飞书 Webhook 或真实 Provider smoke；外部发送验证一律采用可注入测试替身。

### 不可违反的隐私规则

- 发送内容、快照、数据库错误摘要和日志只能含 T06A 已允许的脱敏聚合：类型、周期、生成时间、短标题、计数、状态、趋势和轻量提醒。
- 禁止写入或发送资料原文、笔记正文、完整题干/答案/学生作答、错因正文、聊天内容、真实渠道地址、授权码、Webhook URL、Provider 请求/响应或完整 UUID。
- SMTP 与飞书错误仅保存已脱敏的短失败类别/摘要；不得透传 HTTP 响应正文、邮件地址、认证信息或完整外部 URL。

---

## 1. 数据模型、服务契约与决策

### 1.1 冻结报告快照和迁移

- [ ] 新增一个连续的学期库 migration（当前 v6 后为 v7），并把其注册到 `migrations.ts`；新建学期与既有 v6 学期库都必须得到相同表结构。
- [ ] 新增 `parent_reports` 表，以合并批次键 `report:<yyyy-mm-dd>` 为主键，至少保存：报告日期、时区、生成时间、包含日报/可选周报/可选月报/可选考前提醒的仅脱敏 `content_json`、内容短哈希和创建时间。
- [ ] 在同一 migration 中使用与初始化 schema 一致的 `report_deliveries` DDL，确保旧学期库拥有渠道去重表；不得删除、重建或篡改已存在发送记录。
- [ ] 快照采用 append-only 规则：同一 `report_key` 首次插入成功后永不更新。并发首发时以数据库主键决定唯一权威快照，后续发送一律重新读取该快照。
- [ ] 快照写入前构造白名单 DTO，而不是持久化任意调用方对象：只保留 T06A 的报告类型、周期、生成时间、规则报告状态/摘要、每个脱敏 section 的 `kind`、`title`、`summary`、`metrics`、`privacyLevel`，以及可选的已验证 AI 摘要。为 HTML / 卡片渲染再做字符转义，避免标题或摘要成为注入载荷。

### 1.2 后端服务契约

- [ ] 新增 `ParentReportDeliveryService`，由 `ParentReportService`、数据库路径工具、时钟、SMTP transport factory 和飞书 `fetch` 实现注入；生产默认使用现有 `paths.ts` / `env.ts`，测试不访问真实网络或真实邮箱。
- [ ] 定义后端内部输入：`semesterId`、目标报告日期或可注入时钟、`Asia/Shanghai` 时区、目标渠道集合、是否启用 AI 摘要，以及明确的 `retryFailed` 布尔开关。runner 先按 22:30 规则生成同日的类型块并合并为 `report:<yyyy-mm-dd>`，投递服务再取得或创建冻结快照并返回每个请求渠道的独立结果。
- [ ] 定义渠道结果至少包含：`channel`、`status`（`sent`、`failed`、`duplicate`、`skipped_unconfigured`）、是否实际尝试、发送时间（如有）、脱敏错误摘要（如有）。不得在结果中返回凭据、完整地址、Webhook URL 或完整 UUID。
- [ ] 每个渠道的状态机固定为：无记录时先写 `pending`，调用成功后写 `sent` 和 `sent_at`，调用失败后写 `failed` 和脱敏 `error_summary`。数据库写入错误属于该调用的明确失败，不得伪报发送成功。
- [ ] 去重固定为：已有 `sent` 记录时返回 `duplicate` 且绝不调用外部渠道；已有 `failed` 记录时默认不发送，只有 `retryFailed=true` 才重试该失败渠道；`pending` 记录不被当作成功，服务返回明确失败/占用结果而不重复外发。重试绝不调用 T06A 重新生成报告，始终使用该 `report_key` 的冻结快照。
- [ ] 渠道遍历必须逐一捕获错误：QQ SMTP 的失败只影响 QQ 结果，飞书失败只影响飞书结果。即使一个渠道未配置或失败，另一个已请求且已配置的渠道仍必须继续。runner 在任何新的当日批次前先处理已有失败或过期发送租约的渠道记录，且只重试未成功的渠道。

### 1.4 合并批次、调度与补发

- [ ] 固定业务时区为 `Asia/Shanghai`，将 runner 的日期/时钟作为可注入依赖；任何自动化测试不得依赖宿主机时区或当前真实时间。
- [ ] 生产 runner 从全局索引解析唯一且 `ready=1` 的 `active` 学期；若不存在可发送的 active 学期，则只处理已持久化的失败渠道并返回 `no_active_semester`，不生成新报告。`follow_up` 学期不进入 T06B 的新批次，避免同一天向同一渠道发送多个跨学期报告；跨学期合并属于后续独立任务。测试/受控手工调用可显式传入 `semesterId`。
- [ ] 类型窗口固定为：日报 `[D,D]`；仅当地周日生成周报 `[D-6,D]`；仅当地自然月最后一天生成月报 `[月初,D]`；考前提醒使用 `[D,D]` 并由 T06A 仅返回已确认考试的 7/3/1 天计数。所有类型块同属 `report:D` 的唯一合并快照。
- [ ] 每日 22:30 到达后生成一个 `report:<yyyy-mm-dd>` 批次：日报块必含；当地周日追加周报块；当地自然月最后一天追加月报块；只在已确认考试的 7/3/1 天窗口追加考前提醒块。一个批次只渲染一封 HTML 邮件和一张飞书卡片，绝不因类型重合而同日重复外发。
- [ ] runner 采用“到期批次优先”规则：每次被计划任务或登录触发时，先读取失败或发送租约超时的现有批次并只重试其未成功渠道；随后在当前时间已越过 22:30 时处理当日批次，或在登录补发场景处理最近一个错过且尚无已冻结快照的周期。不会批量补发多个陈旧日期。
- [ ] 为 `report_deliveries` 增加最小恢复字段：`attempt_count`、`last_attempt_at`、`next_retry_at`、`updated_at` 与 `lease_expires_at`。状态只允许 `pending`、`sending`、`sent`、`failed`；渠道原子认领 `sending` 租约，超过 5 分钟的未完成租约可恢复为 `failed`。同一调用对单渠道最多尝试 3 次，退避为 5 秒、30 秒；跨进程或重启后的重试只在 `next_retry_at` 到期且仍未发送时进行。
- [ ] Windows Task Scheduler 配置必须仅运行已编译的本地 runner，设置每日 22:30、登录触发和 `StartWhenAvailable`；注册脚本不得写入真实凭据，必须从本机 `.env.local` 或环境继承。实现测试只验证脚本/XML 内容和 runner 逻辑，不在普通自动化测试中创建真实计划任务。
### 1.3 QQ SMTP 与飞书 Adapter

- [ ] 在后端依赖中添加 `nodemailer` 及其 TypeScript 类型；仅在完整 SMTP 配置存在时创建 transport。SMTP 发件人使用已有 `SMTP_USER`，收件人使用已有 `SMTP_TO`，认证使用 `SMTP_AUTH_CODE`；缺失任一必需值时该渠道返回 `skipped_unconfigured`，不抛出凭据细节。
- [ ] 邮件 HTML 只由冻结快照的白名单字段渲染，包含报告类型、周期、规则摘要、各脱敏 section 和可选 AI 摘要；所有动态文本 HTML 转义，不嵌入原始资料、链接、外部地址或数据库 ID。
- [ ] 飞书通过已有 `undici` 的可注入 `fetch` POST 标准互动卡片 JSON；卡片只呈现与邮件等价的脱敏字段。仅 HTTP 2xx 且飞书 JSON 未报告业务失败时视为成功；网络错误、非 2xx、非 JSON 或业务失败均记录为该渠道的脱敏失败。
- [ ] Adapter 和日志不得打印 transport 配置、授权码、Webhook URL、收件人或原始外部响应；对外错误统一映射为稳定短码和安全摘要。

---

## 2. 实施步骤

### Task 1：先写失败测试与隔离夹具

**Files:** `packages/backend/test/parent-report-delivery-service.test.mjs`、`packages/backend/test/parent-report-runner.test.mjs`，必要时复用并扩展现有 `parent-report-service.test.mjs` 的隔离数据库工厂。

- [ ] 以真实、隔离的 SQLite 学期库搭建课程、任务、报告所需最小事实；`APP_DATA_ROOT` 指向仓库外的任务专用目录。
- [ ] 为 SMTP transport 与飞书 fetch 提供可控注入替身，捕获请求而不连接真实邮箱或网络。
- [ ] 先覆盖：固定 `Asia/Shanghai` 22:30 的日报合并，周日追加 `[D-6,D]` 周报、月末追加 `[月初,D]` 月报、已确认 7/3/1 天考试追加提醒；同一天各渠道只发送一个 `report:<date>`；唯一 active 学期选择、无 active 学期不生成新报告、follow_up 学期不重复发送；双渠道均成功；SMTP 失败但飞书仍成功；飞书失败但 SMTP 仍成功；任一渠道未配置；成功记录去重；发送租约恢复；退避后失败重试；相同 `report_key` 重试读取相同快照；未配置/失败结果不泄漏密钥、地址、URL 或完整 UUID。
- [ ] 覆盖 HTML 转义和飞书卡片只包含脱敏字段；对包含敏感样本文字的输入/错误断言它们不会进入快照、发送载荷、数据库错误摘要或服务结果。

### Task 2：实现迁移与冻结快照仓储

**Files:** `packages/backend/src/db/sql/migration-semester-v7.ts`、`packages/backend/src/db/migrations.ts`、`packages/backend/src/db/sql/schema-semester.ts`，以及新增的后端报告投递服务/仓储模块。

- [ ] 编写 v7 migration，验证从现有 v6 数据库升级后可保存/读取 `parent_reports` 和 `report_deliveries`；新库初始化 schema 必须同步包含 `parent_reports`。
- [ ] 实现“读取已有快照或创建唯一快照”的事务边界；重复请求不能覆盖旧快照，也不能因重新统计的学习事实改变同一报告内容。
- [ ] 只允许服务内部写入 `report_deliveries`，以 `(report_key, channel)` 主键实现渠道级状态查询、插入和更新。

### Task 3：实现渠道 Adapter 与投递服务

**Files:** 新增 `packages/backend/src/services/parent-report-delivery-service.ts`、`packages/backend/src/scripts/parent-report-runner.ts`；按现有结构新增私有 SMTP / 飞书 Adapter、Windows Task Scheduler 注册/卸载脚本或 XML 模板；`packages/backend/package.json`、锁文件和必要配置类型。

- [ ] 使用 T06A `ParentReportService` 在固定本地日期窗口生成所需类型块并合并成单个 `report:<date>`；首次生成立即转换为白名单冻结快照，若该 key 已有快照则直接使用快照而非重新生成。
- [ ] 实现邮件 HTML 和飞书卡片渲染、配置缺失降级、双渠道失败隔离、状态机、去重及显式失败重试。
- [ ] 保持 `env.ts` 作为全部环境变量读取入口；不得增加硬编码盘符、真实渠道地址或默认真实收件人。runner 和计划任务脚本只接收脱敏日期/运行参数，不在命令行、XML 或日志中写入密钥。
- [ ] 不添加 Express route、常驻定时执行器、BullMQ job 或前端触发器；仅新增 Windows 计划任务调用的一次性 CLI runner。

### Task 4：回归、文档状态与审查

**Files:** `docs/04-开发任务清单-Todo-List.md`，以及本计划引用的实现与测试文件。

- [ ] 所有 T06B 测试和迁移验证通过后，勾选 T06B 的四项实现清单，并追加完成证据：任务分支、关键服务、迁移、测试覆盖、隔离目录和实际验证结果。
- [ ] 不把 T06B 的实现完成写成 Phase 1 已整体完成；S5、S7、T07、家长面板和后续调度仍保持未完成状态。
- [ ] 复查 diff，确认没有触碰 T06A 无关文件、真实配置、运行数据、外部试炼场产物或未授权文档。

---

## 3. 验收与验证矩阵

### 实现验收

- [ ] QQ SMTP 与飞书各自能使用同一冻结的 `report:<date>` 脱敏合并批次生成符合渠道格式的载荷；周日/月末/确认考试提醒重合时每渠道仍只发送一次。
- [ ] `report_key + channel` 已发送记录必定去重；失败渠道在退避到期后可单独重试，并只使用既有冻结快照；超时 `sending` 租约可恢复而不重复发送成功渠道。
- [ ] 一个渠道失败、未配置或返回外部错误时，另一个渠道仍有独立发送机会，并获得独立状态。
- [ ] 数据库快照、发送记录、错误摘要、HTML、飞书卡片和测试输出均不含禁止的隐私内容、真实凭据、真实渠道地址或完整 UUID。
- [ ] T06A 的报告生成、AI 降级和确认考试提醒语义不被改变；本任务仅新增 Windows Task Scheduler 的一次性 runner，不新增 HTTP API、常驻/队列 Worker 或前端。

### 必跑命令（实施阶段）

```powershell
$env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t06b-report-delivery'
pnpm type-check
pnpm -r --filter backend run build
pnpm test
powershell -ExecutionPolicy Bypass -File scripts\check-docs-governance.ps1
git diff --check
```

如已暂存，还必须运行：

```powershell
git diff --cached --check
```

不运行真实 SMTP、真实飞书 Webhook 或真实 Provider smoke；所有测试都必须使用隔离数据根和可控外部客户端替身。

---

## 4. Git、审批与交付边界

- 计划分支：`codex/phase1-t06b-report-delivery-plan`。
- 本计划任务只新增本文件，并在 `docs/04-开发任务清单-Todo-List.md` 的 T06B 段落追加“计划已创建、待用户批准”的证据；不得勾选 T06B 实现项。
- 计划提交信息：`docs(phase1): 制定 T06B 家长报告推送计划`。
- 本计划经自审、文档治理和 diff 检查后可提交并推送任务分支备份；这不等于 T06B 功能已完成，也不自动授权写业务代码。
- 只有用户明确批准本计划后，才从最新 `master` 创建独立 T06B 实现分支，按本计划执行 Task 1–4；实现完成后须 rebase、fast-forward 合入 `master`、在 `master` 重跑验证并推送 `origin/master`。
- 交付时必须区分并写明：任务分支名、提交哈希、是否已推送、是否已合入 `master`、是否已推送 `origin/master`、`docs/04` 更新位置、真实验证结果与仍未实现边界。
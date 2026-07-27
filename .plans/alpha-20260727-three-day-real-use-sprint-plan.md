# ALPHA-20260727：3 天真实使用冲刺与 Day 0 基线修复计划

**版本**：v1.1
**日期**：2026-07-27（星期一）
**状态**：🔄 已获本轮用户授权启动 Day 0；候选包 02 与任务分支最终全量回归已通过，待主线集成、复验和推送
**任务分支**：`codex/alpha-20260727-day1-baseline-remediation`
**worktree**：`H:\ai-studybuddy-worktrees\alpha-20260727-day1-baseline-remediation`
**主线基线**：`origin/master` = `bd8f615fe735fae4968b4bdacfa945a84675e115`
**授权依据**：用户要求读取并执行附件；附件明确提出“3 天内进入真实使用”“开始 Day 1 开发机全量测试”“修 Bug 不加 Feature”。

---

## 1. 目标与事实边界

目标是在不扩展 Phase 3、完整 S7、S3 Worker 或新外部组件的前提下，于 2026-07-28（星期二）至 2026-07-30（星期四）完成一次可审计的 Alpha 冲刺，使系统达到“可在目标 Windows 11 用户电脑安装、启动并完成学生核心学习闭环”的条件。

2026-07-27 作为 Day 0：只做主线基线核验、阻塞归因、最小修复、回归和冲刺准备。目标用户电脑未实机操作前，不得写“用户电脑已验收”或“已正式上线”。

当前主线事实：

- S1–S6 简版、学生端产品化、配置中心、Phase 2 S5 冲刺闭环和 S7-MVP 已进入 `origin/master`。
- Phase 3 T02A–T02G 切片已各自进入 `origin/master`，但 T02 总体、真实 ACL/restore、Phase 3 总体均未完成。
- 开发机 Windows 原生 Node `v24.14.0`、Python `3.10.19` 基线曾通过；目标用户电脑仍待实机验收。
- `restore-data.ps1` 当前只允许 `-WhatIf` 预检，真实恢复写入固定拒绝；Alpha 可记录此已知限制，但不得伪造恢复成功。
- 主仓现有未跟踪 `alpha-sprint-plan/` 与 `.trae-html-share-packages/` 属于外部生成材料，本任务不删除、不覆盖、不提交。

---

## 2. Day 0 新鲜基线证据与 P0 阻塞

在最新 `origin/master=bd8f615`、隔离 `APP_DATA_ROOT=H:\ai-studybuddy-tmp\runs\alpha-sprint-dev-baseline-20260727-01` 下：

- `pnpm type-check`：通过。
- 后端 build：通过。
- 前端 build：通过；仅既有 Vite chunk size warning。
- `pnpm test`：失败。`deployment-powershell-compatibility.test.mjs` 仍要求 `backup-data.ps1` 直接调用 `Get-AIStudyBuddyRelativePath`，但 T02G 已把相对路径遍历下沉到共享模块的 `Get-AIStudyBuddyDataFiles`。`scripts/test-data-boundary.ps1` 实际通过：`DATA_BOUNDARY_TEST_OK REPARSE_FIXTURE_UNSUPPORTED acl=PASS`。
- `pnpm test:e2e`：16/21 通过、5/21 失败。五项均因 E2E 专用服务器把 `enableDevRoutes` 设置为 `false`，导致测试初始化接口 `/api/dev/init-semester` 返回 404；生产服务器继续禁用 dev routes 的安全边界不变。
- 候选包 01 的独立 OCR smoke 成功，但生产 `/api/semesters/preview` 返回 `TIMETABLE_OCR_FAILED`。根因是 `OcrTimetableRecognizer` 直接 `new OcrConverter()`，没有传入 bootstrap 写入的 `PYTHON_PATH`、`OCR_TIMEOUT_MS`、`OCR_TEMP_ROOT` 和 `OCR_CACHE_ROOT`，导致正式学期 onboarding 回退到系统 Python。

结论：初始 `master` 既存在测试门禁回归，也存在只有全新生产安装才能暴露的 OCR 运行时接线 P0；必须最小修复并完成候选包重建、全新安装和完整回归，才能进入目标机验收。

---

## 3. Day 0 最小修复范围

允许修改：

1. `packages/backend/test/deployment-powershell-compatibility.test.mjs`
   - 保留“Windows PowerShell 5.1 不使用 `[IO.Path]::GetRelativePath`”的原始安全/兼容目标。
   - 改为验证共享模块的 `Get-AIStudyBuddyDataFiles` 使用 `Get-AIStudyBuddyRelativePath`，且 `backup-data.ps1` 通过共享数据文件枚举 helper 间接使用该兼容路径。
2. `packages/backend/test/e2e-server.ts`
   - E2E 专用服务器显式设置 `enableDevRoutes: true`，仅恢复隔离测试初始化路由。
   - 不改变生产入口、`start-production.ps1`、默认 `createApp` 或生产攻击面测试。
3. `packages/backend/src/services/semester-selector-service.ts`
   - 让课程表 OCR recognizer 显式复用现有 `config` 中的 Python、超时、临时目录和缓存目录配置。
   - 不改变 OCR 协议、解析规则、API Schema 或持久化边界。
4. `packages/backend/test/semester-ocr-runtime-config.test.mjs`
   - 捕获实际构造的 `OcrConverter` 运行时配置，防止生产入口再次回退到系统 Python。
5. `.plans/alpha-20260727-three-day-real-use-sprint-plan.md`
6. `docs/04-开发任务清单-Todo-List.md`

禁止：新增 API、Schema、前端功能、Provider、Worker、真实恢复写入、Firewall、Docker/WSL、完整 S7、外部组件、真实密钥或正式数据操作。

---

## 4. Day 0 验证与完成门槛

按顺序执行：

1. 失败测试先复现。
2. 最小修改后运行：
   - `node --test --test-concurrency=1 packages/backend/test/deployment-powershell-compatibility.test.mjs`
   - `powershell -ExecutionPolicy Bypass -File scripts/test-data-boundary.ps1`
   - `pnpm test:e2e`
3. 完整回归：
   - `pnpm type-check`
   - `pnpm -r --filter backend run build`
   - `pnpm -r --filter @ai-studybuddy/frontend run build`
   - 隔离数据根下 `pnpm test`
   - 隔离数据根下 `pnpm test:e2e`
   - `powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1`
   - `git diff --check`
4. 独立检查生产 dev routes 仍不可达，E2E dev routes 可达。
5. 更新 `docs/04` 真实测试计数和结论。
6. 提交、rebase 最新 master、fast-forward 合并、master 同范围复验并推送 `origin/master`；远端主线包含提交前不得报告 Day 0 完成。

截至 2026-07-27 的任务分支与开发机候选包证据：

- PowerShell 兼容专项：6/6 通过。
- `scripts/test-data-boundary.ps1`：通过，输出含 `DATA_BOUNDARY_TEST_OK` 与 `acl=PASS`；当前环境为 `REPARSE_FIXTURE_UNSUPPORTED`，不作为 reparse 实机证据。
- OCR 运行时配置专项与相邻 semester selector API：4/4 通过；修复前候选包 01 的生产预览失败已在候选包 02 消除。
- 最终完整 `pnpm test`：后端 292/292 通过，包含新增 OCR 防回归测试；前端测试与构建通过。
- 完整 E2E：21/21 通过。
- `pnpm type-check`、后端 build、前端 build：最终回归通过；前端仅保留既有 Vite 大 chunk warning。
- 候选包 01 仅作为 P0 发现证据，不可交付。候选包 02 ZIP SHA256 为 `5393209D8F4BB154FA8ECC24A5C2266584C7F8CD9BDEF05A5BC569163A382AB3`，304 个文件，禁止项 0、秘密模式命中 0。
- 候选包 02 已在开发机全新隔离安装根完成 bootstrap、生产依赖、Python venv、OCR 依赖、安装检查和 OCR smoke；生产学期预览成功，人工确认后课程写入并经正式 API 读回，前端 200，生产 `/api/dev/init-semester` 为 404。合成课程表未被规则自动解析为结构化课程（0 条），真实课程表图片仍是目标机必测项。
- 运行中 `check-installation.ps1` 的关键项通过；未注册家长报告任务为符合默认禁用边界的 warning。停止后 PID 文件、进程和监听端口均无残留。
- 停机状态下主动数据完整性通过（2 文件）；外部白名单备份创建并通过完整性检查（2 文件、495616 字节）；`restore -WhatIf` 输出 `RESTORE_VALIDATED_NO_WRITE`；manifest 为 `ai-studybuddy-data-backup-v2` 且不含 `sourceDataRoot`。真实恢复写入仍固定禁用。
- 上述证据只代表任务分支和开发机候选包；完成 rebase、快进合并、主线复验并推送 `origin/master` 前，Day 0 仍不标记完成；目标用户电脑未产生新鲜证据前不得宣称实机验收或上线。

---

## 5. Alpha 必测矩阵

### P0-A：安装、启动与数据安全（全部必须通过）

| ID | 验收项 | 通过标准 |
| --- | --- | --- |
| A01 | 部署包来源 | 来自已记录提交；manifest/hash 可核对；不含 `.git`、`node_modules`、真实 env、数据库、日志、缓存、模型或真实资料 |
| A02 | Node/Python | Node 24 LTS x64 与 Python 3.10 x64 满足当前已验证组合；版本和路径脱敏记录 |
| A03 | bootstrap | 在全新隔离安装根成功；native 依赖和 OCR venv 完成或给出可操作错误 |
| A04 | installation check | 必要文件、运行时、配置权限和密钥文件检查通过；不泄漏配置值 |
| A05 | start/health | 仅监听 `127.0.0.1`；浏览器可打开；`/api/health` 返回成功 |
| A06 | stop/residue | 停止成功；无不应残留的 Node/OCR/ASR 子进程 |
| A07 | 重启读回 | 重启后学期、课程、任务和测试数据仍可读 |
| A08 | 备份 | 对隔离数据生成白名单 v2 备份并通过完整性检查；真实 restore 只做 `-WhatIf`，明确记录写入尚禁用 |
| A09 | 空状态/错误 | 新安装页面不白屏；配置缺失、接口失败不显示英文 stack、秘密或绝对路径 |

### P0-B：学生核心闭环（全部必须通过）

| ID | 验收项 | 通过标准 |
| --- | --- | --- |
| B01 | 学期与课程 | 创建/切换当前学期，创建课程、课表、考试目标；刷新后保持 |
| B02 | 学习首页/时间线 | 当前学习聚合与时间线可达，跨学期隔离正确 |
| B03 | 资料导入 | 至少验证纯文本、PDF、图片 OCR 各一份非敏感样例；失败可重试且不污染正式数据 |
| B04 | AI Provider 单链路 | 由操作者在目标机输入一组有效 Provider 配置；只做一次受预算约束的健康检查/最小生成，不记录 key、URL 或原文 |
| B05 | 笔记 | 从测试资料生成并查看笔记；Markdown/KaTeX/思维导图按内容工作；失败有中文反馈 |
| B06 | 练习 | 从知识模块生成练习、作答、超时/提交、结果读回 |
| B07 | 错题 | 错题归档、错因确认、重做、掌握状态和回流入口可用 |
| B08 | 模拟考 | 生成、作答、提交、结果与模块分析可用；未确认考试被正确阻止 |
| B09 | 临考速背 | 翻卡、刷新恢复、限时锁定和窄屏可用 |
| B10 | 冲刺计划/工作台 | 只读计划、深链、考试切换和工作台冲刺区可用 |
| B11 | 连贯学生旅程 | 学期 → 课程/考试 → 资料 → 笔记 → 练习 → 错题 → 冲刺，全链路无 P0 错误 |

### 条件项（不阻断核心 Alpha，但必须明确状态）

- C01 S6 QQ SMTP / 飞书：仅在用户确实需要且自行提供配置时做一次脱敏发送 smoke；未配置记为“待配置”，不伪造成功。
- C02 S7-MVP：仅在目标机已有合法显式 `whisper.cpp` CLI/模型时验证受控 PCM WAV → 可编辑文本 → S2 保存；否则记为“待配置/待验收”。
- C03 24 小时稳定性：三天冲刺内可开始观测，但不把不足 24 小时写成通过。
- C04 真实恢复写入：当前固定禁用，列为已知限制；不得在本冲刺中绕过安全门禁。

---

## 6. 三天施工计划

### Day 1：2026-07-28（星期二）——装得上

1. 确认 Day 0 修复已进入 `origin/master` 且全量测试/E2E 全绿。
2. 从最新主线构建新的生产装配和部署包，使用显式、已存在、为空、仓库外输出根。
3. 扫描部署包内容、manifest、hash 和秘密排除项。
4. 若目标电脑可用：在目标 Windows 11 电脑执行 bootstrap → check → start → health → stop。
5. 若目标电脑不可用：仅做开发机“全新隔离安装模拟”，结论保持“用户电脑待实机验收”。
6. 当天只修安装 P0 Bug；任何新 Feature 或环境永久改动停止并重新审批。

**Day 1 Gate**：A01–A06 全过；否则不得进入真实业务数据试用。

### Day 2：2026-07-29（星期三）——跑得通

1. 使用隔离、非敏感测试数据完成 B01–B11。
2. 操作者配置一个真实 Provider，执行一次最小、受预算约束的健康检查和核心 AI 生成链；证据只记 provider 名、模型、状态、耗时、token/预算摘要和短哈希。
3. 覆盖空状态、刷新、配置缺失、后端停止、无效文件、跨学期隔离。
4. P0 当场记录：复现步骤、期望/实际、截图/短哈希、日志摘要、影响面和回滚点。
5. S6/S7 只按条件项执行，不阻塞 S1–S6 核心闭环。

**Day 2 Gate**：A07–A09 与 B01–B11 全过；任何数据损坏、白屏、核心链断裂或秘密泄漏均停止试用。

### Day 3：2026-07-30（星期四）——修得稳并交付 Alpha

1. 只修 Day 1/2 发现的 P0/P1 Bug，不新增 Feature。
2. 对每个修复运行专项测试、全量测试和受影响 E2E。
3. 完成隔离数据备份与 `restore -WhatIf` 预检；记录真实恢复写入禁用的已知限制。
4. 形成一页学生快速上手、已知问题、停止/重启、备份说明和回退规则。
5. 在目标电脑重复最短验收：start → health → B11 核心旅程抽查 → restart readback → backup → stop/residue。
6. 回填 `docs/04`，主线复验并推送 `origin/master`。

**Alpha 发布标准**：P0 全过、无数据损坏/秘密泄漏、目标机有新鲜证据、已知限制已书面披露。若目标机未到位，只能发布“开发机候选包”，不能宣称真实使用验收完成。

---

## 7. 系统路线决策

明确选择：**停止新增功能，以目标机验收为主线；先修回归门禁，再装机，再走真实学生闭环，再根据真实反馈决定 Phase 3 后续或完整 S7。**

不建议：重构现有架构、引入 Redis/PostgreSQL/MinIO、启动完整 S7、扩展家长面板、把外部候选组件当成已接入能力、清理未归属 worktree/备份/临时目录。

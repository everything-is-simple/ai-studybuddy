# Phase 2-T01：S5 PRD 编写门禁审计与行动计划

**版本**：v0.1
**日期**：2026-07-20
**任务分支**：`codex/phase2-t01-s5-prd-plan`
**任务类型**：门禁审计 + 纯文档行动计划；用户明确批准前停止，不创建 S5 PRD。

---

## 1. 任务目标

Phase 2-T01 的单一责任是：在门禁满足且用户明确批准后，创建 S5 期末冲刺子系统轻量 PRD：

```text
docs/subsystems/08-S5-期末冲刺子系统PRD-ExamCrammer.md
```

本计划只完成 Phase 2-T01 的门禁审计、范围界定、章节设计和验证安排；本轮不创建 S5 PRD，不写 S5 业务实现。

---

## 2. 触发依据

`docs/04-开发任务清单-Todo-List.md` 中 `## Phase 2：期末冲刺（S5）` 登记：

- Phase 2 目标：模拟考 + 临考速背 + 冲刺计划；Phase 1 可以借鉴信息架构，但不提前实现。
- 前置条件：Phase 1 中 S3 练习 + S4 错题稳定运行；S5 PRD 尚未创建，必须先由 T01 在门禁满足并获批后创建。
- T01 单一责任：创建 `docs/subsystems/08-S5-期末冲刺子系统PRD-ExamCrammer.md`。

`docs/00-文档索引-Index.md` 当前将 S5 PRD 标记为 `📅 未创建`，触发条件为 Phase 2 触发。因此：计划阶段可以登记门禁审计；正式创建 PRD 仍需要用户对 T01 实施计划的明确批准。

---

## 3. 当前只读门禁审计结论

### 3.1 S5 PRD 文件存在性

- 目标文件：`docs/subsystems/08-S5-期末冲刺子系统PRD-ExamCrammer.md`
- 当前审计结果：不存在。
- 处理规则：没有用户明确批准创建 S5 PRD 前，不创建该文件，也不更新 `docs/00` 将其标为有效。

### 3.2 S3 练习稳定运行证据清单

- S3 PRD 已存在：`docs/subsystems/03-S3-限时练习子系统PRD-PracticeRunner.md`。
- `docs/00` 登记 S3 为 MVP 已完成：Schema、生成、提交批改与前端闭环均已验收。
- `docs/04` Phase 1 真实执行顺序登记：
  - Phase 1-T03 S3 PRD 编写已完成；
  - Phase 1-T03A S3 数据库与 Schema 已完成：学期库 migration v4、`practice_sessions`、`questions`、`practice_answers`、最小 shared 类型、数据库约束和升级测试；
  - Phase 1-T03B 练习生成 API 已完成：`PracticeRunnerService`、`POST /api/practice-sessions`、`GET /api/practice-sessions/:id`、AI 失败不落空 session、题目 DTO 隐藏答案；
  - Phase 1-T03C 限时作答与规则批改已完成：`POST /api/practice-sessions/:id/submit`、客观题规则批改、`practice_answers`、session 汇总字段和 `practice_completed` StudyEvent；
  - Phase 1-T03D S3 练习前端闭环已完成：前端 API 封装、练习发起/作答/结果页、工作台“练习”区、前端测试和 Playwright 验收。
- 后续主线验收补强：`docs/04` 记录 Pre-T09 端到端验收覆盖 S3 限时练习主路径，T09E 已补齐练习历史与学期归档只读查看。
- 未完成但已定界：S3 Worker 仍未开始；根据 `AGENTS.md`、`docs/00`、`docs/02`、`docs/04`、`docs/12` 当前事实，S3 Worker 不属于当前 MVP。

### 3.3 S4 错题稳定运行证据清单

- S4 PRD 已存在：`docs/subsystems/03-S4-错题改错子系统PRD-ErrorFixer.md`。
- `docs/00` 登记 S4 MVP 闭环已完成：T04A Schema/归档、T04B 错题改错前端与 T05 回流规则均已验收。
- `docs/04` Phase 1 真实执行顺序登记：
  - Phase 1-T04 S4 PRD 编写已完成；
  - Phase 1-T04A S4 错题归档与 Schema 已完成：学期库 migration v5、`mistakes`、`mistake_evidence`、`weak_points`，S3 提交后幂等归档，至少两条独立错误证据形成薄弱点；
  - Phase 1-T04B S4 错题改错前端已完成：错题 API、列表/详情页、错因确认、原题重做、薄弱点展示和工作台“查漏补缺”入口；含 migration v6 与 S4 API 补洞；
  - Phase 1-T05 回流规则已完成：错题/薄弱点提升关联知识模块与任务优先级，全部掌握后降频，不删除历史记录。
- 后续主线验收补强：`docs/04` 记录 Pre-T09 端到端验收覆盖 S4 错题改错主路径，M02 针对错题详情语义标题做过回归修复并进入 `origin/master`。

### 3.4 S3 Worker 是否阻塞 S5 PRD 创建

当前判断：**不阻塞 Phase 2-T01 的 S5 PRD 创建门禁**。

依据：

1. Phase 2 前置条件写的是“S3 练习 + S4 错题稳定运行”，不是“S3 Worker 已实现”。
2. 当前 SoT 多处明确写明 S3 Worker 不属于当前 MVP；S3 已通过 Schema、生成 API、提交批改、前端闭环与主线 E2E 形成可用练习闭环。
3. S5 PRD 是设计文档任务，不会在本轮引入后台 Worker、真实 Provider 调用或新 Schema。后续若 S5 T02–T06 需要异步生成、定时计划或后台任务，必须在各自独立计划中重新评估 Worker 边界。

### 3.5 门禁总体判断

- 从当前 `origin/master` 文档事实看，**S3/S4 稳定运行前置条件已满足到“允许制定并提交 S5 PRD 创建计划”的程度**。
- 从文档门禁看，**正式创建 S5 PRD 还需要用户对 Phase 2-T01 实施计划的明确批准**。
- 本轮用户要求是“门禁审计与行动计划任务”，不是批准直接创建 S5 PRD。因此本轮在计划提交后停止。

---

## 4. S5 PRD 预计章节

获批后，S5 PRD 预计按现有轻量子系统 PRD 风格组织：

1. Executive Summary：期末冲刺目标、问题、成功标准；
2. 使用场景与用户故事：考前模拟、临考速背、冲刺计划、考前工作台入口；
3. 用户流程：从确认考试与知识模块/错题进入冲刺；
4. 输入/输出：考试范围、知识模块、错题/薄弱点、历史练习记录、模拟卷与冲刺计划；
5. AI 与规则边界：组卷/解析/速背建议可用 AI，倒计时、分数、完成状态等事实由规则与数据库产生；
6. 数据对象草案：只描述概念，不在 PRD 任务中创建 Schema；
7. API 与页面候选：只描述后续 T02–T06 可能需要的边界，不实现；
8. 与 S1/S2/S3/S4/S6 的关系：只读引用、回写事件、隐私脱敏；
9. 验收标准：PRD 完整性、边界、隐私、后续任务拆分；
10. Non-Goals 与后续路线图：不越权到 S7、家长面板或真实外部 smoke。

---

## 5. S5 范围边界

### 5.1 Phase 2 / S5 正向范围

- **模拟考**：围绕已确认考试、知识模块、错题和薄弱点形成限时模拟卷与成绩分析。
- **临考速背**：按薄弱点、错题证据和考试倒计时生成可快速复习的卡片或清单。
- **冲刺计划**：根据考试日期、剩余天数、知识模块状态、错题/薄弱点和已有任务给出每日复习建议。
- **考试前工作台入口**：在考试前 N 天于考试工作台展示冲刺入口与下一步，不替代 S1/S3/S4 既有入口。

### 5.2 本轮明确不做

- 不实现 Phase 2-T02–T06。
- 不创建 S5 Schema、migration、后端 API、前端页面、Worker、Job 或 shared 类型。
- 不启动 S7、课堂录音、ASR、音视频处理或课堂采集 PRD。
- 不回到 Phase 1-T09B–T09E，不修改每日首页、课表、全局导航、练习历史或归档功能。
- 不实现 S3 Worker，不以 S5 计划绕过 S3/S4 后续增强门禁。
- 不运行真实 AI、QQ SMTP、飞书、中转站、Windows Task Scheduler 或其他外部 smoke。

---

## 6. 隐私与真实 Provider 边界

- S5 PRD 不得包含真实资料原文、真实考试名称、完整 UUID、API Key、SMTP 授权码、飞书 Webhook、Provider URL 或外部账号信息。
- S5 后续实现若需 AI 生成模拟题、解析或速背卡，必须只发送最小必要的知识摘要/错题摘要，并保留失败降级；不能把家长报告、资料原文或秘密配置传给前端。
- S6 家长报告仍只能读取脱敏聚合；不得展示题干、标准答案、学生答案、错因正文或完整模拟卷内容。
- 本轮验证只运行本地文档/差异检查，不触发任何真实外部服务。

---

## 7. 执行步骤

1. 确认工作区干净，并从最新 `origin/master` 创建 `codex/phase2-t01-s5-prd-plan`。
2. 读取必读文档并完成上述门禁审计。
3. 创建或补齐 `.plans/phase2-t01-s5-prd-plan.md`。
4. 在 `docs/04` 的 Phase 2 区域登记 T01 计划路径与“计划已创建/待用户批准”；不勾选 S5 PRD 完成。
5. 不更新 `docs/00`，除非正式 S5 PRD 已获批创建并同步索引；本轮因未创建 S5 PRD，无需更新 `docs/00`。
6. 运行验证命令并记录退出码。
7. 仅暂存本计划和 `docs/04`，检查 staged diff 不含 S5 PRD、业务代码、真实配置或无关文件。
8. 提交并推送任务分支；不合入 master。
9. 向用户报告门禁判断，并等待用户明确批准是否进入“创建 S5 PRD”实施。

---

## 8. 验证命令

本轮是纯文档/计划任务，必跑：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
git diff --cached --check
```

不运行 `pnpm type-check`、后端/前端 build 或 `pnpm test` 的理由：本轮不改业务代码、Schema、API、Worker、前端页面或测试。

---

## 9. 独立复审检查表

- [ ] 分支是否从最新 `origin/master` 创建，且不是 T09B 分支。
- [ ] S5 PRD 文件在本轮没有被创建。
- [ ] `.plans/phase2-t01-s5-prd-plan.md` 是否覆盖 S3/S4 稳定运行证据和 S3 Worker 不阻塞判断。
- [ ] `docs/04` 只更新 Phase 2-T01 计划状态/行动计划索引，没有勾选完成，也没有启动 T02–T06。
- [ ] 未修改 T09B–T09E 状态，未启动 S7 或 Phase 3。
- [ ] 未新增 Schema/API/Worker/前端/shared 类型。
- [ ] 未读取或输出真实秘密、`.env.local` 或备份密钥文件。
- [ ] 验证命令退出码已记录。
- [ ] staged diff 仅包含计划与 `docs/04` 的本任务范围文件。

---

## 10. 用户批准前停止规则

本计划提交后必须停止在 Phase 2-T01 的“创建 PRD”边界之前。只有用户明确批准继续创建 `docs/subsystems/08-S5-期末冲刺子系统PRD-ExamCrammer.md` 后，才允许在新一轮任务中：

1. 创建 S5 PRD 文件；
2. 必要时同步 `docs/00` 将 S5 PRD 登记为有效；
3. 更新 `docs/04` 将 Phase 2-T01 从计划待批推进到文档创建实施/完成状态；
4. 运行文档治理与 diff 检查后提交。

该批准也不等于批准 Phase 2-T02–T06、Schema、API、Worker、前端页面、真实外部 smoke 或 S7。

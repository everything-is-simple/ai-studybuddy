# AI StudyBuddy 文档索引

**版本**：v2.13
**日期**：2026-07-16
**用途**：这是本项目所有设计文档的导航中心和单一事实来源（SoT）。AI Agent 和开发者在开始任何任务前，必须先读本文件。

---

## 一、当前有效文档

| 编号 | 文档名 | 状态 | 用途 |
| ---- | ------ | ---- | ---- |
| 00 | [文档索引-Index.md](00-文档索引-Index.md) | ✅ 有效 | 本文件，文档导航、文档门禁和触发状态 |
| 01 | [总PRD-产品需求-Product-Requirements.md](01-总PRD-产品需求-Product-Requirements.md) | ✅ 有效 | 产品目标、考试驱动学习闭环、七子系统总表、MVP 边界、AI 使用边界 |
| 02 | [七子系统地图-Scenario-Systems.md](02-七子系统地图-Scenario-Systems.md) | ✅ 有效 | 七个场景子系统边界、共同业务对象、依赖关系、开发顺序 |
| 03 | [subsystems/03-S1学习节奏子系统PRD-StudyRhythm.md](subsystems/03-S1学习节奏子系统PRD-StudyRhythm.md) | ✅ 有效 | S1 轻量 PRD，课程、考试、任务、StudyEvent 与时间线 |
| 03b | [subsystems/03-S2-资料笔记子系统PRD-NoteBuilder.md](subsystems/03-S2-资料笔记子系统PRD-NoteBuilder.md) | ✅ 有效 | S2 轻量 PRD，资料上传/格式转换/AI 笔记/知识模块 |
| 03c | [subsystems/03-S3-限时练习子系统PRD-PracticeRunner.md](subsystems/03-S3-限时练习子系统PRD-PracticeRunner.md) | ✅ 有效 | S3 轻量 PRD，知识模块驱动练习、客观题批改、练习记录 |
| 04 | [开发任务清单-Todo-List.md](04-开发任务清单-Todo-List.md) | ✅ 有效 | 阶段任务、执行顺序、完成门槛和验证结论 |
| 05 | [开源组件装配-Open-Source-Foundation.md](05-开源组件装配-Open-Source-Foundation.md) | ✅ 有效 | 成熟开源组件先行装配规则、smoke test 标准 |
| 06 | [本地目录治理-Dev-Environment.md](06-本地目录治理-Dev-Environment.md) | ✅ 有效 | `I:\ai-studybuddy-*` 本地目录职责、外部试炼场与单机数据边界 |
| 07 | [文档策略-Design-Docs-Strategy.md](07-文档策略-Design-Docs-Strategy.md) | ✅ 有效 | 文档分层、子系统文档触发条件 |
| 08 | [共同底座架构-Architecture.md](08-共同底座架构-Architecture.md) | ✅ 有效 | 共同底座架构、Adapter、Job、数据对象和跨子系统边界 |
| 09 | [测试验收计划-Test-Plan.md](09-测试验收计划-Test-Plan.md) | ✅ 有效 | Phase 0.5/0.7/0.8 验收标准与证据规则 |
| 10 | [后端开发规范-Backend-Guidelines.md](10-后端开发规范-Backend-Guidelines.md) | ✅ 有效 | 后端目录结构、SQLite、Adapter、AI Provider、日志和环境变量约定 |
| 11 | [前端开发规范-Frontend-Guidelines.md](11-前端开发规范-Frontend-Guidelines.md) | ✅ 有效 | React/Vite 前端结构、API 信封、上传轮询、笔记渲染安全与 T08 验收规范 |
| 12 | [开发规范-Dev-Rules.md](12-开发规范-Dev-Rules.md) | ✅ 有效 | 工具无关 16 步协作流程、分支/worktree、多 Agent、验证、隐私和提交规则 |

---

## 一点五、代码与试炼场边界

- `I:\ai-studybuddy` 是唯一主系统 Git 仓库；这里只保存有效设计文档、正式实现和可审计结论。
- `I:\ai-studybuddy-composer` 是独立的本机组件试炼场，不加入主仓库 workspace，不作为主系统源码目录。
- 试炼场中的 `.env.local`、`.venv`、`node_modules`、测试输出、真实凭据和临时素材不得复制或提交到主仓库。
- 试炼场验证通过不等于产品已接入；必须先回填有效编号文档，再在主仓库按 Adapter/API/UI 边界重新实现。

---

## 二、子系统轻量 PRD 触发规则

| 子系统 | PRD 文档 | 当前状态 | 触发条件 |
| ------ | -------- | -------- | -------- |
| S1 学习节奏 | `subsystems/03-S1学习节奏子系统PRD-StudyRhythm.md` | ✅ 已创建，MVP 已实现 | Phase 0.8 必需 |
| S2 资料笔记 | `subsystems/03-S2-资料笔记子系统PRD-NoteBuilder.md` | ✅ 已创建，MVP 已实现 | Phase 0.8 开始开发 S2 前触发 |
| S3 限时练习 | `subsystems/03-S3-限时练习子系统PRD-PracticeRunner.md` | ✅ MVP 已完成：Schema、生成、提交批改与前端闭环均已验收 | S2 MVP 完成后触发 |
| S4 错题改错 | `subsystems/S4-错题改错子系统PRD-ErrorFixer.md` | ⏳ 触发条件已满足，PRD 尚未创建；仍需独立计划和用户明确批准 | S3 MVP 完成后触发 |
| S5 期末冲刺 | `subsystems/S5-期末冲刺子系统PRD-ExamCrammer.md` | 📅 未创建 | Phase 2 触发 |
| S6 家长观察 | `subsystems/S6-家长观察子系统PRD-ParentReport.md` | 📅 未创建 | Phase 1 后期、准备正式发送家长报告前触发 |
| S7 课堂采集 | `subsystems/S7-课堂采集子系统PRD-ClassCapture.md` | 📅 未创建 | Phase 1.5 触发 |

---

## 三、未来文档触发条件

| 文档 | 触发条件 | 当前状态 |
| ---- | -------- | -------- |
| 08-共同底座架构-Architecture.md | 设计共同数据模型、队列、对象存储、AI Provider、Adapter 前 | ✅ 已创建（Phase 0.7/0.8） |
| 09-测试验收计划-Test-Plan.md | 调通第一个开源组件 smoke test 前 | ✅ 已创建（Phase 0.5） |
| 10-后端开发规范-Backend-Guidelines.md | 写第一个后端服务 / Adapter / API / Worker 前 | ✅ 已创建（Phase 0.8 T03） |
| 11-前端开发规范-Frontend-Guidelines.md | 写第一个正式前端页面前 | ✅ 已创建（Phase 0.8 T08） |
| 12-开发规范-Dev-Rules.md | 多 AI / 多分支 / 多 worktree 协作时 | ✅ 已创建（Phase 1-T00） |
| 13-部署运维指南-Deployment.md | Phase 1 完成后准备部署时 | 未触发 |
| 14-安全与隐私-Security-Privacy.md | Phase 1 后期或真实家庭试用前 | 未触发 |

---

## 四、旧草稿归档

旧草稿已归档到仓库外备份目录。除非用户明确要求做历史考证，不要恢复到 `docs/`，也不要把旧文件名重新放回当前有效文档。禁止恢复的旧名包括但不限于：`PRD.md`、`ARCHITECTURE.md`、`todo-list.md`、`backend-guidelines.md`、`frontend-guidelines.md`、`dev-rules.md`。

---

## 五、文档门禁规则

### 5.1 文档创建前检查清单

1. 先读本索引。
2. 检查目标文档是否已经存在。
3. 检查触发条件是否满足。
4. 不满足触发条件：不创建，只说明“还不到创建时机”。
5. 满足触发条件：按命名规范创建。
6. 同一次修改必须更新本索引。
7. 提交前必须运行 `scripts/check-docs-governance.ps1`。

### 5.2 文档命名规范

正式文档命名：

```text
NN-中文标题-English-Title.md
```

示例：

```text
01-总PRD-产品需求-Product-Requirements.md
12-开发规范-Dev-Rules.md
```

子系统 PRD 放在 `docs/subsystems/` 下，并遵守同样的编号与中英命名规则。

### 5.3 提交前验证

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
```

---

## 六、文档阅读顺序

### 6.1 第一次接触本项目

1. 本文件（00-文档索引）；
2. [01-总PRD-产品需求](01-总PRD-产品需求-Product-Requirements.md)；
3. [02-七子系统地图](02-七子系统地图-Scenario-Systems.md)；
4. [07-文档策略](07-文档策略-Design-Docs-Strategy.md)；
5. [12-开发规范](12-开发规范-Dev-Rules.md)。

### 6.2 准备后端或前端开发

1. [04-开发任务清单](04-开发任务清单-Todo-List.md)；
2. [08-共同底座架构](08-共同底座架构-Architecture.md)；
3. [10-后端开发规范](10-后端开发规范-Backend-Guidelines.md) 或 [11-前端开发规范](11-前端开发规范-Frontend-Guidelines.md)；
4. 相关子系统 PRD；
5. [12-开发规范](12-开发规范-Dev-Rules.md)。

### 6.3 准备 Phase 1

1. 重读 S1/S2 PRD、S3 PRD 与最新验收结论；
2. Phase 1-T00、T10、T02、T03、T11、T03A、T03B、T03C、T03D 已完成；S3 已完成 Schema、练习生成/提交批改 API、前端发起/作答/结果闭环、前端自动化与浏览器验收；
3. 当前下一门禁为 T04：S4 轻量 PRD 的计划、独立审查和用户明确批准。S3 Worker 不属于当前 MVP，仍未开始；
4. S4 PRD 的触发条件现已满足，但不得自动创建；S5/S6/S7 继续按各自门禁等待。

---

## 七、AI Agent 专用规则

### 7.1 每次任务开始前

1. 先读 `docs/00-文档索引-Index.md`；
2. 确认当前产品事实以 `01-总PRD` 和 `02-七子系统地图` 为准；
3. 读取 `docs/12-开发规范-Dev-Rules.md` 的 16 步流程；
4. 旧归档草稿和外部参考项目不作为当前执行依据。

### 7.2 新增设计文档前

1. 检查是否满足本文件中的触发条件；
2. 不满足：不创建，向用户说明“还不到创建时机”；
3. 满足：按命名规范创建，并同步更新本索引表。

### 7.3 禁止行为

- ❌ 不要凭记忆新建文档；
- ❌ 不要从旧 zip 或外部参考项目直接恢复旧稿到 `docs/`；
- ❌ 不要硬编码任何盘符路径到业务代码中；
- ❌ 不要提交真实密钥、Provider URL、资料原文、完整 UUID 或正式运行数据；
- ❌ 不要跳过文档门禁和 `docs/12` 的批准流程。

---

## 八、版本历史

| 版本 | 日期 | 变更 |
| ---- | ---- | ---- |
| v2.13 | 2026-07-16 | Phase 1-T03D：登记 S3 前端 API 封装、练习发起/作答/结果页、工作台“练习”区、前端测试与隔离浏览器验收已完成；S3 MVP 完成，S4 PRD 触发条件满足但仍需独立计划和明确批准 |
| v2.12 | 2026-07-16 | Phase 1-T03C：登记 `POST /api/practice-sessions/:id/submit`、客观题规则批改、`practice_answers`、session 汇总字段与 `practice_completed` StudyEvent 已完成；下一门禁调整为 T03D，S4-S7 仍未触发 |
| v2.11 | 2026-07-16 | 修复 master 漂移：将既有 T03A/T03B 分支实现纳入主线状态，入口规则与下一门禁统一为 T03C；S4-S7 仍未触发 |
| v2.10 | 2026-07-16 | Phase 1-T03B：登记 PracticeRunnerService、`POST /api/practice-sessions`、`GET /api/practice-sessions/:id`、作答前隐藏答案 DTO 与 mock AI API 测试已完成；下一门禁调整为 T03C |
| v2.9 | 2026-07-16 | Phase 1-T03B：登记练习生成 API 实施计划已创建并自审，等待用户明确批准；S3 API/Service/Worker/前端仍未开始 |
| v2.8 | 2026-07-16 | Phase 1-T03A：登记学期库 migration v4、S3 三表、11 个索引、8 个一致性 trigger、最小 shared 类型与 127/127 后端、32/32 前端全量验证；下一实现门禁调整为 T03B |
| v2.7 | 2026-07-16 | 登记 Phase 1-T03A 数据库与 Schema 实施计划已创建并待批准；校准 S3 PRD 题目顺序字段与下一门禁状态 |
| v2.6 | 2026-07-16 | Phase 1-T02：登记 Provider 实例级连续失败熔断、10 分钟冷却、恢复探测、全冷却错误和脱敏日志；下一实现门禁调整为 T03A |
| v2.5 | 2026-07-15 | 对齐 S1/S2/S3 子系统 PRD 文件编号；确认 Phase 1-T11 已合并到 master 并完成最终隔离验收；登记 Phase 1-T02 待批准计划 |
| v2.4 | 2026-07-15 | Phase 1-T11：登记考试确认与多考试工作台闭环、正式 API 契约及自动化/浏览器验收证据；修正页首版本漂移 |
| v2.3 | 2026-07-15 | Phase 1-T03：在获批文档计划范围内创建并登记 S3 限时练习 PRD |
| v2.2 | 2026-07-15 | Phase 1-T00：登记 12-开发规范，修正 Phase 0.8 完成态、S3 触发态和 Phase 1 阅读/门禁顺序 |
| v2.1 | 2026-07-13 | 补充前端规范的分页、轮询退避、资料笔记导航与格式化治理规则 |
| v2.0 | 2026-07-13 | T08 首个正式前端页面任务触发，登记前端开发规范 |
| v1.9 | 2026-07-13 | 对齐 T06 后系统文档：修正报告渠道环境变量状态，明确 QQ SMTP/飞书变量已登记并在 Phase 0.7 验证，正式消费留到 S6 ParentReport |
| v1.8 | 2026-07-13 | T06 审查收尾：修复任务状态更新对非法 `occurredAt` 静默回退为当前时间的问题，新增回归测试；全量测试更新为 94/94 通过 |
| v1.7 | 2026-07-13 | 回填 Phase 0.8 T06：S1 学习节奏核心 API 实现完成，包括学期 migration v2、课程/考试/任务/事件/时间线 8 个端点、标准 API 信封与 93/93 全量测试通过 |
| v1.6 | 2026-07-12 | 回填 Phase 0.8 T05：主仓库已正式接入 AI Provider Router、Dev API 与脱敏日志；同步登记 77/77 全量测试及后端测试稳定性治理 |
| v1.5 | 2026-07-11 | 触发文档门禁：创建 10-后端开发规范，登记为有效文档 |
| v1.4 | 2026-07-10 | 吸收参考系统的产品闭环：将 Exam、KnowledgeModule、练习记录与错题回流纳入有效设计和后续任务边界 |
| v1.3 | 2026-07-10 | 产品默认形态改为孩子 Windows 本机 + 邮件/飞书异步家长报告；以 Phase 0.7 替代隧道验证 |
| v1.2 | 2026-07-09 | Phase 0.5 完成交割后，统一任务清单、底座架构、测试计划和组件路线图状态 |
| v1.1 | 2026-07-09 | Phase 0.5A MVP 底座完成后，更新共同底座、组件状态、AI Provider 与 OCR 主路径 |
| v1.0 | 2026-07-07 | 初始版本，文档重建后的第一版索引 |

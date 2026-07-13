# AI StudyBuddy 文档索引

**版本**：v1.9
**日期**：2026-07-13
**用途**：这是本项目所有设计文档的导航中心和单一事实来源（SoT）。AI Agent 和开发者在开始任何任务前，必须先读本文件。

---

## 一、当前有效文档

| 编号 | 文档名 | 状态 | 用途 |
|---|---|---|---|
| 00 | [文档索引-Index.md](00-文档索引-Index.md) | ✅ 有效 | 本文件，文档导航 |
| 01 | [总PRD-产品需求-Product-Requirements.md](01-总PRD-产品需求-Product-Requirements.md) | ✅ 有效 | 产品目标、考试驱动学习闭环、七子系统总表、MVP 边界、AI 使用边界 |
| 02 | [七子系统地图-Scenario-Systems.md](02-七子系统地图-Scenario-Systems.md) | ✅ 有效 | 七个场景子系统边界、共同业务对象、依赖关系、开发顺序 |
| 03 | [subsystems/03-S1学习节奏子系统PRD-StudyRhythm.md](subsystems/03-S1学习节奏子系统PRD-StudyRhythm.md) | ✅ 有效 | S1 轻量 PRD，第一个子系统设计 |
| 03b | [subsystems/03-S2-资料笔记子系统PRD-NoteBuilder.md](subsystems/03-S2-资料笔记子系统PRD-NoteBuilder.md) | ✅ 有效 | S2 轻量 PRD，资料上传/格式转换/AI 笔记/知识模块 |
| 04 | [开发任务清单-Todo-List.md](04-开发任务清单-Todo-List.md) | ✅ 有效 | Phase 0.5 历史结论、Phase 0.7 Windows 原生验证、考试/知识模块闭环的 Phase 0.8/1 任务拆解 |
| 05 | [开源组件装配-Open-Source-Foundation.md](05-开源组件装配-Open-Source-Foundation.md) | ✅ 有效 | 成熟开源组件先行装配规则、smoke test 标准 |
| 06 | [本地目录治理-Dev-Environment.md](06-本地目录治理-Dev-Environment.md) | ✅ 有效 | `I:\ai-studybuddy-*` 七目录职责、外部试炼场与单机数据边界 |
| 07 | [文档策略-Design-Docs-Strategy.md](07-文档策略-Design-Docs-Strategy.md) | ✅ 有效 | 文档分层、子系统文档触发条件 |
| 08 | [共同底座架构-Architecture.md](08-共同底座架构-Architecture.md) | ✅ 有效 | 共同底座最小架构与 Exam/KnowledgeModule 未来数据边界（S1 开工前必读） |
| 09 | [测试验收计划-Test-Plan.md](09-测试验收计划-Test-Plan.md) | ✅ 有效 | Phase 0.5 历史 smoke test、Phase 0.7 Windows 原生验证与 Phase 0.8 验收标准 |
| 10 | [后端开发规范-Backend-Guidelines.md](10-后端开发规范-Backend-Guidelines.md) | ✅ 有效 | 后端目录结构、SQLite 约定、Adapter 输出、日志规范、环境变量约定 |

---

## 一点五、代码与试炼场边界

- `I:\ai-studybuddy` 是唯一主系统 Git 仓库；这里只保存有效设计文档、正式实现和可审计结论。
- `I:\ai-studybuddy-composer` 是独立的本机组件试炼场，不加入主仓库 workspace，不作为主系统源码目录。
- 试炼场中的 `.env.local`、`.venv`、`node_modules`、测试输出、真实凭据和临时素材不得复制或提交到主仓库；通过验证的能力必须先回填 `04`、`08`、`09`，再由 Phase 0.8 重新以 Adapter 方式实现。
- 试炼场 README 属于本机操作说明；它不是主仓库的 Git 跟踪文件。正式产品结论以本索引登记的编号文档为准。

---

## 二、子系统轻量 PRD 触发规则

| 子系统 | PRD 文档 | 是否已创建 | 触发条件 |
|---|---|---|---|
| S1 学习节奏 | `subsystems/03-S1学习节奏子系统PRD-StudyRhythm.md` | ✅ 已创建 | Phase 0.8 必需 |
| S2 资料笔记 | `subsystems/03-S2-资料笔记子系统PRD-NoteBuilder.md` | ✅ 已创建 | Phase 0.8 开始开发 S2 前触发 |
| S3 限时练习 | `subsystems/S3-限时练习子系统PRD-PracticeRunner.md` | 📅 未创建 | S2 MVP 完成后触发 |
| S4 错题改错 | `subsystems/S4-错题改错子系统PRD-ErrorFixer.md` | 📅 未创建 | S3 MVP 完成后触发 |
| S5 期末冲刺 | `subsystems/S5-期末冲刺子系统PRD-ExamCrammer.md` | 📅 未创建 | Phase 2 触发 |
| S6 家长观察 | `subsystems/S6-家长观察子系统PRD-ParentReport.md` | 📅 未创建 | Phase 1 后期、准备正式发送家长报告前触发 |
| S7 课堂采集 | `subsystems/S7-课堂采集子系统PRD-ClassCapture.md` | 📅 未创建 | Phase 1.5 触发 |

---

## 三、未来文档触发条件

| 文档 | 触发条件 | 当前状态 |
|---|---|---|
| 10-后端开发规范-Backend-Guidelines.md | 写第一个后端服务 / Adapter / API / Worker 前 | ✅ 已创建 |
| 11-前端开发规范-Frontend-Guidelines.md | 写第一个正式前端页面前 | 未触发 |
| 12-开发规范-Dev-Rules.md | 多 AI / 多分支 / 多人协作时 | 未触发 |
| 13-部署运维指南-Deployment.md | Phase 1 完成后准备部署时 | 未触发 |
| 14-安全与隐私-Security-Privacy.md | Phase 1 后期或真实家庭试用前 | 未触发 |

**重要**：不满足触发条件，不得提前创建文档。

---

## 四、旧草稿归档

旧版"大一统"设计文档已归档到：

```
I:\ai-studybuddy-backup\system-design-docs-draft_2026-07-07_125549.zip
```

归档原因：旧设计 1487 行架构文档 + 20+ 张表一次性设计，超出个人开发者认知边界。

归档策略：
- 旧草稿只作参考，不作当前 SoT；
- 如需参考旧设计，只搬思路，不搬旧文档结构；
- 每完成一个重建阶段，打一个新的 zip 备份。

---

## 五、文档门禁规则

AI Agent 和开发者新增任何设计文档前，必须执行以下步骤：

### 5.1 文档创建前检查清单

- [ ] 先读 `docs/00-文档索引-Index.md`（本文件）；
- [ ] 检查目标文档是否已存在；
- [ ] 检查是否满足本文件中写明的触发条件；
- [ ] 不满足触发条件：不创建，只说明"还不到创建时机"；
- [ ] 满足触发条件：按 `NN-中文标题-English-Title.md` 命名规范创建；
- [ ] 同一次修改必须更新本文件索引表。

### 5.2 文档命名规范

正式文档必须符合：

```
NN-中文标题-English-Title.md
```

示例：
- `01-总PRD-产品需求-Product-Requirements.md`
- `08-共同底座架构-Architecture.md`

子系统文档放在 `subsystems/` 目录下，命名规范：
- `subsystems/03-S1学习节奏子系统PRD-StudyRhythm.md`
- `subsystems/03-S2-资料笔记子系统PRD-NoteBuilder.md`

### 5.3 提交前验证

```powershell
# 检查文档命名、索引登记、旧草稿误恢复
powershell -ExecutionPolicy Bypass -File scripts\check-docs-governance.ps1

# 检查空白行和行尾空格
git diff --check
```

---

## 六、文档阅读顺序

### 6.1 第一次接触本项目

1. 本文件（00-文档索引）；
2. [01-总PRD-产品需求](01-总PRD-产品需求-Product-Requirements.md)；
3. [02-七子系统地图](02-七子系统地图-Scenario-Systems.md)；
4. [07-文档策略](07-文档策略-Design-Docs-Strategy.md)。

### 6.2 准备开发第一个子系统

1. [04-开发任务清单](04-开发任务清单-Todo-List.md)；
2. [08-共同底座架构](08-共同底座架构-Architecture.md)；
3. [05-开源组件装配](05-开源组件装配-Open-Source-Foundation.md)；
4. [subsystems/03-S1学习节奏子系统PRD](subsystems/03-S1学习节奏子系统PRD-StudyRhythm.md)。

### 6.3 准备开发 S2 资料笔记

1. 重读 [08-共同底座架构](08-共同底座架构-Architecture.md)；
2. 创建 `subsystems/03-S2-资料笔记子系统PRD-NoteBuilder.md`；
3. 在外部 `I:\ai-studybuddy-composer` 先调通 pdf-parse/RapidOCR/Markmap；
4. 开工。

---

## 七、AI Agent 专用规则

### 7.1 每次任务开始前

1. 先读 `docs/00-文档索引-Index.md`；
2. 确认当前产品事实以 `01-总PRD` 和 `02-七子系统地图` 为准；
3. 旧归档草稿不作为当前执行依据。

### 7.2 新增设计文档前

1. 检查是否满足本文件中的触发条件；
2. 不满足：不创建，向用户说明"还不到创建时机"；
3. 满足：按命名规范创建，并同步更新本文件索引表。

### 7.3 禁止行为

- ❌ 不要凭记忆新建文档；
- ❌ 不要从旧 zip 直接恢复旧稿到 `docs/`；
- ❌ 不要硬编码任何盘符路径（例如 `I:\...`）到未来业务代码中；
- ❌ 不要跳过文档门禁规则。

---

## 八、版本历史

| 版本 | 日期 | 变更 |
|---|---|---|
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

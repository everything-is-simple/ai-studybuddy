# AI StudyBuddy 文档索引 Index

> **项目根目录**：`G:\ai-studybuddy`
> **文档目录**：`G:\ai-studybuddy\docs`
> **最后更新**：2026-07-07
> **当前路线**：共同底座 + 七个场景子系统。
> **重要提醒**：旧草稿文档已经移出主 `docs` 目录，并归档到 `G:\ai-studybuddy-backup\system-design-docs-draft_*.zip`。除非用户明确要求查旧稿，否则 AI 不应再按旧稿执行。

---

## 1. 当前有效文档（按重要性排序）

`00` 是目录入口，不参与正文重要性排名。真正的系统设计文档从 `01` 开始。

| 排名 | 文件 | 中文用途 | 状态 |
|---|---|---|---|
| 00 | `G:\ai-studybuddy\docs\00-文档索引-Index.md` | 文档入口：告诉人和 AI 应该读哪些文件、不该读哪些旧稿 | **当前有效** |
| 01 | `G:\ai-studybuddy\docs\01-总PRD-产品需求-Product-Requirements.md` | 总 PRD：产品目标、七个场景子系统、MVP 边界、AI 边界 | **当前有效** |
| 02 | `G:\ai-studybuddy\docs\02-七子系统地图-Scenario-Systems.md` | 七个子系统地图：命名、边界、依赖、开发顺序 | **当前有效** |
| 03 | `G:\ai-studybuddy\docs\subsystems\03-S1学习节奏子系统PRD-StudyRhythm.md` | 第一个子系统 PRD：学习节奏 StudyRhythm | **当前有效** |
| 04 | `G:\ai-studybuddy\docs\04-开发任务清单-Todo-List.md` | 开发任务清单：共同底座 + 七子系统逐个完成 | **当前有效** |
| 05 | `G:\ai-studybuddy\docs\05-开源组件装配-Open-Source-Foundation.md` | 开源组件先行装配、组件能力卡、成熟组件清单 | **当前有效，后续按七子系统补充** |
| 06 | `G:\ai-studybuddy\docs\06-本地目录治理-Dev-Environment.md` | 本地目录治理：composer/data/day-study/logs/tmp/backup | **当前有效** |
| 07 | `G:\ai-studybuddy\docs\07-文档策略-Design-Docs-Strategy.md` | 文档策略：是否每个子系统写文档、最少需要几份文档 | **当前有效** |

---

## 2. 现在这些是不是全部系统文档？

**是。对当前阶段来说，这些就是全部有效系统文档。**

更准确地说：

```text
当前有效系统文档 = 上表 00-07
旧草稿系统文档 = 只在 backup zip 中，不在主 docs 中
未来文档 = 等真正要开发对应模块时，再按七子系统路线新建
```

当前不要再恢复旧版：

```text
ARCHITECTURE.md
backend-guidelines.md
buglist.md
dev-rules.md
frontend-guidelines.md
lessons.md
test-plan.md
tutorial-one-sentence-ai-app.md
```

这些旧文件已经归档，不再作为当前设计依据。

---

## 3. 已归档旧草稿文档

旧稿归档包：

```text
G:\ai-studybuddy-backup\system-design-docs-draft_*.zip
```

旧稿使用规则：

- 默认不读；
- 默认不恢复；
- 只在用户明确说“参考旧稿某一段”时打开；
- 参考后也必须改写进新文档，不能直接把旧稿放回主 `docs`。
- 可参考的旧稿精华包括：AI Provider Registry、格式转换 Pipeline、错题艾宾浩斯机制、原始素材清理策略、AI Key 混合策略；
- 这些内容只能在对应子系统或共同底座触发后“摘取重写”，不能整段恢复旧文档。

---

## 4. 推荐阅读顺序

```text
00-文档索引-Index.md
01-总PRD-产品需求-Product-Requirements.md
02-七子系统地图-Scenario-Systems.md
subsystems/03-S1学习节奏子系统PRD-StudyRhythm.md
04-开发任务清单-Todo-List.md
05-开源组件装配-Open-Source-Foundation.md
06-本地目录治理-Dev-Environment.md
07-文档策略-Design-Docs-Strategy.md
```

---

## 5. 当前开发原则

- 不是一个巨型系统一次做完，而是七个场景子系统逐个完成。
- 共同底座只放跨子系统能力。
- 每个子系统开工前写 2-5 页轻量 PRD。
- 当前阶段已经足够，不要再把旧草稿文档放回主目录。
- 成熟开源组件先在 `G:\ai-studybuddy-composer` 跑通，再封装 Adapter 接入主系统。

---

## 6. 未来文档预留编号与创建触发条件

以后新增文档必须按“数字 + 中文 + 英文”命名：

```text
NN-中文标题-English-Title.md
```

**硬规则**：没到触发条件，不创建空文档；到了触发条件，先创建对应规范，再继续写代码或调组件。

| 编号 | 预留文件名 | 当前状态 | 触发条件 |
|---|---|---|---|
| 08 | `08-共同底座架构-Architecture.md` | 预留 | 开始设计/实现多个子系统共用的数据模型、队列、文件存储、AI Provider、Adapter 时创建；如果 S1 开工需要定义 Course/StudyTask/StudyEvent、数据库迁移、统一 API 响应，也视为触发 |
| 09 | `09-测试验收计划-Test-Plan.md` | 预留 | Phase 0.5 开始调通第一个开源组件 smoke test 前创建 |
| 10 | `10-后端开发规范-Backend-Guidelines.md` | 预留 | 开始写第一个后端服务、Adapter、API、Worker 前创建 |
| 11 | `11-前端开发规范-Frontend-Guidelines.md` | 预留 | 开始写第一个正式前端页面前创建 |
| 12 | `12-开发规范-Dev-Rules.md` | 预留 | 项目进入多人/多 AI/多分支协作开发前创建 |

---

## 7. AI 新增文档必须遵守的流程

任何 AI 或贡献者收到“新增/恢复/重写文档”任务时，必须按下面流程执行：

```text
收到任务
  ↓
先读 00-文档索引-Index.md
  ↓
看目标文档是否已存在
  ↓
看是否满足触发条件
  ↓
不满足：不创建，只说明还不到时候
  ↓
满足：创建文档
  ↓
更新 00-文档索引-Index.md
  ↓
运行 scripts/check-docs-governance.ps1
  ↓
提交
```

补充规则：

- 不允许凭记忆创建文档；
- 不允许从旧 zip 直接恢复旧稿到 `docs`；
- 新文档创建后，必须在本索引的“当前有效文档”或“预留编号”中同步登记；
- 子系统文档放入 `docs/subsystems`，也必须遵守编号和索引登记规则；
- 如果触发条件不明确，先在回复中说明“尚不到创建时机”，不要创建空壳文档。

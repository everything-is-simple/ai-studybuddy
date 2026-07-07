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

## 6. 未来如果需要新增文档

以后新增文档也按“数字 + 中文 + 英文”命名，例如：

```text
08-共同底座架构-Architecture.md
09-测试验收计划-Test-Plan.md
10-后端开发规范-Backend-Guidelines.md
11-前端开发规范-Frontend-Guidelines.md
12-开发规范-Dev-Rules.md
```

但这些要等真正需要时重写，不要从旧稿直接恢复。

# AI StudyBuddy 文档索引

> **项目根目录**：`G:\ai-studybuddy`
> **文档目录**：`G:\ai-studybuddy\docs`
> **最后更新**：2026-07-07
> **当前路线**：共同底座 + 七个场景子系统。旧草稿已归档到 `G:\ai-studybuddy-backup\system-design-docs-draft_*.zip`。

---

## 当前单一事实来源（SoT）

| 顺序 | 文件 | 用途 | 状态 |
|---|---|---|---|
| 1 | `G:\ai-studybuddy\docs\PRD.md` | 总 PRD：产品目标、七个场景子系统、MVP 边界、AI 边界 | **当前有效** |
| 2 | `G:\ai-studybuddy\docs\scenario-systems.md` | 七个子系统地图：命名、边界、依赖、开发顺序 | **当前有效** |
| 3 | `G:\ai-studybuddy\docs\design-docs-strategy.md` | 文档策略：是否每个子系统写文档、最少需要几份文档 | **当前有效** |
| 4 | `G:\ai-studybuddy\docs\subsystems\S1-study-rhythm-PRD.md` | 第一个子系统 PRD：学习节奏 StudyRhythm | **当前有效** |
| 5 | `G:\ai-studybuddy\docs\dev-environment.md` | 本地目录治理：composer/data/day-study/logs/tmp/backup | **当前有效** |
| 6 | `G:\ai-studybuddy\docs\open-source-foundation.md` | 开源组件先行装配、组件能力卡、成熟组件清单 | **当前有效，后续按七子系统补充** |

---

## 待按七子系统路线重写的旧文档

以下文档来自旧草稿体系，已经被 zip 归档。它们可以参考，但如果与新 PRD 冲突，以 `PRD.md` 和 `scenario-systems.md` 为准。

| 文件 | 当前处理方式 |
|---|---|
| `G:\ai-studybuddy\docs\ARCHITECTURE.md` | 待重写为“共同底座 + 七子系统架构” |
| `G:\ai-studybuddy\docs\todo-list.md` | 待重写为“按子系统逐个完成”的任务清单 |
| `G:\ai-studybuddy\docs\test-plan.md` | 待重写为“每个子系统独立验收 + 组合验收” |
| `G:\ai-studybuddy\docs\backend-guidelines.md` | 可继续参考路径/Adapter 规范，后续按子系统补 API |
| `G:\ai-studybuddy\docs\frontend-guidelines.md` | 可继续参考 UI 原则，后续按子系统补页面 |
| `G:\ai-studybuddy\docs\dev-rules.md` | 可继续参考开发规范 |
| `G:\ai-studybuddy\docs\lessons.md` | 持续记录 |
| `G:\ai-studybuddy\docs\buglist.md` | 持续记录 |

---

## 推荐阅读顺序

```text
1. PRD.md
2. scenario-systems.md
3. design-docs-strategy.md
4. subsystems/S1-study-rhythm-PRD.md
5. dev-environment.md
6. open-source-foundation.md
```

---

## 快速原则

- 不是一个巨型系统一次做完，而是七个场景子系统逐个完成。
- 共同底座只放跨子系统能力。
- 每个子系统开工前写 2-5 页轻量 PRD。
- 个人开发最少 5 份核心文档：总 PRD、子系统地图、架构、任务清单、测试验收。
- 成熟开源组件先在 `G:\ai-studybuddy-composer` 跑通，再封装 Adapter 接入主系统。

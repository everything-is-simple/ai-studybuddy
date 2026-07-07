# AI StudyBuddy 文档索引

> **项目根目录**：`G:\ai-studybuddy`
> **文档目录**：`G:\ai-studybuddy\docs`
> **最后更新**：2026-07-07
> **当前路线**：共同底座 + 七个场景子系统。
> **重要提醒**：旧草稿文档已经移出主 `docs` 目录，并归档到 `G:\ai-studybuddy-backup\system-design-docs-draft_*.zip`。除非用户明确要求查旧稿，否则 AI 不应再按旧稿执行。

---

## 1. 当前有效文档（唯一应优先读取）

当前 `docs` 目录只保留正在使用的系统设计 SoT，避免旧文档误导人和 AI。

| 顺序 | 文件 | 用途 | 状态 |
|---|---|---|---|
| 1 | `G:\ai-studybuddy\docs\PRD.md` | 总 PRD：产品目标、七个场景子系统、MVP 边界、AI 边界 | **当前有效** |
| 2 | `G:\ai-studybuddy\docs\scenario-systems.md` | 七个子系统地图：命名、边界、依赖、开发顺序 | **当前有效** |
| 3 | `G:\ai-studybuddy\docs\design-docs-strategy.md` | 文档策略：是否每个子系统写文档、最少需要几份文档 | **当前有效** |
| 4 | `G:\ai-studybuddy\docs\subsystems\S1-study-rhythm-PRD.md` | 第一个子系统 PRD：学习节奏 StudyRhythm | **当前有效** |
| 5 | `G:\ai-studybuddy\docs\dev-environment.md` | 本地目录治理：composer/data/day-study/logs/tmp/backup | **当前有效** |
| 6 | `G:\ai-studybuddy\docs\open-source-foundation.md` | 开源组件先行装配、组件能力卡、成熟组件清单 | **当前有效，后续按七子系统补充** |
| 7 | `G:\ai-studybuddy\docs\todo-list.md` | 新任务清单：共同底座 + 七子系统逐个完成 | **当前有效** |

---

## 2. 已归档旧草稿文档

以下旧文档已经从主 `docs` 目录移除，避免继续误导开发：

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

它们不再是当前系统设计依据。需要查看旧稿时，只能去归档包：

```text
G:\ai-studybuddy-backup\system-design-docs-draft_*.zip
```

---

## 3. 推荐阅读顺序

```text
1. PRD.md
2. scenario-systems.md
3. design-docs-strategy.md
4. subsystems/S1-study-rhythm-PRD.md
5. dev-environment.md
6. open-source-foundation.md
7. todo-list.md
```

---

## 4. 当前开发原则

- 不是一个巨型系统一次做完，而是七个场景子系统逐个完成。
- 共同底座只放跨子系统能力。
- 每个子系统开工前写 2-5 页轻量 PRD。
- 个人开发最少 5 份核心文档：总 PRD、子系统地图、架构、任务清单、测试验收。
- 当前架构、测试、前后端规范文档还没有按七子系统路线重写；未重写前不要引用旧稿。
- 成熟开源组件先在 `G:\ai-studybuddy-composer` 跑通，再封装 Adapter 接入主系统。

---

## 5. 下一批应该重建的文档

按顺序重建，不要一次性写回一大堆旧文档：

| 顺序 | 新文档 | 目标 |
|---|---|---|
| 1 | `ARCHITECTURE.md` | 重写为“共同底座 + 七子系统架构” |
| 2 | `test-plan.md` | 重写为“每个子系统独立验收 + 组合验收” |
| 3 | `backend-guidelines.md` | 重写为“共同底座 API + 子系统 Adapter 规范” |
| 4 | `frontend-guidelines.md` | 重写为“七子系统页面导航与最小页面集” |
| 5 | `dev-rules.md` | 重写为“个人开发 + AI 协作 + 防旧稿污染规则” |

没有重写完成的文档，不应该出现在主 `docs` 目录。

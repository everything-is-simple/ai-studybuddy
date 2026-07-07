# 仓库协作指南

## 项目结构与模块组织

本仓库当前是“文档先行”阶段，当前有效设计依据全部放在 `docs/`。

- `docs/00-文档索引-Index.md`：必须先读；列出当前有效文档、归档旧稿和未来文档触发条件。
- `docs/01-总PRD-产品需求-Product-Requirements.md`：产品目标、MVP 边界、AI 使用边界。
- `docs/02-七子系统地图-Scenario-Systems.md`：七个场景子系统、边界、依赖关系。
- `docs/subsystems/03-S1学习节奏子系统PRD-StudyRhythm.md`：第一个子系统 PRD。
- `docs/04-开发任务清单-Todo-List.md`：阶段任务、文档门禁、开发顺序。
- `docs/05-开源组件装配-Open-Source-Foundation.md`：成熟开源组件先行装配规则。
- `docs/06-本地目录治理-Dev-Environment.md`：`G:\ai-studybuddy-*` 本地目录职责。
- `docs/07-文档策略-Design-Docs-Strategy.md`：文档分层和子系统文档策略。

旧草稿已归档到 `G:\ai-studybuddy-backup`，除非用户明确要求，不要恢复到 `docs/`。

## 构建、测试与开发命令

当前还没有业务代码，因此暂无正式 build/test 命令。常用检查：

```powershell
git status --short
powershell -ExecutionPolicy Bypass -File scripts\check-docs-governance.ps1
git diff --check
```

`check-docs-governance.ps1` 用于检查文档命名、索引登记、旧草稿误恢复等问题。

## 编码风格与命名规范

文档使用 Markdown，标题清楚，段落简短，优先写可执行规则。正式文档命名必须符合：

```text
NN-中文标题-English-Title.md
```

示例：

```text
01-总PRD-产品需求-Product-Requirements.md
05-开源组件装配-Open-Source-Foundation.md
```

本项目中文优先，英文只作辅助。引用本地路径时尽量使用完整 Windows 路径，例如 `G:\ai-studybuddy\docs`。

## 测试与验收要求

文档修改后至少执行：

- `powershell -ExecutionPolicy Bypass -File scripts\check-docs-governance.ps1`
- `git diff --check`

如后续加入业务代码，再在本文件补充对应测试框架、覆盖率要求和测试命名规则。

## 提交与 PR 规范

提交信息沿用当前风格：

```text
docs: add document creation governance
docs: number active design documents
```

PR 或变更说明应包含：

- 修改了哪些文档；
- 为什么修改；
- 做了哪些验证；
- 如果涉及流程图或 UI，再补截图或渲染说明。

## AI Agent 专用规则

AI 每次处理仓库任务前，必须先读 `docs/00-文档索引-Index.md`。当前产品事实以 `docs/01-*` 和 `docs/02-*` 为准。旧归档草稿不能作为当前执行依据。

新增任何设计文档前，必须遵守文档门禁：

1. 先读 `docs/00-文档索引-Index.md`。
2. 检查目标文档是否已经存在。
3. 检查是否满足索引中写明的触发条件。
4. 不满足触发条件：不创建，只说明“还不到创建时机”。
5. 满足触发条件：按 `NN-中文标题-English-Title.md` 创建。
6. 同一次修改必须更新 `docs/00-文档索引-Index.md`。
7. 提交前必须运行 `scripts/check-docs-governance.ps1`。

不要凭记忆新建文档，不要从旧 zip 直接恢复旧稿到 `docs/`，不要硬编码 `G:\...` 路径到未来业务代码中。

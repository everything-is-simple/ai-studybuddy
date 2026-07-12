# 仓库协作指南

**版本**：v0.01

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

## AI StudyBuddy 任务执行标准工作流

这个流程已经在 phase0.8 T03 t04 t04A 完整走通，作为后续任务的默认执行方式：

1. **读文档、定范围**
   - 先读 `docs/00-文档索引-Index.md` 和相关设计文档（04 任务清单、08 架构、10 后端规范等）
   - 确认触发条件、现有代码状态和边界

2. **出行动计划**
   - 每一个任务实现前，必须创建该任务的行动计划，并统一存放到 `.plans/` 目录（例如 `.plans/phase0.8-task04B-plan.md`）
   - 用 CreatePlan 输出详细计划：目标、文件路径、接口设计、测试策略、治理步骤
   - 提交给 Claude 审查，根据反馈修订（如路径 normalize、multer 限制、文件状态等）
   - 用户批准后进入实现

3. **执行实现**
   - 用 TodoWrite 拆分任务并逐项完成
   - 编码遵循项目规范：路径走 `paths.ts`、环境变量走 `env.ts`、Adapter 输出格式、API 信封、中文优先

4. **验证**
   - `pnpm type-check`
   - `pnpm build`
   - `pnpm test`
   - 必要时做手动 smoke test

5. **审查与修复**
   - GPT 代码审查
   - 修复边界问题并新增回归测试
   - 重新跑验证

6. **收尾**
   - 更新 `docs/04-开发任务清单-Todo-List.md`
   - 运行 `scripts/check-docs-governance.ps1` 和 `git diff --check`
   - 提交并推送

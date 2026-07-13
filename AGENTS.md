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

这个流程已经在 phase0.8 T03 T04 T04A T06 T07 完整走通，作为后续所有任务的默认执行方式。**每一步都不可省略。**

### 第一阶段：准备

**Step 1 — 读文档、定边界**

- 先读 `docs/00-文档索引-Index.md` 获得全局视图
- 再读相关设计文档：04 任务清单、子系统 PRD、08 架构（若已存在）、10 后端规范（若已存在）
- 确认任务触发条件已满足、现有代码状态、子系统归属和 API/Schema 边界

**Step 2 — 检查文档门禁**

- 确认本任务是否需要新建设计文档（子系统 PRD、架构文档等）
- 若需要：检查触发条件是否满足；满足才创建，并同步更新索引
- 若不需要：记录"文档无需变更"继续

**Step 3 — 编写 `.plans/` 计划**

- 在 `.plans/` 目录创建本任务计划文件，命名示例：`.plans/phase0.8-t07-s2-core-api-plan.md`
- 计划必须包含：目标描述、涉及文件路径、接口/类型设计、测试策略、治理步骤
- 计划写完后提交给用户审查

**Step 4 — Claude 审查计划**

- 针对计划中的设计决策逐条提出问题或风险（如路径处理、事务边界、状态机兜底等）
- 给出具体修改建议

**Step 5 — 修订并获用户批准**

- 根据审查反馈修订计划
- 用户明确批准后，方可进入实现阶段

### 第二阶段：实现

**Step 6 — 拆分任务、逐项实现**

- 用 TaskCreate/TaskUpdate 把计划拆成可执行的子任务
- 每完成一项立即标记完成，不批量处理
- 编码遵循项目规范：路径走 `paths.ts`、环境变量走 `env.ts`、统一 API 信封 `{ success, data, error }`、中文优先

**Step 7 — 编写测试**

- 对每个新增接口/功能编写对应测试（集成测试优先，不 mock DB）
- 测试文件命名：`packages/backend/test/<feature>-api.test.mjs`

### 第三阶段：验证

**Step 8 — type-check**

```bash
pnpm type-check
```

必须零错误才能继续。

**Step 9 — build**

```bash
pnpm -r --filter backend run build
```

必须零错误才能继续。

**Step 10 — test**

```bash
pnpm test
```

所有测试通过才能继续。

**Step 11 — smoke test**

- 启动后端：`pnpm -r --filter backend run dev`
- 用 curl / HTTP 客户端手动验证核心路径（上传、查询、状态流转等）
- 记录验证结果

### 第四阶段：审查与收尾

**Step 12 — GPT 代码审查 → 修复 → 回归**

- 把本次变更的核心代码贴给 GPT 做独立代码审查
- 针对审查发现的边界问题修复，并补回归测试
- 重新跑 Step 8–11

**Step 13 — 更新任务清单和文档**

- 在 `docs/04-开发任务清单-Todo-List.md` 标记本任务完成
- 若本任务产生了新文档，确认索引已更新

**Step 14 — 文档治理检查**

```bash
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
```

必须通过才能提交。

**Step 15 — git diff 检查**

```bash
git diff --check
```

无尾部空白、无空白行问题才能提交。

**Step 16 — 提交并交付说明**

- 按 `type(scope): 中文描述` 格式提交
- 在对话中给出交付说明：改了哪些文件、做了哪些验证、遗留问题（如有）

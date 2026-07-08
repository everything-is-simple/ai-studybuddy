# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 本仓库是什么

AI StudyBuddy 是一个个人规模的学生学习助手，规划为**一个共同底座 + 七个场景子系统（S1–S7）**。仓库当前处于**文档先行阶段**：还没有任何业务代码，只有 `docs/` 下的设计文档和一个治理脚本。当前所有工作都是在严格治理规则下编写/维护文档。所有文档和提交信息**中文优先**，英文只作辅助。

`AGENTS.md` 是面向人的协作指南，与本文件内容大量重叠；任一文件变更时，保持两者一致。

## 常用命令

目前还没有 build/test 工具链（没有 `package.json`，没有源码）。唯一的检查是针对文档的：

```bash
# 文档治理检查（命名、索引登记、旧草稿误恢复防护）—— 每次提交前必须运行
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1

# 空白行 / 行尾空格检查
git diff --check
```

将来引入业务代码时，其 build/lint/test 命令必须届时补充到此处。

## 文档治理（核心工作流）

`docs/00-文档索引-Index.md` 是单一事实来源（SoT）和导航中心。**开始任何任务前先读它。** 产品事实以 `docs/01-总PRD-*` 和 `docs/02-七子系统地图-*` 为准；归档的旧草稿永远不作为当前工作依据。

治理模型是**"开发动作触发文档，而不是反过来"**。新增任何设计文档前：

1. 先读 `docs/00-文档索引-Index.md`。
2. 检查目标文档是否已存在。
3. 检查其**触发条件**（列在索引和 `04-开发任务清单` 中）是否满足。
4. 不满足：**不要**创建 —— 说明"还不到创建时机"。
5. 满足：按下方命名规范创建。
6. 在**同一次修改**中，更新 `docs/00-文档索引-Index.md` 的索引表。
7. 提交前运行 `scripts/check-docs-governance.ps1`。

`check-docs-governance.ps1` 会机械地强制执行以上规则：`docs/` 下每个 `.md` 必须符合命名模式、必须以文件名登记在索引中、不得复用已归档的旧草稿名（如 `PRD.md`、`ARCHITECTURE.md`、`todo-list.md`），预留文档 `08-`–`12-` 若存在则必须已登记。检查失败会阻断提交。

### 命名规范

正式文档：`NN-中文标题-English-Title.md`（例如 `08-共同底座架构-Architecture.md`）。子系统 PRD 放在 `docs/subsystems/` 下（例如 `subsystems/03-S1学习节奏子系统PRD-StudyRhythm.md`）。

## 架构模型（代码开工后适用）

设计刻意采用渐进式，以控制在单个开发者的认知预算之内 —— 旧版"大一统"1487 行架构 + 20+ 张表正是因为一次性铺得太大而被归档。不要重新引入那种规模。

- **七个子系统**：S1 StudyRhythm、S2 NoteBuilder、S3 PracticeRunner、S4 ErrorFixer、S5 ExamCrammer、S6 ParentWindow、S7 ClassCapture。每个对应一个 `packages/<name>` 包。每个新功能必须精确归属于一个子系统；每个 PR 只主攻一个子系统。边界、依赖关系和开发顺序见 `docs/02-七子系统地图-*`。
- **渐进式 Schema**：只在某个子系统开工时才创建它需要的表。跨子系统字段放共同底座；业务字段留在其子系统内。绝不为尚未开工的子系统提前建表。主键统一用 UUID；时间字段用 `timestamptz`；每张表都有 `created_at`/`updated_at`。
- **Adapter 边界**：主系统绝不直接依赖开源组件的内部实现。每个组件先在 `composer` 试炼场跑通（见下），再封装成 Adapter，只暴露统一的输入/输出契约。规划中的底座契约（转换结果、AI 请求/响应、带 `success`/`data`/`error` 的统一 API 响应信封）定义在 `docs/08-共同底座架构-*`。
- **第一个里程碑（Phase 0.8）**：创建课程 → 上传 PDF/图片/文本 → 转为纯文本 → DeepSeek 生成结构化笔记 + 重点 + 思维导图 → 前端渲染。这界定了最小底座（S1 基础 + S2 核心）—— 不要把练习、错题本、家长面板、ASR、期末功能塞进来。
- **AI 路由**：DeepSeek 是默认文本 Provider；转换器输出纯文本，LLM 绝不作为主要的格式转换路径。Qwen/Kimi/GPT 在后续阶段前只是配置占位。

## 本地目录与组件约定

设计文档用 `G:\ai-studybuddy-*` 作为规范路径示例（本次检出恰好位于 `F:\` 下）。这些是面向未来代码的治理约定，不是仓库里实际存在的路径：

- 业务代码**绝不硬编码 `G:\...`（或任何绝对）路径** —— 一律从环境变量读取（`APP_ROOT`、`DATA_ROOT`、`STUDY_FILE_ROOT`、`LOG_ROOT`、`TMP_ROOT` 等）。只提交 `.env.example`（变量名，不含真实值）。
- 开源组件先在 `composer` 试炼场跑通 smoke test 并填写能力卡（`COMPONENT-CARD.md`），才能进入主系统。
- 运行数据、学习文件、日志、临时文件、备份隔离到各自独立的根目录。`TMP_ROOT` 可随时清空 —— 清空后系统必须仍能正常运行。日志绝不保存完整 API Key、完整学生隐私、完整答案。

完整的目录职责表见 `docs/06-本地目录治理-*`，组件接入门槛见 `docs/05-开源组件装配-*`。

## 提交与 PR 规范

提交信息沿用现有的 `docs: ...` 风格（例如 `docs: add document creation governance`）。PR/变更说明应写明改了哪些文档、为什么改、做了哪些验证。

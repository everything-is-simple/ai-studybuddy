# Phase 1-T00 Collaboration Baseline and Roadmap Implementation Plan

**Goal:** 修正 Phase 0.8 完成后的协作说明和文档事实，建立多 AI、多分支协作的统一规则源，并把 Phase 1 从阶段目标拆成有门禁、可执行的任务序列。

**Architecture:** 以新建的 `docs/12-开发规范-Dev-Rules.md` 作为工具无关的协作规则 SoT；`CLAUDE.md` 和 `AGENTS.md` 只保留各自入口、当前状态、常用命令和对 `docs/12` 的引用。`docs/00` 负责登记与触发状态，`docs/04` 负责执行顺序，`docs/07` 负责文档分层和 PRD 门禁事实。

**Tech Stack:** Markdown、PowerShell 文档治理脚本、Git。

**Status:** 已完成；文档交付已合并至 `master`（commit `ec536df`）。

---

## 1. 当前事实与边界

- Phase 0.8 T09 已通过，S1/S2 PRD 已创建且其 MVP 已实现；任何文档不得继续写“Phase 0.8 准备阶段”或“尚无业务代码”。
- S3 PRD 的触发条件已经满足，但 T00 只登记该事实和后续任务，不创建 S3 PRD；S4/S5/S6/S7 仍按各自门禁等待。
- 多 AI、多分支和隔离 worktree 已实际发生，`docs/12-开发规范-Dev-Rules.md` 的触发条件已满足，本任务创建并登记该文档。
- KaoBuddy 只作为只读产品与架构参考；许可证为 NOASSERTION，不复制源码、图片、文案或视觉资产。可吸收的是考试项目工作台、下一步引导、浏览器验收和变更追溯原则。
- 本任务不修改业务代码、Schema、API、Provider Router 或 UI；不把 T10/T11/S3 标为完成。
- `docs/09-测试验收计划-Test-Plan.md` 原计划不改；执行一致性搜索发现仍有 Phase 0.8 过期状态，因此只做最小文本修正，不改变验收事实。

## 2. 文件责任

| 文件                                       | 动作     | 单一责任                                                                    |
| ------------------------------------------ | -------- | --------------------------------------------------------------------------- |
| `docs/12-开发规范-Dev-Rules.md`            | 新建     | 工具无关的 16 步流程、多 Agent/分支/worktree、证据、隐私和提交规则 SoT      |
| `CLAUDE.md`                                | 重写     | Claude Code 的仓库入口、当前命令和精简 16 步门禁；引用 `docs/12` 的详细规则 |
| `AGENTS.md`                                | 重写     | 通用 Agent 入口、不可违反的仓库约束和精简 16 步门禁；不绑定特定工具名       |
| `docs/00-文档索引-Index.md`                | 更新     | 登记 docs/12、修正 S3 触发状态、维持未来文档门禁和版本记录                  |
| `docs/04-开发任务清单-Todo-List.md`        | 更新     | 修正当前进度，拆出 Phase 1-T00/T10/T11/T02/T03/T04 的执行顺序和门禁         |
| `docs/07-文档策略-Design-Docs-Strategy.md` | 更新     | 修正 S2 已创建、Phase 0.8 已完成、S3 可创建及其他 PRD 未触发的事实          |
| `docs/09-测试验收计划-Test-Plan.md`        | 最小更新 | 去除 Phase 0.8 可开始的过期表述，保留 T09 后续验收缺口                      |

## 3. 计划任务

### Task 0：批准后建立隔离执行环境

**Files:**

- Move plan into worktree: `.plans/phase1-t00-collaboration-baseline-and-roadmap-plan.md`

- [ ] **Step 1：从最新 master 创建隔离分支和 worktree**

  分支固定为 `codex/phase1-t00-docs`，worktree 固定放在 `I:\ai-studybuddy-tmp\worktrees\phase1-t00-docs`。创建前检查目标目录不存在、主 checkout 只有本计划文件这一项预期未跟踪变更；不得清理或覆盖用户改动。

- [ ] **Step 2：把已批准计划复制到 worktree 后清理主 checkout 草稿**

  使用 `apply_patch` 在 worktree 创建同内容计划文件，再使用 `apply_patch` 删除主 checkout 的未跟踪副本。确认主 checkout 回到干净 `master`，后续正式文档只在 worktree 修改。

### Task 1：建立工具无关的协作规则 SoT

**Files:**

- Create: `docs/12-开发规范-Dev-Rules.md`
- Modify: `docs/00-文档索引-Index.md`

- [ ] **Step 1：先登记文档身份和触发理由**

  在索引有效文档表加入编号 12，状态为“有效”；未来文档触发表将 12 改为“已创建（Phase 1-T00，多 AI/多分支已触发）”。S3 行改为“触发条件已满足，等待 Phase 1-T03 计划批准后创建”，S4–S7 保持未满足。

- [ ] **Step 2：创建 docs/12 的最小章节**

  固定包含：适用范围与 SoT 优先级、任务开始检查、16 步工作流、分支/worktree/提交规则、多 Agent 所有权、验证矩阵、浏览器验收、真实 Provider 隔离与脱敏、外部参考许可证边界、完成声明与交付格式。

- [ ] **Step 3：把流程改成工具无关语言**

  - Step 4 使用“独立计划审查”，不指定 Claude。
  - Step 6 使用“当前客户端可用的任务清单能力”，没有专用工具时用计划文件复选框，不要求 `TaskCreate/TaskUpdate`。
  - Step 12 使用“独立代码审查”，不指定 GPT；审查者不得直接替代测试证据。
  - UI 变更必须启动真实页面并做桌面/移动视口浏览器验证；API/数据库内部改动以集成测试和 smoke test 为主。

- [ ] **Step 4：锁定安全规则**

  明确：不提交 `.env.local`、API Key、Provider URL、资料正文、笔记正文、完整 UUID 或正式数据；真实 E2E 使用独立 `APP_DATA_ROOT`；只删除 run-id 白名单下的 tmp；不在业务代码硬编码盘符；外部 NOASSERTION 项目只借鉴思想。

### Task 2：收紧 CLAUDE.md 与 AGENTS.md

**Files:**

- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`

- [ ] **Step 1：统一当前项目状态**

  两份入口都写明 Phase 0.8 已完成，当前进入 Phase 1 准备；前后端、SQLite、S1/S2 API、资料转换、AI 笔记和最小前端均已存在。

- [ ] **Step 2：统一真实命令**

  至少列出：

  ```powershell
  $env:APP_DATA_ROOT = Join-Path $env:TEMP ("ai-studybuddy-test-" + [guid]::NewGuid())
  pnpm install
  pnpm type-check
  pnpm -r --filter backend run build
  pnpm -r --filter frontend run build
  pnpm test
  powershell -ExecutionPolicy Bypass -File scripts\check-docs-governance.ps1
  git diff --check
  ```

  注明该命令为本次进程生成仓库外、专属于本次 run 的数据目录；运行后端、测试或 smoke test 前必须提供隔离或明确批准的数据根 `APP_DATA_ROOT`，不得假设仓库内保存运行数据。

- [ ] **Step 3：移除过期和冲突内容**

  删除“尚无业务代码”“暂无正式测试”“Phase 0.8 准备阶段”、旧 `G:\`/`F:\` 环境描述、固定 `TaskCreate`、固定 Claude/GPT 审查者，以及“每个子系统必须立即拆成独立 package”这类尚未成为当前实现事实的表述。

- [ ] **Step 4：控制重复但保留自动加载门禁**

  两个入口都保留：必读顺序、当前状态、命令、最高优先级禁令、16 步的一行式编号清单和 `docs/12` 链接。详细步骤、分支策略、浏览器验证、证据格式和异常处理只在 docs/12 维护；这样既避免长篇复制，也保证工具自动载入入口时不会漏掉批准门禁。

### Task 3：拆解 Phase 1 路线图

**Files:**

- Modify: `docs/04-开发任务清单-Todo-List.md`
- Modify: `docs/07-文档策略-Design-Docs-Strategy.md`

- [ ] **Step 1：修正首页进度和文档事实**

  `docs/04` 顶部改为 Phase 0.8 已完成、Phase 1-T00 准备中；`docs/07` 改为 S1/S2 PRD 已存在且已实现，S3 触发条件满足，并把仍以“Phase 0.8 重新实现”为终点的流程图和阶段职责更新到 Phase 1 当前状态。

- [ ] **Step 2：按明确执行顺序登记 Phase 1 任务**

  使用以下名称并注明数字是追溯编号，真实执行顺序以本表为准：

  1. `Phase 1-T00`：协作基线与路线图，本任务。
  2. `Phase 1-T10`：S2 人工补文恢复闭环，继承 T09 候选编号。
  3. `Phase 1-T11`：S1 考试确认与学习任务浏览器闭环，继承 T09 候选编号。
  4. `Phase 1-T02`：Provider 健康熔断；现有 priority fallback 保留，补连续失败计数、冷却和测试，不称为重建 Router。
  5. `Phase 1-T03`：先创建并批准 S3 PRD，再实现最小限时练习；PRD 和代码必须分别经过门禁，不能在一份未批准文档中同时标完成。
  6. `Phase 1-T04`：S3 MVP 验收后才触发 S4 PRD 与错题改错。

- [ ] **Step 3：记录 KaoBuddy 可借鉴范围**

  把“考试项目工作台、倒计时/进度、总览→资料→计划→练习→查漏补缺→冲刺、每页下一步行动”列为产品候选；明确模拟考和临考速背仍属 S5/Phase 2，不因参考界面提前实现。

- [ ] **Step 4：保留未完成状态**

  T10/T11/T02/T03/T04 全部保持 `[ ]`；T00 只有在 Step 6–16 完成并提交后才能标 `[x]`。

### Task 4：文档审查与机械验证

**Files:**

- Review: all files listed in section 2

- [ ] **Step 1：一致性搜索**

  运行：

  ```powershell
  rg -n "Phase 0\.8 准备阶段|尚无业务实现|当前还没有业务代码|暂无正式 build/test|G:\\|F:\\|TaskCreate|TaskUpdate|Claude 审查|GPT 代码审查" CLAUDE.md AGENTS.md docs
  ```

  预期：入口和当前有效规则中不再存在过期状态或工具绑定；历史证据中合理出现的“GPT/Claude Provider”不作为误报。

- [ ] **Step 2：交叉核对任务门禁**

  核对 `docs/00`、`docs/04`、`docs/07`：S1/S2 已存在；S3 可创建但尚未创建；S4/S5/S6/S7 未触发；Phase 1 顺序一致。

- [ ] **Step 3：运行文档治理**

  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts\check-docs-governance.ps1
  ```

  预期输出：`Documentation governance check passed.`

- [ ] **Step 4：运行差异检查**

  ```powershell
  git diff --check
  git status --short
  git diff -- CLAUDE.md AGENTS.md docs/00-文档索引-Index.md docs/04-开发任务清单-Todo-List.md docs/07-文档策略-Design-Docs-Strategy.md docs/09-测试验收计划-Test-Plan.md docs/12-开发规范-Dev-Rules.md
  ```

  预期：无空白错误；差异只包含批准的文档、docs/09 过期状态最小修正和计划文件，不含业务代码、凭据或外部参考文件。

- [ ] **Step 5：独立审查后回归**

  让独立审查者重点检查：规则重复、SoT 冲突、任务越权提前触发、绝对路径误写、验证命令与 package scripts 不一致。修订后重新执行 Step 1–4。

### Task 5：提交与交付

**Files:**

- Commit: `.plans/phase1-t00-collaboration-baseline-and-roadmap-plan.md` and approved documentation files

- [ ] **Step 1：只暂存批准范围**

  ```powershell
  git add .plans/phase1-t00-collaboration-baseline-and-roadmap-plan.md CLAUDE.md AGENTS.md docs/00-文档索引-Index.md docs/04-开发任务清单-Todo-List.md docs/07-文档策略-Design-Docs-Strategy.md docs/09-测试验收计划-Test-Plan.md docs/12-开发规范-Dev-Rules.md
  git diff --cached --check
  ```

- [ ] **Step 2：提交**

  ```powershell
  git commit -m "docs(phase1): 更新协作基线与任务路线图"
  ```

- [ ] **Step 3：交付说明**

  汇报新增/更新文件、文档门禁结论、治理命令结果、Phase 1 执行顺序和未实现边界。默认不推送、不合并，除非用户另行明确授权。

## 4. 风险审查与修订结论

| 风险                                          | 修订结论                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 只在 docs/12 写流程会导致自动加载入口漏读门禁 | `CLAUDE.md`、`AGENTS.md` 各保留精简 16 步编号清单，docs/12 保存详细规则                   |
| 三份规则重复后再次漂移                        | 入口只保留摘要；状态、命令和详细流程分别由 docs/00、package scripts、docs/12 提供事实来源 |
| 数字顺序 T10/T11/T02 容易被误认为执行顺序     | 明确这些是历史追溯编号，并在 docs/04 单独维护“真实执行顺序”表                             |
| 参考项目无明确许可证                          | 只记录可借鉴原则，不复制源码、截图、文案、CSS token 或品牌资产                            |
| 更新命令仍可能让 Agent 用正式数据跑测试       | 所有运行命令前标出显式隔离 `APP_DATA_ROOT`，占位符不得直接执行                            |
| 文档任务被扩大为功能实现                      | 本任务只改文档；T10/T11/T02/T03/T04 保持未完成并分别走后续 16 步流程                      |
| 直接在 master 修改导致协作污染                | 批准后先创建 `codex/phase1-t00-docs` 隔离 worktree，再迁移计划并实施                      |

## 5. 验收标准

- `CLAUDE.md`、`AGENTS.md` 不再描述 Phase 0.8 准备态或无业务代码。
- `docs/12` 成为唯一完整协作流程规则源，入口文件不再复制两份 16 步正文。
- `docs/00` 正确登记 docs/12，并准确表达 S3 已触发、S4–S7 未触发。
- `docs/04` 给出明确 Phase 1 顺序，T10/T11/T02/T03/T04 均未伪称完成。
- `docs/07` 与索引、当前代码状态一致。
- 文档治理和 `git diff --check` 通过；Git 差异中没有业务代码、凭据、外部参考源码或图片。

## 6. 非目标

- 不创建 S3/S4/S5/S6/S7 PRD。
- 不实现人工补文、考试确认、任务创建、Provider 熔断或练习系统。
- 不重做前端、不复制 KaoBuddy 界面。
- 不执行真实 Provider 调用或正式 E2E。
- 不推送、不合并。

## 7. 执行补充记录

- 2026-07-15 执行一致性搜索时发现 `docs/09-测试验收计划-Test-Plan.md` 仍保留“Phase 0.8 可以开始”的过期表述；为满足 T00 协作基线目标，做最小文本修正，不改变 T09 验收事实。
- 2026-07-15：完成计划的 Step 6–16，交付 `CLAUDE.md`、`AGENTS.md`、`docs/00`、`docs/04`、`docs/07`、`docs/09` 和新建 `docs/12`；文档治理与差异检查通过，提交为 `docs(phase1): 更新协作基线与任务路线图`（`ec536df`）。

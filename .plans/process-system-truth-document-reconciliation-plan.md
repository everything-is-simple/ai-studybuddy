# 系统事实与文档收口计划

> **执行约束**：本计划只允许修改文档和任务状态表述。执行时必须使用 `superpowers:executing-plans`，并在每次写入前确认仍位于本独立 worktree；不得触碰 `H:\ai-studybuddy` 的脏工作区、业务代码、数据库、外部组件、Firewall、Docker、WSL 或真实 Provider。

**目标**：让任何人只读核心文档就能回答“系统为什么存在、为谁而做、现在有哪些已进入主线的能力、哪些只是外部候选证据、下一步是什么”，并消除 `H:\`/`I:\` 路径、S7 状态和主线/分支事实混写造成的歧义。

**范围**：`docs/00`、`docs/01`、`docs/02`、`docs/04`、`docs/06`，以及仅在需要时同步 `AGENTS.md`、`CLAUDE.md`；新增的仅是本计划与 `docs/04` 的文档收口任务行。

**非范围**：不实现 S7、AuralConverter、ASR Adapter、Schema、API、Worker、前端；不处理当前学期版本 8/9 的未提交问题；不开展 G2 Firewall 实测；不改变 Node 24 开发机已验证、用户机器待实机验收的既有主线结论。

**事实基线（执行前必须复核）**：

- 交付事实以执行时最新 `origin/master` 为准；本计划创建时为 `dbccbb5cffd3fa4f2f067a763dae0a0540fe22ce`。
- 当前产品主线：S1/S2/S3/S4/S5/S6 已完成并进入 `origin/master`；Phase 3 暂缓。
- S7：仅 PRD 已进入主线；外置 ASR/whisper.cpp 候选验证不等于产品接入。S7 Adapter、Schema、API、Worker、前端均未开始。
- G2：只有满足规则范围、运行前后无残留、隔离中真正调用固定 CLI 等完整证据的指定环境才可说 PASS；本次 Codex 非提升会话形成的记录是 BLOCKED，不得改写为 PASS。
- Node 24：开发机 Windows 原生部署路径已验证；用户电脑安装运行仍待目标机器实机验收。

---

### Task 1：建立一页可读的产品事实入口

**Files:**

- Modify: `docs/01-总PRD-产品需求-Product-Requirements.md`
- Modify: `docs/00-文档索引-Index.md`
- Test: `scripts/check-docs-governance.ps1`

- [ ] **Step 1: 在总 PRD 开头增加“系统一句话与当前边界”短节。**

写清以下固定内容：

```markdown
- 系统为一名在 Windows 本机学习、围绕课程和考试组织学习行动的学生而做。
- 家长不是系统操作者；家长只接收脱敏异步报告。
- 主线闭环是：学习节奏 → 资料笔记 → 练习 → 错题改错 → 考试冲刺；课堂采集 S7 尚未产品接入。
- 默认部署是学生电脑本机回环服务和本地数据，不提供公网入口或家长 Web 面板。
```

不得用“全部完成”“已支持课堂录音”或“用户电脑已验收”概括当前状态。

- [ ] **Step 2: 在文档索引中将该短节标为“读系统先读这里”，并保留 `docs/04` 是交付状态 SoT 的说明。**

要求索引明确分层：`docs/01` 回答产品目的与边界；`docs/02` 回答七子系统所有权；`docs/04` 只回答已合入主线的任务和证据；仓库外组件目录只保存候选试验资产。

- [ ] **Step 3: 核对与 S6、S7、默认部署相关的已有段落。**

只消除相互矛盾的重复表述；保留“家长不登录、无公网入口、无家长 Web 面板”“S7 待独立门禁”的产品边界。

- [ ] **Step 4: 验证。**

运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
```

预期：退出码 `0`。

### Task 2：把七子系统地图与任务清单对齐到主线事实

**Files:**

- Modify: `docs/02-七子系统地图-Scenario-Systems.md`
- Modify: `docs/04-开发任务清单-Todo-List.md`
- Test: 主线/任务分支关系与 Markdown 一致性搜索

- [ ] **Step 1: 在 `docs/04` 登记“系统事实与文档收口”纯文档任务。**

任务行必须写明：只收口状态与边界，不启动产品实现；执行计划是本文件；完成门槛是文档治理、差异检查、主线复验和推送。

- [ ] **Step 2: 修正 `docs/02` 的 S7 当前状态。**

把“尚未触发”改为精确状态：S7 产品接入尚未开始；S7 PRD 已完成；外部候选 ASR 验证存在但不授权装配。不得把候选 CLI、WSL、G2 或模型结果列为已实现的 S7 产品能力。

- [ ] **Step 3: 将 `docs/04` 的当前进度改为两个显式字段。**

采用如下语义而不是长段混写：

```markdown
- 主线已完成：只列已在 `origin/master` 的产品与部署事实。
- 候选/外部验证：只列外置组件的证据等级、适用环境和限制；明确“不是产品接入、不是用户机验收”。
```

对 S7 至少固定：`T01 PRD=完成`、`T02/T04=PARTIAL`、`T03=PASS`、`T05/T06=未启动`。对 G2 只保留环境限定结论；不把 WSL 单组合证据泛化为 Windows 或跨平台 PASS。

- [ ] **Step 4: 保留 Node 24 的已验证与待验收双重表述。**

在 `docs/04` 使用已有主线证据，不改变其边界：开发机 Windows 原生 + Node 24 已验证；用户电脑安装运行待目标机器实机验收；ASR/Docker/WSL 与该部署结论独立。

- [ ] **Step 5: 验证术语一致性。**

运行：

```powershell
Select-String -Path docs\00-*.md,docs\01-*.md,docs\02-*.md,docs\04-*.md -Pattern 'S7.*已完成|课堂录音.*已完成|用户电脑.*已验收|跨平台.*PASS'
```

预期：每一处命中都带环境和产品接入限定，不能出现无条件完成声明。

### Task 3：将机器盘符从产品事实中剥离

**Files:**

- Modify: `docs/06-本地目录治理-Dev-Environment.md`
- Modify: `docs/00-文档索引-Index.md`
- Modify: `docs/01-总PRD-产品需求-Product-Requirements.md`
- Modify: 仅限命中“规范性路径”的其他有效文档
- Test: 盘符与历史证据抽查

- [ ] **Step 1: 在 `docs/06` 定义逻辑根目录名称。**

定义并使用：`<repo-root>`、`<external-component-root>`、`<run-evidence-root>`、`<app-data-root>`。把产品规则写成逻辑位置和职责，不把 `H:\` 或 `I:\` 作为产品功能前提。

- [ ] **Step 2: 更新规范性路径引用。**

把总 PRD、索引和当前规范性段落中的硬编码 `I:\ai-studybuddy*` 改为逻辑根目录或 Windows 环境变量示例。保留历史验证记录中的绝对路径，并在首次出现处标注它们是“历史本机证据路径，不是安装要求”。

- [ ] **Step 3: 验证。**

运行：

```powershell
Get-ChildItem docs -Recurse -File -Filter '*.md' | Select-String -Pattern '[A-Z]:\\ai-studybuddy'
```

预期：剩余命中仅存在于标明为历史证据的记录，不再作为规范性安装路径或产品前提。

### Task 4：收口入口规则与验证证据

**Files:**

- Modify: `AGENTS.md`（仅高层状态或路径约束实际不一致时）
- Modify: `CLAUDE.md`（仅与 `AGENTS.md` 同一事实不一致时）
- Modify: `docs/12-开发规范-Dev-Rules.md`（仅需补充分层规则时）
- Test: 文档治理与 diff 检查

- [ ] **Step 1: 以 `docs/00`/`docs/01`/`docs/02`/`docs/04` 为准逐项比对入口文件。**

只同步以下层级事实：主线状态、S7 未接入、Phase 3 暂缓、外部组件不等于产品、用户机验收待办。删除入口文件中会导致“候选验证等于主线完成”的表述。

- [ ] **Step 2: 不因换盘符伪修改文件。**

识别 CRLF/LF 造成的 `git status` 噪声；只有存在语义内容差异才写入。不得为消除工作区显示而批量重写行尾。

- [ ] **Step 3: 在任务清单登记可复核证据。**

登记使用的 `origin/master` 提交、文档治理退出码、`git diff --check` 结果、主线复验提交和推送状态；不登记真实 API Key、真实用户资料、正式数据或不必要的完整运行日志。

### Task 5：独立复核、主线集成与交付

**Files:**

- Modify: 上述文件中实际发生语义修改的文件
- Test: 治理、差异、主线复验

- [ ] **Step 1: 自审范围。**

确认没有修改 `packages/`、`deployment/`、`scripts/`、组件目录、数据库、运行日志或本机防火墙；确认没有把 `G2=BLOCKED`、候选 ASR、WSL 单组合或开发机 Node 24 误写成用户机或产品完成。

- [ ] **Step 2: 运行纯文档验证。**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
git status --short --branch
```

预期：前三项退出码 `0`，且变更仅限计划中列出的文档。

- [ ] **Step 3: 提交、rebase、快进合并、主线复验和推送。**

严格执行仓库流程：在任务分支提交；`git fetch origin`；rebase 到最新 `origin/master`；仅可 fast-forward 合入 `master`；在 `master` 再跑文档治理与 `git diff --check`；推送 `origin/master`。任一步冲突或失败即停止，不强推、不 reset、不覆盖当前脏工作区。

---

## 计划自审

- **产品问题覆盖**：Task 1 明确“为什么存在、为谁做、主线闭环与非目标”；Task 2 明确当前完成与未完成；Task 3 解除 `H:\`/`I:\` 机器路径歧义；Task 4 防止入口规则重复制造冲突；Task 5 规定证据和主线完成口径。
- **事实边界**：计划不将外部 whisper.cpp 转写、G2、WSL 或 Node 24 开发机验证扩大为 S7 产品接入或用户机器验收。
- **写入边界**：不修改当前 `H:\ai-studybuddy` 脏工作区；仅在独立 worktree 的文档任务分支写入，且计划获批前不改动除本计划外的文件。
- **无占位符检查**：计划包含精确文件、命令、预期结果和禁止范围；没有以“稍后决定”替代关键门禁。

## 批准门槛

本计划获你明确批准后，才开始 Task 1–5 的文档修改、验证、提交和主线集成。批准不授权 S7 产品接入、G2 Firewall 规则、用户电脑验收或任何 Phase 3 工作。

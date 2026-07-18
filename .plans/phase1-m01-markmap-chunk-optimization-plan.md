# Phase 1-M01 执行计划：前端 Markmap 按需加载与构建 chunk 治理

**版本**：v2
**日期**：2026-07-18
**状态**：v2 已通过独立复审，待用户明确批准；未批准不得实施。
**任务登记**：`docs/04-开发任务清单-Todo-List.md` 的 Phase 1-M01 与“Phase 1 行动计划索引”。

---

## 1. 背景、目标与完成口径

### 1.1 已确认事实

- 当前前端构建已经将 `markmap-lib` 与 `markmap-view` 放入 Vite 的 `manualChunks.markmap`，但产物仍约为 **655.40 kB**（gzip 约 **235.73 kB**），超过 Vite 默认 **500 kB** 警告阈值。
- `NotePage` 已经是路由级懒加载页面，但它静态导入 `MindMap`；`MindMap` 又静态导入 Markmap。因此用户打开任意笔记页时，即使该笔记没有 `mindMap` 数据，也会下载 Markmap 渲染器。
- 问题包含两个层面：静态导入使无导图笔记过早下载渲染器；现有 `manualChunks.markmap` 又把 `markmap-lib`、`markmap-view` 及其依赖强行收拢为单一物理 chunk。仅动态导入不会保证该 655.40 kB 文件低于阈值；仅修改 `chunkSizeWarningLimit` 则只能隐藏告警。

### 1.2 目标

1. 当笔记没有 `mindMap` 时，不加载 Markmap 渲染器及其专用 chunk。
2. 当笔记包含 `mindMap` 时，延迟加载并正常展示现有思维导图；加载或渲染失败时保持中文可见降级反馈“暂无法展示思维导图”。
3. 在不抬高 Vite 告警阈值、不升级依赖的前提下，使前端构建不再报告 Markmap 超过 500 kB 的 chunk 警告。
4. 保持现有 Markdown、数学公式、知识模块与任务区域功能和 API 合同不变。

### 1.3 完成口径

- 前端构建输出不含 `Some chunks are larger than 500 kB after minification` 的 Markmap 警告；构建明细证明 Markmap 相关物理 chunk 均在默认阈值内，且不通过提高阈值实现。
- 无思维导图的笔记页不触发 `MindMap` 动态模块加载；有思维导图时显示加载状态并最终渲染，加载/渲染异常显示中文回退。
- 自动化测试、真实浏览器验收、类型检查、前端构建、全量测试、文档治理和 `git diff --check` 均通过。
- 完成后只在 `docs/04` 登记 M01 的分支、提交、验证和主线合入/推送事实；不得把分支结果描述成主线完成。

---

## 2. 范围与非目标

### 2.1 本任务范围

- `packages/frontend/src/pages/note-page.tsx`：移除 `MindMap` 静态导入，仅在 `note.mindMap` 存在时通过 `React.lazy` 和 `Suspense` 条件加载；提供符合现有中文界面的加载占位。
- `packages/frontend/src/components/mind-map.tsx`：只在为适配懒加载与稳定错误降级确有需要时作最小调整；保留现有初始化、更新和 unmount 时 `destroy()` 清理语义。
- 相关前端测试：覆盖无导图、含导图加载/成功、动态加载或渲染失败降级，并回归 Markdown、知识模块、关联任务区。
- `packages/frontend/vite.config.ts`：将现有合并的 `manualChunks.markmap` 改为按公开包族的函数式分组：`markmap-lib`/`markmap-html-parser` 归 transformer，`markmap-view` 与 `d3`/`d3-*` 归 runtime；保留既有 KaTeX/React Markdown 分组。不修改 `chunkSizeWarningLimit`，不按内部深层文件路径硬编码。
- 新增或更新必要的 Playwright 验收：用隔离 `APP_DATA_ROOT` 验证无导图笔记不请求 Markmap、含导图笔记可展示或中文降级，并保留现有笔记页关键区块。

### 2.2 明确非目标

- 不通过提高 `build.chunkSizeWarningLimit` 或过滤构建日志隐藏警告。
- 不升级 `markmap`、React、Vite、Rollup 或其他依赖；不按 `node_modules` 内部深层文件或单个 D3 子模块建立脆弱映射。为解决已确认的单块超限，允许按公开 npm 包族将 transformer 与 runtime/D3 分开。
- 不改变后端 API、SQLite schema、迁移、学期 current、课程/考试/任务/时间线隔离或 MindMap 数据格式。
- 不新增笔记编辑器、手工思维导图编辑、性能仪表盘、通用路由/导航重构或 Phase 2 性能基线。
- 不实施 T09B–T09E、每日首页、家长 Web 面板、S5、S7、S3 Worker、Phase 2 或 Phase 3。

---

## 3. 实施前核查与分支流程（获批后）

1. 确认计划分支仅包含本计划及文档登记；运行文档治理和 `git diff --check`，提交计划审查证据。
2. 用户明确批准后，获取最新远端事实：

   ```powershell
   git fetch origin
   git checkout master
   git pull --ff-only origin master
   git checkout -b codex/phase1-m01-markmap-chunk-optimization
   ```

3. 实现分支只能从更新后的 `origin/master` 创建；不在本计划分支写前端业务代码，不混入未跟踪文件、真实运行数据或其他任务变更。
4. 所有会写运行数据的浏览器或服务命令均设置：

   ```powershell
   $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-m01-markmap-chunk-optimization'
   ```

---

## 4. 批准后实施任务

### Task 1：先建立页面级动态加载的可测边界

**文件所有权**：`packages/frontend/src/pages/note-page.tsx` 及新增/相关 `packages/frontend/test/*note*` 测试。

1. 阅读现有 `NotePage` 的数据加载、错误展示和思维导图区块，复用页面现有错误/空态风格。
2. 删除 `MindMap` 的静态导入，以模块级 `lazy(() => import('../components/mind-map'))` 定义私有异步组件；不在路由外预取该模块。
3. 仅当 `note.mindMap` 存在时渲染导图区块，并用 `Suspense` 提供中文加载占位（例如“正在加载思维导图…”）。
4. 将异步导入失败与渲染异常纳入局部错误边界，显示既有中文降级“暂无法展示思维导图”；错误不能导致整个笔记页白屏。
5. 新增组件/页面测试：
   - 无 `mindMap` 时不调用动态 importer，也不出现导图加载/失败 UI；
   - 有 `mindMap` 时先出现加载占位，resolve 后调用渲染组件；
   - importer reject 或渲染组件抛错时显示中文降级；
   - Markdown、知识模块和关联任务在以上路径中仍可见。

### Task 2：保持 MindMap 生命周期与错误语义

**文件所有权**：`packages/frontend/src/components/mind-map.tsx` 与其相关测试（若 Task 1 的测试不足）。

1. 审查 `MindMap` 中 Markmap 的创建、数据更新与 `destroy()` 逻辑。
2. 只有在异步挂载或错误边界暴露出真实缺陷时才作最小修复；不得顺带改动样式、数据转换规则或后端字段。
3. 保持渲染失败中文回退；确保组件卸载后不会保留 SVG/实例或抛出未处理错误。
4. 为实际修复补充单测；若无需修改，记录该决定和现有组件回归测试证据。

### Task 3：按公开包族拆分物理 chunk，并验证真正消除警告

**文件所有权**：`packages/frontend/vite.config.ts`（只有确有必要时）。

1. 先执行前端 build，保留现有 `manualChunks.markmap`，检查 Markmap 是否已作为仅在 `mindMap` 路径访问时才请求的异步 chunk。
2. 若构建仍对单个 Markmap chunk 报 >500 kB 警告，基于 Rollup 产物图进行最小、可验证的拆分；每个配置项必须有明确依赖边界与测试/构建证据。
3. 不得改变 `chunkSizeWarningLimit`，不得用 `console`/脚本吞掉 warning。
4. 使用浏览器网络请求或 Playwright 路由记录，证明无导图笔记页不请求包含 `markmap`、`d3` 或 `MindMap` 的脚本；含导图页只在该区块加载时请求。

### Task 4：回归、独立复审与文档收尾

1. 按第 5 节运行全部验证；分析前端 build 输出，确认没有被配置掩盖的 Markmap 警告。
2. 对照本计划独立复审：边界、异步失败体验、生命周期、构建产物、浏览器实际网络请求、测试覆盖和越权文件。
3. 修复复审发现的问题并回归相关测试。
4. 在 `docs/04` 勾选 M01，仅记录实际通过的命令、分支、提交和主线 fast-forward/push 状态；同步 `docs/00` 当前状态与版本记录。
5. 合入流程严格执行：实现分支 rebase 到最新 `master` → `master` fast-forward 合入 → 在 `master` 重跑验证 → 推送 `origin/master`。仅当远端主线包含提交后报告完成。

---

## 5. 验证计划

### 5.1 自动化验证

```powershell
pnpm type-check
pnpm -r --filter @ai-studybuddy/frontend run build
pnpm test
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
```

构建验收须保存可审计的控制台结果：不应出现 `Some chunks are larger than 500 kB after minification`，且配置 diff 中不得出现 `chunkSizeWarningLimit` 调高。

### 5.2 浏览器验收（隔离运行数据）

```powershell
$env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-m01-markmap-chunk-optimization'
pnpm exec playwright test <M01 相关笔记页 spec>
```

验收至少覆盖：

1. 打开没有思维导图的笔记：正文、知识模块和关联任务正常，网络请求中不出现 Markmap 相关 chunk；
2. 打开有思维导图的笔记：出现加载反馈后成功展示，或在受控失败时显示“暂无法展示思维导图”而非白屏；
3. 刷新有思维导图的笔记：仍保留相同的加载与降级语义；
4. 页面未泄露资料原文、真实配置或完整 UUID 到测试夹具、日志或提交中。

---

## 6. 风险与回退

| 风险 | 控制措施 |
| --- | --- |
| 动态 importer 的失败会使整个 `NotePage` 崩溃 | 在思维导图区块内设置局部错误边界与中文回退，测试 reject/throw。 |
| 把 `lazy()` 声明在 render 内导致重复创建与闪烁 | 在模块顶层声明一次，仅由 `note.mindMap` 条件渲染。 |
| 卸载时 Markmap 实例未清理 | 保留并回归 `destroy()` 生命周期；仅在发现真实问题时最小修复。 |
| 构建仍存在超限 chunk | 先按 transformer/runtime-D3 公开包族拆分并构建验证；若仍超限，停止而非抬阈值或无证据硬拆，并将构建产物图带回审查。 |
| 测试只验证 DOM、未验证实际下载 | 增加真实浏览器网络请求断言。 |
| 越权扩展为通用性能项目 | 非目标明确排除依赖升级、性能仪表盘和其它路线图任务；review 对照文件清单。 |

---

## 7. 独立审查结论（计划阶段）

已由与计划编写分离的复查步骤，结合当前 `NotePage` 静态导入链、`MindMap` 的 Markmap 依赖与 `vite.config.ts` 的合并 `manualChunks.markmap` 进行核对。审查项：

1. 任务已登记，计划状态不是“已批准”或“已实施”；
2. 方案通过条件动态导入减少无导图笔记页的下载，而不是只调高阈值；
3. 构建告警与真实网络行为各有独立验证；
4. 异步导入、渲染失败与卸载生命周期均有中文降级及测试；
5. 验证命令、隔离数据根、主线合入重验和 `docs/04` 收尾均已列明；
6. 非目标没有提前进入 T09B–T09E、每日首页、S5、S7、家长 Web 面板、Phase 2 或 Phase 3。

**独立审查结论：通过（v2）**。计划已补足“运行时按需加载”与“物理 chunk 尺寸治理”的双重验证，未采用提高阈值的规避方案；失败体验、生命周期、隔离浏览器验收、主线合入重验与越权边界均已列明。剩余门禁只有用户明确批准。本文件本身不构成实施授权；获得批准后，才可从最新 `origin/master` 创建 `codex/phase1-m01-markmap-chunk-optimization` 并开始写前端代码。

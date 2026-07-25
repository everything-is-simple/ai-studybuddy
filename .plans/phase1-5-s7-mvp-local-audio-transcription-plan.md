# Phase 1.5-S7-MVP：本地课堂录音转文字并进入 S2 行动计划

**状态**：已登记、待本计划自审；用户已明确批准实施这一受控 MVP，完成判定仍必须以主线复验与 `origin/master` 推送为准。
**任务分支**：`codex/phase1-5-s7-mvp-docs-plan`
**基线**：`origin/master` / `c5e2ebda16d0c1086351c8ec8275781c7e5aa283`
**日期**：2026-07-25
**任务清单**：`docs/04-开发任务清单-Todo-List.md` 的“Phase 1.5：课堂 ASR（S7）”。

---

## 1. 要解决的学生问题与本轮结论

学生在已获允许的课堂中录下一段讲解后，需要把本机文件尽快整理成可修改的文字，再明确地交给现有 S2 资料/笔记流程；不应为了这个闭环引入后台队列、云端、长期录音存储或外围网络隔离工程。

本轮仅在以下全部实现并通过验证后，才能宣布：

> **S7-MVP：学生可在已选择的课程资料页导入一段受控 PCM WAV 课堂录音；服务端以显式配置的本机 `whisper.cpp` CLI 同步生成文本；学生可编辑文本并显式保存为 S2 文本资料，之后按现有 S2 操作自行生成笔记。**

本轮绝不能宣布：完整 S7、任意音频格式支持、通用静音识别、实时录音、云端/Provider 转写、G2 通过、用户电脑验收完成或 Phase 3 开始。

---

## 2. 固定边界

### 2.1 本轮范围

- 仅 `.wav` / `audio/wav`，并由服务端再次验证为 RIFF/WAVE、PCM、16 kHz、单声道、16-bit。
- 文件大小受 `LOCAL_ASR_WHISPER_MAX_FILE_BYTES` 严格限制；第一版只接受短文件，不承诺长录音。
- 明确环境变量配置的本机 CLI、模型和超时；未配置或不可执行时返回稳定 `ASR_RUNTIME_UNAVAILABLE`，不猜测磁盘路径、不回退云端。
- `AuralConverter` 的最小实现只负责受控进程调用、固定错误映射、超时和临时文件清理。
- 同步 API：上传一次、返回转写文本或可行动的固定错误；不创建持久化 S7 Job、Worker、音频资料记录或新表。
- 前端在既有资料页增加一个独立小卡片：许可确认、标题、WAV 选择、转写、可编辑文本、显式保存为 S2 笔记输入。
- 保存时创建既有 `file_type='text'` S2 material 与 `normalized_texts`；不创建 `material_convert` Job，不自动调用 Provider 或生成笔记。
- 文案提示静音、多人重叠、噪声与低音量可能不准；精确全零 PCM 的 harness 前置能力不被表述为通用 no-speech 能力。
- 全部临时音频只位于 `APP_DATA_ROOT/tmp/class-capture/<request-id>/`，无论成功、失败、超时或请求取消都在 `finally` 清理。

### 2.2 明确非范围

- MP3、M4A、WebM、视频、FFmpeg 转码、浏览器录音、实时/流式转写。
- Docker、WSL、Firewall、G2、网络探测、真实 Provider、SMTP、飞书和任何云端上传。
- 说话人分离、身份/声纹识别、课堂监听、自动生成笔记、自动保存未经用户确认的转写文本。
- 原始录音长期留存、新数据库表、S7 持久化 Job、Worker 或迁移。
- 外置组件复制到仓库、硬编码 `H:\...`、提交模型/DLL/样例/日志/密钥/正式数据。
- 用户电脑安装运行验收、完整 S7 或 Phase 3。

---

## 3. 受控运行时合同

### 3.1 外置候选引用

应用代码只能通过以下显式环境变量获取受控外置候选：

```text
LOCAL_ASR_WHISPER_CLI_PATH
LOCAL_ASR_WHISPER_MODEL_PATH
LOCAL_ASR_WHISPER_TIMEOUT_SECONDS
LOCAL_ASR_WHISPER_MAX_FILE_BYTES
```

开发机 smoke 前重新核验组件 manifest、CLI、相邻 DLL、模型和样例哈希；仓库不写入候选二进制、模型或真实录音。固定候选的历史能力结论保持 `PARTIAL`，不能被此引用方式覆盖。

### 3.2 进程与隐私合同

- 使用参数数组启动 CLI，禁止 shell 拼接和用户输入进入命令行。
- 不向客户端返回 CLI 路径、模型路径、stdout/stderr、原始文件路径或完整内部诊断。
- 日志只允许固定错误码、文件字节数、总耗时、清理结果及非敏感运行时状态；不记录录音正文、转写全文、原始文件名或秘密。
- 每次测试后复查目标 CLI 无残留；API/adapter 失败路径同样负责结束子进程和清理临时目录。

---

## 4. 实施步骤（文件级）

### Step 1 — 文档与任务状态

修改：

- `docs/00-文档索引-Index.md`
- `docs/01-总PRD-产品需求-Product-Requirements.md`
- `docs/02-七子系统地图-Scenario-Systems.md`
- `docs/04-开发任务清单-Todo-List.md`
- `docs/05-开源组件装配-Open-Source-Foundation.md`
- `docs/06-本地目录治理-Dev-Environment.md`
- `docs/08-共同底座架构-Architecture.md`
- `docs/09-测试验收计划-Test-Plan.md`
- `docs/10-后端开发规范-Backend-Guidelines.md`
- `docs/11-前端开发规范-Frontend-Guidelines.md`
- `docs/13-部署运维指南-Deployment.md`
- `docs/15-前端信息架构与界面范围研究-Frontend-Information-Architecture.md`
- `docs/subsystems/03-S2-资料笔记子系统PRD-NoteBuilder.md`
- `docs/subsystems/07-S7-课堂录音子系统PRD-ClassCapture.md`

做法：把旧的“异步 Job + 预处理 + 完整管道”第一版改为“同步短 WAV + 可编辑文本 + S2 文本 handoff”；把完整 S7/FFmpeg/后台任务保留为未来门禁；持续标注“实施中，未完成”。只修改实际受影响的事实，不制造无关文档漂移。

### Step 2 — 共享 DTO 和环境配置

修改：

- `packages/shared/src/types.ts`
- `packages/backend/src/config/env.ts`
- `packages/backend/src/db/paths.ts`

做法：

1. 增加不泄漏本机路径的 `ClassCaptureTranscriptDto` 和保存结果 DTO。
2. 为四个 `LOCAL_ASR_WHISPER_*` 变量建立解析、范围校验和安全默认值；路径未配置只表示不可用，不隐式启用任何运行时。
3. 在 `paths.ts` 建立由 `APP_DATA_ROOT` 派生的 class-capture 临时根，禁止业务代码硬编码盘符。

### Step 3 — 最小本地 ASR Adapter

新增：

- `packages/backend/src/adapters/aural/whispercpp-aural-converter.ts`
- 必要时新增同目录窄小类型/验证辅助文件

做法：

1. 验证 WAV container 与 PCM 16 kHz / mono / 16-bit 契约、大小限制和 CLI/模型可访问性。
2. 以临时 request 目录保存上传内容，使用参数数组调用配置的 `whisper-cli`，传入固定模型和受控输出路径。
3. 实现超时、非零退出、空输出、无效 WAV、运行时未配置的稳定错误码映射。
4. 在 `finally` 中删除输入、输出和 request 临时目录；对超时结束子进程。
5. 不试图把“全零 PCM”当作通用静音模型能力；前端只显示质量限制提示。

### Step 4 — S7 服务、S2 handoff 与 API

新增：

- `packages/backend/src/services/class-capture-service.ts`
- `packages/backend/src/api/class-capture.ts`

修改：

- `packages/backend/src/services/note-builder-service.ts`
- `packages/backend/src/server.ts`

做法：

1. 提供仅课程上下文内使用的 `/api/class-captures/transcribe`：需要许可确认、标题和音频文件；返回 API 信封。
2. 提供 `/api/class-captures/save-to-notes`：只接受学生编辑后的非空文本和课程/学期上下文。
3. 在 `NoteBuilderService` 新增窄方法：创建 `text` material + `normalized_texts(source_type='class_audio_transcription')`，初始状态为 `converted`，不生成 `material_convert` 或 `note_generate` Job。
4. 保持 S2 既有“生成笔记”操作为用户随后明确点击的操作；若现有状态卡缺少 `converted` 的按钮，在前端补齐而不改变 Provider/Job 语义。
5. 所有 API 使用 `{ success, data, error }`，采用真实 SQLite 的既有学期/课程所有权校验。

### Step 5 — 资料页最小体验

新增或修改：

- `packages/frontend/src/api/class-capture-api.ts`
- `packages/frontend/src/pages/material-upload-page.tsx`
- `packages/frontend/src/components/material-status.tsx`
- 仅在项目已有测试约定允许时新增相邻前端测试

做法：

1. 在已选课程的资料页面增加“S7 课堂录音转文字”卡，不新建主要路由。
2. 转写按钮必须被“我确认这段课堂录音已获得老师和相关同学允许，仅用于本机学习整理”复选框门禁。
3. 明示仅支持 `16 kHz / 单声道 / 16-bit PCM WAV`；界面显示质量提示与不支持格式的行动提示。
4. 转写结果进入可编辑 textarea；保存前不持久化，保存后刷新 S2 资料列表并提示“已保存为资料文本；生成笔记请点击资料卡的生成笔记”。
5. 清理浏览器内存中的临时转写内容；不得写入 `localStorage`。

### Step 6 — 测试、真实 smoke 与主线交付

新增：

- `packages/backend/test/s7-class-capture-api.test.mjs`
- 必要的现有约定前端测试
- `e2e/s7-class-capture.spec.ts`（仅在现有 Playwright fixture 能以受控 fake CLI 覆盖环境时创建）

验证层次：

1. Adapter/API：覆盖无效 WAV、运行时未配置与 S2 handoff；开发机 smoke 用真实固定 CLI 覆盖成功、受控超时、非零失败、临时目录清理和无 CLI 残留。
2. 后端 API：真实 SQLite，课程/学期所有权、许可确认、受控 MIME/内容拒绝、编辑文本保存为 S2 `text` material、未创建转换/笔记 Job。
3. 前端：许可门禁、WAV 格式说明、转写成功后的编辑/保存闭环，以及资料卡的明确“生成笔记”入口。
4. 浏览器：不启动真实 Provider；验证既有学生端路径与资料页 UI 回归。
5. 开发机真实 smoke：新的隔离 `APP_DATA_ROOT=H:\ai-studybuddy-tmp\runs\phase1-5-s7-mvp-<task-id>`，重新核验固定候选资产后，用受控合成 PCM WAV 调用实际 CLI；只记录脱敏摘要、退出码、耗时和清理结论。失败不得冒充通过。
6. 仓库门禁：`pnpm type-check`、backend build、frontend build、`pnpm test`、相关 Playwright、`scripts/check-docs-governance.ps1`、`git diff --check`。
7. 在 `docs/04` 记录分支验证证据；仅 rebase、fast-forward 到 `master`、主线隔离复验、`git push origin master` 和 `git ls-remote` 成功后，才将 S7-MVP 标记完成。

---

## 5. 验收清单

- [x] 用户可在现有资料页选择已获许可的本地受控 WAV（任务分支验证通过，待主线复验）。
- [x] 后端只从显式环境变量获取 CLI/模型，不包含机器绝对路径或云端 fallback。
- [x] 无效格式、过大、未配置、超时、CLI 失败均有稳定且不泄漏隐私的错误。
- [x] 成功转写文本先可编辑，保存操作才创建 S2 文本资料与标准化文本。
- [x] 保存不保留原始音频，不创建 S7 Worker/Job，不自动调用 Provider。
- [x] `converted` 资料有一次显式“生成笔记”操作；这一步沿用既有 S2 语义。
- [x] 临时文件与 CLI 子进程在成功、受控超时及非零失败路径均无残留。
- [x] 测试使用隔离数据目录；不读取/输出真实音频、密钥或正式数据。
- [x] 文档准确标明 S7-MVP 的分支验证状态与完整 S7、G2、用户机验收、Phase 3 的边界。

---

## 6. 计划自审

- **范围足够小**：只新增一条同步、本地、短 WAV 的手动导入链，不变更 S1–S6 或数据库结构。
- **输入契约明确**：不把 FFmpeg 的历史能力误写为 MP3/M4A 支持。
- **隐私边界明确**：不长期保留音频，不把音频/全文/路径写日志或送到 Provider。
- **用户控制明确**：许可确认、可编辑文本、显式保存、显式生成笔记均由学生操作。
- **外部组件事实未被放大**：候选仍是外部配置运行时，通用静音和 G2 不宣称通过。
- **可验证**：API 合约测试覆盖许可、格式、未配置运行时与 S2 handoff；固定真实 CLI 的开发机 smoke 覆盖成功、受控超时、非零失败和清理；所有产物留在隔离目录或既有外部证据目录。
- **未越权**：无 Firewall、Docker、WSL、网络探测、真实 AI、SMTP、飞书、用户机验收或 Phase 3。

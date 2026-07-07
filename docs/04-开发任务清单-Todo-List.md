# AI StudyBuddy 开发任务清单

**版本**：v1.0
**日期**：2026-07-07
**用途**：按阶段拆解具体开发任务，避免想到哪做到哪。每个任务有明确的完成标准。

> 当前进度：Phase 0（文档重建）已完成，下一步进入 Phase 0.5。

---

## 阶段总览

| 阶段 | 目标 | 状态 |
|---|---|---|
| Phase 0 | 文档重建、旧草稿归档、七子系统命名 | ✅ 已完成 |
| Phase 0.5 | 成熟开源组件在 composer 独立调通 | 🔄 进行中 |
| Phase 0.8 | 第一个可运行里程碑（S1 基础 + S2 核心） | ⏳ 待开始 |
| Phase 1 | 跑通完整学习闭环（S1+S2+S3+S4+S6 简版） | ⏳ 待开始 |
| Phase 1.5 | 课堂录音 ASR（S7） | ⏳ 待开始 |
| Phase 2 | 期末真题冲刺（S5） | ⏳ 待开始 |
| Phase 3 | 打磨家长端、预警、安全 | ⏳ 待开始 |

---

## Phase 0.5：开源组件独立调通

**目标**：在 `G:\ai-studybuddy-composer` 先把每个组件跑起来，形成能力卡，再进主系统。

**完成标准**：所有"MVP 必接"组件通过 smoke test，输入/输出格式已确认。

### 0.5-T01：环境准备

- [ ] 确认 Node.js / Python / Docker 版本满足各组件要求
- [ ] 创建 `G:\ai-studybuddy-composer` 目录结构（见 `06-本地目录治理`）
- [ ] 配置 `.env.example`，列出后续会用到的环境变量名（不填真实值）

### 0.5-T02：PDF 文本提取（MVP 必接）

- [ ] 在 `composer\pdf\` 安装 pdf-parse 或 PDF.js
- [ ] 准备 1 个含中文的真实 PDF（可用教材截取的试卷或讲义）
- [ ] 运行 smoke test：输入 PDF，输出纯文本
- [ ] 验证完成标准：中文字符完整、数学公式文本可用、无乱码
- [ ] 填写能力卡（见 `05-开源组件装配` 模板）

### 0.5-T03：图片 / 试卷 OCR（MVP 必接）

- [ ] 在 `composer\ocr\PaddleOCR\` 安装 PaddleOCR + PP-OCRv6
- [ ] 准备 1 张含中文文字的试卷图片
- [ ] 运行 smoke test：输入图片，输出 OCR 文本
- [ ] 验证完成标准：汉字/数字识别率 > 90%，表格结构基本保留
- [ ] 填写能力卡

### 0.5-T04：思维导图渲染（MVP 必接）

- [ ] 在 `composer\mindmap\markmap-test\` 安装 Markmap
- [ ] 编写一份 Markdown 层级文本（可用 AI 生成样例）
- [ ] 运行 smoke test：浏览器能渲染出思维导图
- [ ] 验证完成标准：层级关系正确、节点可展开收起
- [ ] 填写能力卡

### 0.5-T05：Markdown + KaTeX 渲染（MVP 必接）

- [ ] 在 `composer\markdown\react-markdown-test\` 安装 react-markdown + KaTeX
- [ ] 准备含公式（`$E=mc^2$`）和代码块的 Markdown 样本
- [ ] 运行 smoke test：页面正常渲染，公式美观
- [ ] 验证完成标准：行内公式和块级公式均可渲染
- [ ] 填写能力卡

### 0.5-T06：异步任务队列 BullMQ（MVP 必接）

- [ ] 在 `composer\queue\bullmq-test\` 安装 BullMQ + Redis
- [ ] 启动本地 Redis（Docker 或直装）
- [ ] 编写 smoke test：创建队列、入队一个 Job、消费、模拟失败并重试
- [ ] 验证完成标准：Job 状态（waiting / active / completed / failed）可查询
- [ ] 填写能力卡

### 0.5-T07：对象存储 MinIO（MVP 必接）

- [ ] 在 `composer\storage\minio-test\` 启动 MinIO（Docker 推荐）
- [ ] 编写 smoke test：上传一个文件、下载、生成临时 URL
- [ ] 验证完成标准：上传 / 下载 / URL 生成均成功
- [ ] 填写能力卡

### 0.5-T08：数据库 PostgreSQL（MVP 必接）

- [ ] 在 `composer\db\pgvector-test\` 启动 PostgreSQL（Docker 推荐）
- [ ] 安装 pgvector 扩展
- [ ] 编写 smoke test：建表、插入、查询、向量搜索基础验证
- [ ] 验证完成标准：CRUD 正常，pgvector 扩展加载成功
- [ ] 填写能力卡

### 0.5-T09：AI Provider——DeepSeek（MVP 必接）

- [ ] 在 `composer\ai-provider\deepseek-test\` 写最小接入样例
- [ ] 发送一段纯文本，要求返回结构化笔记（Markdown 格式）
- [ ] 验证完成标准：API 可调通，响应格式可解析，latency 可接受
- [ ] 记录：模型名、token 消耗、响应时间
- [ ] 填写能力卡

### 0.5-T10：共同底座架构文档（触发条件满足，主动创建）

- [ ] 读 `07-文档策略` 第 6 节，确认触发条件
- [ ] 创建 `docs/08-共同底座架构-Architecture.md`（2-3 页最小版）
- [ ] 内容只包含：基础数据结构草案、数据库约定、API 响应格式、AI Router 接口
- [ ] 更新 `docs/00-文档索引-Index.md`

---

## Phase 0.8：第一个可运行里程碑

**目标**：

```
学生创建课程
  → 上传 PDF/图片/文本
  → 格式转换为纯文本
  → DeepSeek 生成结构化笔记 + 重点 + 思维导图
  → 前端能看到笔记和导图
```

**完成标准**：端到端流程可以演示，不需要完整功能，只需核心路径跑通。

### 0.8-T01：项目结构初始化

- [ ] 在 `G:\ai-studybuddy` 初始化 monorepo（推荐 pnpm workspace）
- [ ] 创建基础包结构：`packages/shared`、`packages/backend`、`packages/frontend`（或类似结构）
- [ ] 配置 TypeScript、ESLint、Prettier（对齐项目语言）
- [ ] 配置环境变量读取（`.env.local`，不 commit 真实 Key）

### 0.8-T02：共同底座——数据库与迁移

- [ ] 选定数据库迁移工具（推荐 drizzle-orm 或 prisma）
- [ ] 创建第一批表：`users`、`courses`、`study_tasks`、`study_events`
- [ ] 创建第二批表：`materials`、`normalized_texts`、`structured_notes`、`mind_maps`
- [ ] 运行迁移，验证表结构

### 0.8-T03：共同底座——文件存储接口

- [ ] 封装 `StorageAdapter`，对接 MinIO
- [ ] 实现：上传文件、下载文件、生成临时访问 URL
- [ ] 文件写入 `G:\ai-studybuddy-data`（通过环境变量配置）

### 0.8-T04：共同底座——格式转换层

- [ ] 封装 `PdfConverter`（复用 0.5-T02 调通的 pdf-parse）
- [ ] 封装 `OcrConverter`（复用 0.5-T03 调通的 PaddleOCR）
- [ ] 封装 `TextConverter`（Markdown/纯文本直接入库）
- [ ] 统一输出格式：`{ text: string, source_type: string, metadata: object }`

### 0.8-T05：共同底座——AI Provider Router

- [ ] 封装 `AiProviderRouter`，支持按任务类型选择 Provider
- [ ] 默认 DeepSeek，失败时自动降级到 Qwen（暂时可手动配置）
- [ ] 记录：模型名、token 消耗、耗时、失败原因（不记录学生隐私原文）

### 0.8-T06：S1 学习节奏——核心 API

- [ ] 实现 `POST /courses`、`GET /courses`
- [ ] 实现 `POST /study-tasks`、`PATCH /study-tasks/:id/status`
- [ ] 实现 `POST /study-events`（供其他子系统写入时间线）
- [ ] 实现 `GET /timeline`（学生时间线）

### 0.8-T07：S2 资料笔记——核心 API

- [ ] 实现 `POST /materials/upload`（上传 PDF / 图片 / 文本）
- [ ] 接入格式转换层，异步处理（BullMQ Job）
- [ ] 接入 AI Provider Router，生成结构化笔记 + 重点 + 思维导图数据
- [ ] 实现 `GET /notes/:id`（获取笔记详情）

### 0.8-T08：前端——最小可用页面

- [ ] 页面 1：课程列表 + 创建课程
- [ ] 页面 2：资料上传（拖拽或选择文件）
- [ ] 页面 3：笔记展示（react-markdown + KaTeX + Markmap 渲染）
- [ ] 不要求样式完美，要求功能可用

### 0.8-T09：端到端验证

- [ ] 完整走一遍流程：创建课程 → 上传 PDF → 等待转换 → 查看笔记
- [ ] 验证：笔记 Markdown 渲染正确、思维导图可展示
- [ ] 记录 AI 调用 token 消耗和响应时间
- [ ] 临时文件清理不影响笔记数据

---

## Phase 1：完整学习闭环

**目标**：跑通 S1 + S2 + S3 + S4 + S6 简版，五个子系统协同。

**前置条件**：Phase 0.8 里程碑完成并演示成功。

> 详细任务清单在 S3/S4/S6 轻量 PRD 创建后补入本文件。

### 阶段目标拆解

- [ ] S3 PracticeRunner：根据笔记生成练习，客观题规则批改，错题进 S4
- [ ] S4 ErrorFixer：错题入库，错因分类，艾宾浩斯排程，原题 / 变题重做
- [ ] S6 ParentWindow 简版：家长查看时间线、完成次数、逾期状态（不看隐私原文）
- [ ] S1 扩展：完整接收 S2/S3/S4 的 StudyEvent 写入，时间线完整

---

## Phase 1.5：课堂 ASR

> 任务在 S7 轻量 PRD 创建后补入。

---

## Phase 2：期末冲刺

> 任务在 S5 轻量 PRD 创建后补入。

---

## 任务状态说明

| 符号 | 含义 |
|---|---|
| ✅ | 已完成并验证 |
| 🔄 | 进行中 |
| ⏳ | 待开始 |
| ❌ | 已跳过或放弃（需注明原因） |
| - [ ] | 待完成的具体任务 |
| - [x] | 已完成的具体任务 |

---

## 文档门禁检查点

每个 Phase 开始前，确认：

1. 当前 Phase 的子系统轻量 PRD 已创建；
2. `docs/00-文档索引-Index.md` 已更新；
3. 开源组件 smoke test 已通过；
4. `scripts/check-docs-governance.ps1` 检查无报错。

# AI StudyBuddy 开发任务清单

**版本**：v0.01
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

- [ ] 确认 Node.js 18+（`node --version`）、Python 3.8+（`python --version`）、Docker Desktop 已启动（`docker ps`）
- [ ] 在 `C:\Users\Administrator\.wslconfig` 写入内存上限（防 Docker Desktop WSL2 内存泄漏）：`memory=8GB processors=4 swap=2GB`
- [ ] 创建 `F:\ai-studybuddy-composer` 目录结构（已完成）
- [ ] 配置 `.env.example`，列出后续会用到的环境变量名（不填真实值）

> ⚠️ 常见坑：Node 命令不存在 → 去 nodejs.org 装 LTS；Python 是 2.x → 装 3.10+；Docker 图标未变绿就跑命令会报错，等它完全启动再操作。

### 0.5-T02：PDF 文本提取（MVP 必接）

- [ ] 在 `composer\pdf\pdf-parse-demo\` 安装：`npm install`
- [ ] 准备 1 个含中文的真实 PDF，放入 `samples\test.pdf`（用教材/讲义，不用扫描版）
- [ ] 运行 smoke test：`node smoke-test\smoke-test.js`
- [ ] 验证完成标准：中文字符完整、数学公式文本可用、无乱码
- [ ] 填写能力卡（见 `05-开源组件装配` 模板）

> ⚠️ 常见坑：输出乱码 → PDF 是扫描版图片，换文字版；中文显示 `?????` → PDF 字体未嵌入，换另一个 PDF；数学公式变乱符号 → 正常，公式是图片走 OCR 路径。

### 0.5-T03：图片 / 试卷 OCR（MVP 必接）

- [ ] 安装 RapidOCR（首选）：`pip install rapidocr-onnxruntime -i https://pypi.tuna.tsinghua.edu.cn/simple`
- [ ] 安装 PaddleOCR（对比用）：`pip install paddlepaddle paddleocr -i https://pypi.tuna.tsinghua.edu.cn/simple`
- [ ] 准备 1 张真实中文试卷图片（清晰拍照，非截图），放入各自 `samples\test.jpg`
- [ ] 分别运行：`python smoke-test\smoke-test.py`，记录识别率和单页耗时
- [ ] 对比两者，选识别率高且速度快的作为主力，填写能力卡

> ⚠️ 常见坑：pip 超时 → 加 `-i` 清华源；首次运行自动下载模型约 50MB 需等待；识别率 <80% → 图片模糊/旋转，换清晰图片；耗时 >15s → 正常，接入主系统必须走 BullMQ 异步 Job；DLL 报错 → 安装 Visual C++ Redistributable。

### 0.5-T04：思维导图渲染（MVP 必接）

- [ ] 在 `composer\mindmap\markmap-test\` 安装：`npm install markmap-lib`
- [ ] 运行 smoke test：`node smoke-test\smoke-test.js`，生成 `output\result.html`
- [ ] 用浏览器打开 `output\result.html`，验证节点层级正确、可展开收起、中文无乱码
- [ ] 填写能力卡（已有 2026-07-08 通过记录，复核即可）

> ⚠️ 常见坑：HTML 打开空白 → CDN 加载失败，开代理或换 Chrome；中文显示方框 → 用 Chrome 打开，Edge 偶有问题；节点层级乱 → 检查 `samples\sample.md` 缩进是空格不是 Tab。

### 0.5-T05：Markdown + KaTeX 渲染（MVP 必接）

- [ ] 直接用浏览器打开 `composer\markdown\react-markdown-test\smoke-test\index.html`
- [ ] 验证：行内公式 `$E=mc^2$` 渲染正确、块级公式渲染正确、中文显示正常、无 JS 报错
- [ ] 填写能力卡

> ⚠️ 常见坑：公式显示原始 `$...$` 字符 → KaTeX CDN 加载失败，开代理；页面卡住 → 同上；用 Chrome 打开最稳定。

### 0.5-T06：异步任务队列 BullMQ（MVP 必接）

- [ ] 启动 Redis：`docker run -d --name redis -p 6379:6379 redis:7-alpine`
- [ ] 在 `composer\queue\bullmq-test\` 安装：`npm install`
- [ ] 运行 smoke test：`node smoke-test\smoke-test.js`
- [ ] 验证完成标准：Job 经历 waiting→active→completed 全生命周期，失败后重试成功
- [ ] 填写能力卡

> ⚠️ 常见坑：`ECONNREFUSED 6379` → Redis 容器没起来，`docker ps` 确认；`port already allocated` → `netstat -ano | findstr 6379` 找占用进程关掉；测完记得清理 `docker stop redis && docker rm redis`。

### 0.5-T07：对象存储 MinIO（MVP 必接）

- [ ] 启动 MinIO：`docker run -d --name minio -p 9000:9000 -p 9001:9001 -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin minio/minio server /data --console-address ":9001"`
- [ ] 在 `composer\storage\minio-test\` 安装：`npm install`，复制 `.env.example` 为 `.env.local`
- [ ] 运行 smoke test：`node smoke-test\smoke-test.js`
- [ ] 额外验证：浏览器打开 `http://localhost:9001`，用 minioadmin/minioadmin 登录能看到控制台
- [ ] 验证完成标准：上传/下载内容一致，临时 URL 可访问
- [ ] 填写能力卡

> ⚠️ 常见坑：9000 端口占用 → 改 `-p 9002:9000` 并同步改 `.env.local`；`AccessDenied` → 检查账号密码是否与 docker run 一致；临时 URL 浏览器打不开 → 正常，URL 是给 Node 脚本访问的，不是给浏览器直接开的。

### 0.5-T08：数据库 PostgreSQL（MVP 必接）

- [ ] 启动 PostgreSQL+pgvector：`docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=devpassword pgvector/pgvector:pg16`
- [ ] 在 `composer\db\pgvector-test\` 安装：`npm install`，复制 `.env.example` 为 `.env.local`
- [ ] 运行 smoke test：`node smoke-test\smoke-test.js`
- [ ] 验证完成标准：CRUD 正常，pgvector 扩展加载成功，向量搜索返回结果
- [ ] 填写能力卡

> ⚠️ 常见坑：`ECONNREFUSED 5432` → 容器刚起来需等 5 秒，`docker logs postgres` 看是否就绪；`extension "vector" does not exist` → 镜像用错了，必须用 `pgvector/pgvector:pg16` 不是普通 `postgres`；5432 端口占用（本机装了 PG）→ 改 `-p 5433:5432` 并同步改 `.env.local`；密码不对 → `.env.local` 里 `POSTGRES_PASSWORD` 必须和 docker run 的 `-e` 一致。

### 0.5-T09：AI Provider——中转 GPT（MVP 必接）

- [ ] 在 `composer\ai-provider\deepseek-test\` 安装：`npm install`
- [ ] 创建 `.env.local`，填入：`RELAY_API_KEY=你的Key`、`RELAY_BASE_URL=https://你的中转/v1`、`RELAY_MODEL=gpt-4o`（或实际模型名）
- [ ] 运行 smoke test：`node smoke-test\smoke-test.js`
- [ ] 验证完成标准：API 调通，返回可解析 Markdown，latency < 30s
- [ ] 记录：模型名、token 消耗、响应时间，填写能力卡

> ⚠️ 常见坑：`401 Unauthorized` → Key 错或 baseURL 末尾少了 `/v1`；返回内容不是中文 → 模型名写错，查中转平台支持的模型列表；latency > 30s → 中转服务慢，换个时间段或换另一家中转；`.env.local` 绝不提交 git，Key 泄露后立即去中转平台作废重生成。

### 0.5-T10：共同底座架构文档（触发条件满足，主动创建）

- [ ] 读 `07-文档策略` 第 6 节，确认触发条件
- [ ] 创建 `docs/08-共同底座架构-Architecture.md`（2-3 页最小版）
- [ ] 内容只包含：基础数据结构草案、数据库约定、API 响应格式、AI Router 接口
- [ ] 更新 `docs/00-文档索引-Index.md`

### Phase 0.5B：支撑 S3 + S4 的第二批组件

> Phase 0.8 跑通后，准备进入 S3/S4 开发前调通。

- [ ] 客观题规则批改：选择题 / 填空题最小规则引擎测试
- [ ] 错题复习排程：艾宾浩斯间隔复习日期计算测试
- [ ] Qwen Provider：文本备选最小样例（同 Kimi smoke test 格式）
- [ ] GPT Provider：难题兜底最小样例

### Phase 0.5C：工程治理脚本

- [ ] 备份 zip 脚本：标注阶段、commit hash、风险说明、恢复方式
- [ ] tmp 清理脚本：清空 `G:\ai-studybuddy-tmp` 后系统可继续运行
- [ ] logs 规范验证：确认日志中不记录 API Key、学生隐私全文、完整答案

暂不进入 Phase 0.5 主线：SenseVoice、FunASR、FFmpeg、Readability。它们等 S7 或对应子系统开工前再调。

---

## Phase 0.8：第一个可运行里程碑

**目标**：

```
学生创建课程
  → 上传 PDF/图片/文本
  → 格式转换为纯文本
  → Kimi 生成结构化笔记 + 重点 + 思维导图
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
- [ ] 默认 Kimi，失败时自动降级到 Qwen（暂时可手动配置）
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

### 规范文档触发条件

> 开发动作触发文档，而不是提前创建空文档。

| 即将开始的动作 | 必须先存在/创建的文档 | 说明 |
|---|---|---|
| 设计共同数据模型、队列、对象存储、AI Provider、Adapter | `08-共同底座架构-Architecture.md` | 没有共同底座设计，不开始跨子系统实现 |
| 调通第一个开源组件 smoke test | `09-测试验收计划-Test-Plan.md` | 先定义怎么验收，再调组件 |
| 写第一个后端服务 / Adapter / API / Worker | `10-后端开发规范-Backend-Guidelines.md` | 先统一路径、日志、Adapter 输出约定 |
| 写第一个正式前端页面 | `11-前端开发规范-Frontend-Guidelines.md` | 先统一页面、组件、状态和渲染规范 |
| 多 AI / 多分支 / 多人协作 | `12-开发规范-Dev-Rules.md` | 先统一协作、提交、归档、备份规则 |

门禁流程：

```text
收到任务 → 读 00 索引 → 查目标文档是否存在 → 查触发条件 → 不满足则不创建 → 满足则创建 → 更新 00 索引 → 运行治理检查 → 提交
```

# AI StudyBuddy 开发任务清单

**版本**：v1.2
**日期**：2026-07-09
**用途**：按阶段拆解具体开发任务，避免想到哪做到哪。每个任务有明确的完成标准。

> 当前进度：Phase 0.5 已完成。MVP 主路径组件已通过 smoke test，T10 共同底座汇总已回填；下一步进入 Phase 0.8 工程初始化。PaddleOCR、Kimi/Qwen、ASR、FFmpeg、Readability 均作为后续触发项，不阻塞 Phase 0.8。

---

## 阶段总览

| 阶段 | 目标 | 状态 |
|---|---|---|
| Phase 0 | 文档重建、旧草稿归档、七子系统命名 | ✅ 已完成 |
| Phase 0.5 | 成熟开源组件在 composer 独立调通 | ✅ 已完成（MVP 主路径 smoke test 全部通过） |
| Phase 0.6 | 免费隧道 / 内网穿透选型与 smoke test | ⏳ 待开始 |
| Phase 0.8 | 第一个可运行里程碑（S1 基础 + S2 核心） | ⏳ 待开始 |
| Phase 1 | 跑通完整学习闭环（S1+S2+S3+S4+S6 简版） | ⏳ 待开始 |
| Phase 1.5 | 课堂录音 ASR（S7） | ⏳ 待开始 |
| Phase 2 | 期末真题冲刺（S5） | ⏳ 待开始 |
| Phase 3 | 打磨家长端、预警、安全 | ⏳ 待开始 |

---

## Phase 0.5：开源组件独立调通

**目标**：在 `G:\ai-studybuddy-composer` 先把每个组件跑起来，形成能力卡，再进主系统。

**Phase 0.5 完成标准**：MVP 主路径组件通过 smoke test，输入/输出格式已确认，能力卡和共同底座文档已回填。PaddleOCR、Kimi/Qwen、ASR、FFmpeg、Readability 等备选/后续组件不计入 Phase 0.5 完成门槛。

### 0.5-T01：环境准备

- [x] 确认 Node.js 18+、Python 3.8+、Docker Desktop 可支撑组件 smoke test
- [ ] 可选治理：在 `C:\Users\Administrator\.wslconfig` 写入内存上限（防 Docker Desktop WSL2 内存泄漏）：`memory=8GB processors=4 swap=2GB`
- [x] 创建 `G:\ai-studybuddy-composer` 目录结构（已完成）
- [x] 配置 `.env.example`，列出后续会用到的环境变量名（不填真实值）

> ⚠️ 常见坑：Node 命令不存在 → 去 nodejs.org 装 LTS；Python 是 2.x → 装 3.10+；Docker 图标未变绿就跑命令会报错，等它完全启动再操作。

### 0.5-T02：PDF 文本提取（MVP 必接）

- [x] 在 `composer\pdf\pdf-parse-demo\` 安装：`npm install`
- [x] 准备 1 个含中文的真实 PDF，放入 `samples\test.pdf`（用教材/讲义，不用扫描版）
- [x] 运行 smoke test：`node smoke-test\smoke-test.js`
- [x] 验证完成标准：中文字符完整、数学公式文本可用、无乱码
- [x] 填写能力卡（2026-07-09 已完成）

> ⚠️ 常见坑：输出乱码 → PDF 是扫描版图片，换文字版；中文显示 `?????` → PDF 字体未嵌入，换另一个 PDF；数学公式变乱符号 → 正常，公式是图片走 OCR 路径。
> 2026-07-09 实测：`01-总PRD-产品需求-Product-Requirements.pdf` 通过（7 页、5155 字符、2422 个中文字符）；`电工考点.pdf` 可读取 14 页但只提取到页码标记、0 个中文字符，疑似扫描版，应进入 OCR 路径。

### 0.5-T03：图片 / 试卷 OCR（MVP 必接）

- [x] 安装 RapidOCR（首选）：`pip install rapidocr-onnxruntime -i https://pypi.tuna.tsinghua.edu.cn/simple`
- [ ] 后续可选：安装 PaddleOCR（对比用）：`pip install paddlepaddle paddleocr -i https://pypi.tuna.tsinghua.edu.cn/simple`
- [x] 准备 1 张真实中文试卷图片（清晰拍照，非截图），放入各自 `samples\test.jpg`
- [x] 运行 RapidOCR：`python smoke-test\smoke-test.py`，记录单页耗时
- [x] 运行 RapidOCR 批量测试：`python smoke-test\smoke-test-batch.py`，记录 22 张书页汇总
- [ ] 后续可选：运行 PaddleOCR：`python smoke-test\smoke-test.py`，记录识别率和单页耗时（备选对比，不阻塞）
- [x] Phase 0.8 主路径先选 RapidOCR，填写能力卡；PaddleOCR 作为可替换实现保留

> ⚠️ 常见坑：pip 超时 → 加 `-i` 清华源；首次运行自动下载模型约 50MB 需等待；识别率 <80% → 图片模糊/旋转，换清晰图片；耗时 >15s → 正常，接入主系统必须走 BullMQ 异步 Job；DLL 报错 → 安装 Visual C++ Redistributable。
> 2026-07-09 实测：RapidOCR 批量识别 22 张繁体书页全部有输出，总耗时 42.62s，平均 1.94s/页，中文字符 3009，平均置信度 0.8925；无人工标注文本，暂不宣称真实识别率。

### 0.5-T04：思维导图渲染（MVP 必接）

- [x] 在 `composer\mindmap\markmap-test\` 安装：`npm install markmap-lib`
- [x] 运行 smoke test：`node smoke-test\smoke-test.js`，生成 `output\result.html`
- [x] 用浏览器打开 `output\result.html`，验证节点层级正确、可展开收起、中文无乱码
- [x] 填写能力卡（2026-07-09 已完成浏览器复核）

> ⚠️ 常见坑：HTML 打开空白 → CDN 加载失败，开代理或换 Chrome；中文显示方框 → 用 Chrome 打开，Edge 偶有问题；节点层级乱 → 检查 `samples\sample.md` 缩进是空格不是 Tab。

### 0.5-T05：Markdown + KaTeX 渲染（MVP 必接）

- [x] 直接用浏览器打开 `composer\markdown\react-markdown-test\smoke-test\index.html`
- [x] 验证：行内公式 `$E=mc^2$` 渲染正确、块级公式渲染正确、中文显示正常、无 JS 报错
- [x] 填写能力卡（2026-07-09 已完成 Chrome 浏览器验证）

> ⚠️ 常见坑：公式显示原始 `$...$` 字符 → KaTeX CDN 加载失败，开代理；页面卡住 → 同上；用 Chrome 打开最稳定。

### 0.5-T06：异步任务队列 BullMQ（MVP 必接）

- [x] 启动 Redis：`docker run -d --name redis -p 6379:6379 redis:7-alpine`
- [x] 在 `composer\queue\bullmq-test\` 安装：`npm install`
- [x] 运行 smoke test：`node smoke-test\smoke-test.js`
- [x] 验证完成标准：Job 经历 waiting→active→completed 全生命周期，失败后重试成功
- [x] 填写能力卡（2026-07-09 已完成）

> ⚠️ 常见坑：`ECONNREFUSED 6379` → Redis 容器没起来，`docker ps` 确认；`port already allocated` → `netstat -ano | findstr 6379` 找占用进程关掉；测完记得清理 `docker stop redis && docker rm redis`。
> 2026-07-09 实测：Docker Hub 拉取 `redis:7-alpine` 时 token EOF，改用 `docker.m.daocloud.io/library/redis:7-alpine` 成功；Redis 7.4.9，BullMQ 5.79.3，失败重试和 completed 状态通过；测试后已清理 Redis 容器。

### 0.5-T07：对象存储 MinIO（MVP 必接）

- [x] 启动 MinIO：`docker run -d --name minio -p 9000:9000 -p 9001:9001 -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin minio/minio:latest server /data --console-address ":9001"`
- [x] 在 `composer\storage\minio-test\` 安装：`npm install`，复制 `.env.example` 为 `.env.local`
- [x] 运行 smoke test：`node smoke-test\smoke-test.js`
- [x] 额外验证：浏览器打开 `http://localhost:9001`，用 minioadmin/minioadmin 登录能看到控制台
- [x] 验证完成标准：上传/下载内容一致，临时 URL 可访问
- [x] 填写能力卡（2026-07-09 已完成）

> ⚠️ 常见坑：9000 端口占用 → 改 `-p 9002:9000` 并同步改 `.env.local`；`AccessDenied` → 检查账号密码是否与 docker run 一致；临时 URL 浏览器打不开 → 正常，URL 是给 Node 脚本访问的，不是给浏览器直接开的。
> 2026-07-09 实测：Docker Hub 拉取 `minio/minio:latest` 时 TLS handshake timeout，改用 `docker.m.daocloud.io/minio/minio:latest` 成功；MinIO RELEASE.2025-09-07T16-13-09Z，SDK minio 8.0.7，上传/下载一致、presigned URL、对象删除、控制台登录均通过；测试后已清理 MinIO 容器。

### 0.5-T08：数据库 PostgreSQL（MVP 必接）

- [x] 启动 PostgreSQL+pgvector：`docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=devpassword pgvector/pgvector:pg16`
- [x] 在 `composer\db\pgvector-test\` 安装：`npm install`，复制 `.env.example` 为 `.env.local`
- [x] 运行 smoke test：`node smoke-test\smoke-test.js`
- [x] 验证完成标准：CRUD 正常，pgvector 扩展加载成功，向量搜索返回结果
- [x] 填写能力卡（2026-07-09 已完成）

> ⚠️ 常见坑：`ECONNREFUSED 5432` → 容器刚起来需等 5 秒，`docker logs postgres` 看是否就绪；`extension "vector" does not exist` → 镜像用错了，必须用 `pgvector/pgvector:pg16` 不是普通 `postgres`；5432 端口占用（本机装了 PG）→ 改 `-p 5433:5432` 并同步改 `.env.local`；密码不对 → `.env.local` 里 `POSTGRES_PASSWORD` 必须和 docker run 的 `-e` 一致。
> 2026-07-09 实测：PostgreSQL 16.14 + pgvector 0.8.5 通过；建表、插入 3 条中文记录、查询、余弦距离向量搜索、IVFFlat 索引均通过；测试后已清理 `postgres` 容器。Docker Desktop 后端曾短暂无响应，重启 Docker Desktop 后官方镜像拉取成功。

### 0.5-T09：AI Provider——中转 GPT/Claude（MVP 必接）

- [x] 在 `composer\ai-provider\gpt-test\` 安装：`npm install`
- [x] 创建 `.env.local`，填入：`RELAY_API_KEY=你的Key`、`RELAY_BASE_URL=https://你的中转/v1`、`RELAY_MODEL=gpt-5.5`
- [x] 运行 smoke test：`node smoke-test\smoke-test.js`
- [x] 验证完成标准：API 调通，返回可解析 Markdown，latency < 30s
- [x] 记录：模型名、token 消耗、响应时间，填写能力卡（2026-07-09 已完成）

> ⚠️ 常见坑：`401 Unauthorized` → Key 错或 baseURL 末尾少了 `/v1`；返回内容不是中文 → 模型名写错，查中转平台支持的模型列表；latency > 30s → 中转服务慢，换个时间段或换另一家中转；`.env.local` 绝不提交 git，Key 泄露后立即去中转平台作废重生成。
> 2026-07-09 实测：已创建 `composer\ai-provider\gpt-test`，按 cc-switch 导出的当前 Pixel provider `pixelapi-1783123721199` 读取 auth，使用 Pixel API 中转站 `https://ai-pixel.online/v1`、`wire_api=responses`、模型 `gpt-5.5` 通过。响应时间 11.9s，输入 tokens 460，输出 tokens 528，总 tokens 988；返回 Markdown、中文内容、思维导图 JSON 均通过。最初 401 根因是 `.env.local` 中手填 Key 与 cc-switch 正在使用的 provider key 不一致。DeepSeek 已按用户偏好废弃；Kimi 当前无 Key；GLM-5.2 已到期。

### 0.5-T10：共同底座架构汇总 / Phase 0.8 开工前整理

- [x] 读 `docs/00-文档索引-Index.md`，确认当前共同底座文档已存在：`docs/08-共同底座架构-Architecture.md`
- [x] 不新建 `docs/10-*`：`10-后端开发规范` 的触发条件是写第一个后端服务 / Adapter / API / Worker 前，当前尚未触发
- [x] 更新 `docs/08-共同底座架构-Architecture.md`：补齐 Phase 0.5 smoke test 结论、AI Provider 实测配置、RapidOCR 主路径、Phase 0.8 开工前置清单
- [x] 同步更新系统设计相关文档：`01-总PRD`、`02-七子系统地图`、`04-开发任务清单`、`05-开源组件装配`、`09-测试验收计划`
- [x] 运行治理检查：`powershell -ExecutionPolicy Bypass -File scripts\check-docs-governance.ps1`
- [x] 运行空白检查：`git diff --check`

### 后续候选：支撑 S3 + S4 的第二批组件

> Phase 0.8 跑通后，准备进入 S3/S4 开发前调通。

- [ ] 客观题规则批改：选择题 / 填空题最小规则引擎测试
- [ ] 错题复习排程：艾宾浩斯间隔复习日期计算测试
- [ ] Qwen Provider：文本备选最小样例（同 Kimi smoke test 格式）
- [ ] GPT Provider：难题兜底最小样例

### 后续候选：工程治理脚本

- [ ] 备份 zip 脚本：标注阶段、commit hash、风险说明、恢复方式
- [ ] tmp 清理脚本：清空 `G:\ai-studybuddy-tmp` 后系统可继续运行
- [ ] logs 规范验证：确认日志中不记录 API Key、学生隐私全文、完整答案

暂不进入 Phase 0.5 主线：SenseVoice、FunASR、FFmpeg、Readability。它们等 S7 或对应子系统开工前再调。

### Phase 0.5 完成声明

截至 2026-07-09，Phase 0.5 已完成并复测通过：PDF、RapidOCR、Markmap、Markdown/KaTeX、BullMQ、MinIO、PostgreSQL/pgvector、Pixel API 中转 AI Provider 均已通过 smoke test，T10 共同底座汇总已回填。

Phase 0.5 不包含免费隧道 / 内网穿透选型与外网访问测试。该缺口独立收口为 Phase 0.6；Phase 0.6 完成后再进入 Phase 0.8 主系统实现。

---

## Phase 0.6：免费隧道 / 内网穿透验证

**目标**：在不提前创建 `13-部署运维指南-Deployment.md` 的前提下，先完成试用阶段外网接入的最小选型和 smoke test，证明“学生异地通过浏览器访问家用主机”可行且不裸奔。

**完成标准**：选定 1 个 Phase 0.8 试用默认隧道方案，记录备选取舍；本机启动最小 Web 服务后，能从非同一局域网访问；访问入口必须经过系统登录或临时鉴权页；不得暴露 MinIO、PostgreSQL、Redis、管理控制台和真实 token。

### 0.6-T01：隧道候选方案对比

- [ ] 对比 Cloudflare Tunnel、Tailscale Funnel/Serve、frp、ngrok 等候选项
- [ ] 记录每个方案的免费额度、是否需域名、国内可达性、Windows 支持、开机自启动、HTTPS、访问控制和封禁/限速风险
- [ ] 选出 Phase 0.8 试用默认方案和 1 个备选方案

### 0.6-T02：本机最小 Web 服务准备

- [ ] 启动一个只用于 smoke test 的本地 Web 服务（可用临时静态页或未来前端 dev server）
- [ ] 页面只显示健康检查信息，不展示真实学生资料、API Key、token 或内部路径
- [ ] 确认本机局域网访问和 `localhost` 访问均正常

### 0.6-T03：隧道连通性 smoke test

- [ ] 按候选方案建立隧道，将公网入口只转发到最小 Web 服务端口
- [ ] 用手机蜂窝网络或另一条非同局域网网络访问公网 URL
- [ ] 记录：访问 URL 形态、首次连接耗时、页面加载是否稳定、断线重连表现

### 0.6-T04：安全边界检查

- [ ] 确认公网入口只暴露 Web 入口，不暴露 MinIO Console、PostgreSQL、Redis、Docker Desktop、调试端口
- [ ] 确认访问入口必须登录或至少有临时鉴权，不允许裸奔访问学习数据
- [ ] 确认日志不记录隧道 token、学生隐私全文、完整答案和真实 API Key
- [ ] 确认 `.env.local` / token 文件不提交 git

### 0.6-T05：重启恢复与记录回填

- [ ] 重启本地 Web 服务后，验证隧道访问恢复
- [ ] 重启隧道进程或 Windows 后，验证恢复步骤可执行
- [ ] 将最终选型、命令摘要、风险和 smoke test 结果回填到 `docs/08-共同底座架构-Architecture.md` 与 `docs/09-测试验收计划-Test-Plan.md`

> Phase 0.6 只解决“试用阶段外网入口是否可行”。详细安装、备份、监控、域名、证书、开机自启动和长期运维流程仍等 `13-部署运维指南-Deployment.md` 触发后再写。

---

## Phase 0.8：第一个可运行里程碑

**目标**：

```
学生创建课程
  → 上传 PDF/图片/文本
  → 格式转换为纯文本
  → 中转 GPT/Claude 生成结构化笔记 + 重点 + 思维导图
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
- [ ] 封装 `OcrConverter`（复用 0.5-T03 调通的 RapidOCR；PaddleOCR 作为备选对比，不阻塞）
- [ ] 封装 `TextConverter`（Markdown/纯文本直接入库）
- [ ] 统一输出格式：`{ text: string, source_type: string, metadata: object }`

### 0.8-T05：共同底座——AI Provider Router

- [ ] 封装 `AiProviderRouter`，支持按任务类型选择 Provider
- [ ] 默认中转 GPT/Claude（Pixel API / Responses API 已测），Kimi/Qwen 作为后续备选配置位（当前 Kimi 无 Key）
- [ ] 记录：模型名、token 消耗、耗时、失败原因（不记录学生隐私原文）

### 0.8-T06：S1 学习节奏——核心 API

- [ ] 实现 `POST /courses`、`GET /courses`
- [ ] 实现 `POST /study-tasks`、`PATCH /study-tasks/:id/status`
- [ ] 实现 `POST /study-events`（供其他子系统写入时间线）
- [ ] 实现 `GET /timeline`（学生时间线）

### 0.8-T07：S2 资料笔记——核心 API

- [ ] 开工前按索引触发并创建 `docs/subsystems/S2-资料笔记子系统PRD-NoteBuilder.md`
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

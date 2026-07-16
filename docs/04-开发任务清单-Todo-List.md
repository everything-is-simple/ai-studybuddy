# AI StudyBuddy 开发任务清单

**版本**：v1.15
**日期**：2026-07-16
**用途**：按阶段拆解具体开发任务，避免想到哪做到哪。每个任务有明确的完成标准。

> 当前进度：Phase 0.5/0.7/0.8 均已完成。Phase 1 已完成 T00 协作基线、T10 人工补文恢复、T03 S3 PRD、T11 考试确认与任务创建闭环、T02 Provider 健康熔断，以及 T03A S3 数据库与 Schema。S3 API/Service/Worker/前端尚未开始；当前下一实现门禁为 T03B，仍需独立计划和用户明确批准。各阶段任务按单一责任拆分。

---

## 阶段总览

| 阶段      | 目标                                    | 状态                                                               |
| --------- | --------------------------------------- | ------------------------------------------------------------------ |
| Phase 0   | 文档重建、旧草稿归档、七子系统命名      | ✅ 已完成                                                          |
| Phase 0.5 | 成熟开源组件在 composer 独立调通        | ✅ 已完成（MVP 主路径 smoke test 全部通过）                        |
| Phase 0.7 | Windows 原生轻量底座与异步家长报告验证  | ✅ 开发机验收完成（HP 实机兼容性复测待机会执行，不阻塞 Phase 0.8） |
| Phase 0.8 | 第一个可运行里程碑（S1 基础 + S2 核心） | ✅ 已完成（T09 隔离复验通过）                                      |
| Phase 1   | 跑通完整学习闭环（S1+S2+S3+S4+S6 简版） | 🔄 进行中（T00/T10/T02/T03/T11/T03A ✅；下一门禁 T03B）         |
| Phase 1.5 | 课堂录音 ASR（S7）                      | ⏳ 待开始                                                          |
| Phase 2   | 期末真题冲刺（S5）                      | ⏳ 待开始                                                          |
| Phase 3   | 打磨家长端、安全、性能                  | ⏳ 待开始                                                          |

---

## Phase 0.5：开源组件独立调通

**目标**：在 `I:\ai-studybuddy-composer` 先把每个组件跑起来，形成能力卡，再进主系统。

**Phase 0.5 完成标准**：MVP 主路径组件通过 smoke test，输入/输出格式已确认，能力卡和共同底座文档已回填。PaddleOCR、Kimi/Qwen、ASR、FFmpeg、Readability 等备选/后续组件不计入 Phase 0.5 完成门槛。

### 0.5-T01：环境准备

- [x] 确认 Node.js 18+、Python 3.8+、Docker Desktop 可支撑组件 smoke test
- [ ] 可选治理：在 `C:\Users\Administrator\.wslconfig` 写入内存上限（防 Docker Desktop WSL2 内存泄漏）：`memory=8GB processors=4 swap=2GB`
- [x] 创建 `I:\ai-studybuddy-composer` 目录结构（已完成）
- [x] 配置 `.env.example`，列出后续会用到的环境变量名（不填真实值）

> ⚠️ 常见坑：Node 命令不存在 → 去 nodejs.org 装 LTS；Python 是 2.x → 装 3.10+；Docker 图标未变绿就跑命令会报错，等它完全启动再操作。

### 0.5-T02：PDF 文本提取（MVP 必接）

- [x] 在 `I:\ai-studybuddy-composer\pdf\pdf-parse-demo\` 安装：`npm install`
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

- [x] 在 `I:\ai-studybuddy-composer\mindmap\markmap-test\` 安装：`npm install markmap-lib`
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
> 2026-07-09 实测：已创建 `I:\ai-studybuddy-composer\ai-provider\gpt-test`，按 cc-switch 导出的当前 Pixel provider `pixelapi-1783123721199` 读取 auth，使用 Pixel API 中转站 `https://ai-pixel.online/v1`、`wire_api=responses`、模型 `gpt-5.5` 通过。响应时间 11.9s，输入 tokens 460，输出 tokens 528，总 tokens 988；返回 Markdown、中文内容、思维导图 JSON 均通过。最初 401 根因是 `.env.local` 中手填 Key 与 cc-switch 正在使用的 provider key 不一致。DeepSeek 已按用户偏好废弃；Kimi 当前无 Key；GLM-5.2 已到期。

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
- [ ] tmp 清理脚本：清空 `I:\ai-studybuddy-tmp` 后系统可继续运行
- [ ] logs 规范验证：确认日志中不记录 API Key、学生隐私全文、完整答案

暂不进入 Phase 0.5 主线：SenseVoice、FunASR、FFmpeg、Readability。它们等 S7 或对应子系统开工前再调。

### Phase 0.5 完成声明

截至 2026-07-09，Phase 0.5 已完成并复测通过：PDF、RapidOCR、Markmap、Markdown/KaTeX、BullMQ、MinIO、PostgreSQL/pgvector、Pixel API 中转 AI Provider 均已通过 smoke test，T10 共同底座汇总已回填。

Phase 0.5 不包含 Windows 原生 SQLite、本地文件、持久化 Job、家长报告与 Windows 任务计划验证。这些替代底座能力独立收口为 Phase 0.7；Phase 0.7 完成后再进入 Phase 0.8 主系统实现。

---

## Phase 0.7：Windows 原生轻量底座验证

**目标**：在外部组件试炼场 `I:\ai-studybuddy-composer\windows-native\` 独立验证单机 Windows 方案。Phase 0.7 不修改 `I:\ai-studybuddy\packages\` 主系统代码；验证失败不得污染主系统骨架。

**完成标准（修订版，2026-07-11）**：SQLite、本地文件、SQLite Job Worker、RapidOCR 子进程、规则报告、QQ SMTP、飞书 Webhook、Windows 任务计划和整合链路均有能力卡，且真实 QQ/飞书凭据已通过真实送达验证。

门槛调整说明：原"HP 16GB 实机"硬性门槛已改为"开发机验收完成后即可进入 Phase 0.8；HP 实机（Windows 11、Node 22 LTS、16GB）作为可选兼容复测，在设备可用后执行，不阻塞主系统开发"。调整原因：开发机已完成所有功能性验证，HP 实机复测目的仅为兼容性确认，不应阻塞产品进展。

### 0.7-T01：Windows 原生环境基线

- [x] 在外部试炼场建立独立样例，不加入主系统 pnpm workspace（开发机 Node 25.4.0 兼容通过）
- [x] 记录开发机 Windows、Node、Python、内存与 Docker/WSL2 未运行状态
- [x] 创建 `.env.example`，不写真实 SMTP 授权码、Webhook 或 API Key

- [ ] 在孩子 HP 上用 Node.js 22 LTS 复测独立安装和环境基线（暂缓：设备不在身边）

### 0.7-T02：SQLite 基础与备份

- [x] 安装并验证 `better-sqlite3` 的 Windows x64 预编译模块（开发机 Node 25.4.0 兼容通过；Node 22 LTS/HP 暂缓复测）
- [x] 验证 WAL、CRUD、唯一约束、事务提交/回滚、关闭后备份与恢复（开发机离线通过）
- [x] 建立 `courses`、`study_tasks`、`study_events`、`jobs`、`report_deliveries` 最小 schema（开发机离线通过）

### 0.7-T03：本地文件存储

- [x] 验证 `materials/<course-id>/<yyyy-mm-dd>/`、`tmp/<job-id>/`、`exports/<yyyy-mm>/` 目录（开发机离线通过）
- [x] 验证写入、读取、删除、临时文件清理和路径越界拒绝（开发机离线通过）
- [x] 只保存逻辑 `storage_key`，不把绝对路径写入业务数据（开发机离线通过）

### 0.7-T04：SQLite Job Worker

- [x] 验证单进程串行领取 `pending` Job（开发机离线通过）
- [x] 验证首次失败后重试成功、达到上限后失败、过期 `running` Job 恢复（开发机离线通过）
- [x] 验证进程重启后待处理 Job 不丢失（开发机离线通过）

### 0.7-T05：RapidOCR 子进程

- [x] Node 用 `child_process` 调 Python RapidOCR，stdout 只返回 JSON（开发机离线通过）
- [x] 验证成功、文件不存在、非零退出、超时终止（开发机离线通过；HP 峰值暂缓复测）
- [ ] 记录 OCR 运行峰值内存，确认 Python 进程完成后退出（**⏳ 非阻塞技术债**：尚未在当前开发机补充记录）

### 0.7-T06：规则报告与 AI 失败兜底

- [x] 用 SQLite 统计课程、任务、完成/逾期、学习时长、日周月趋势和考前提醒（开发机离线通过）
- [x] 验证 AI 润色成功时附加总结，失败时仍发送规则报告（开发机离线通过）
- [x] 验证报告不含资料原文、笔记正文、答案或聊天内容（开发机离线通过）

### 0.7-T07：QQ SMTP 邮件

- [x] 用 `nodemailer` 验证 QQ SMTP HTML 中文报告和可选附件（真实通过）
- [x] 验证错误授权码/网络失败写入诊断但不泄露授权码
- [x] 用真实父母收件邮箱完成一次手工验证（163 测试邮箱已收到）

### 0.7-T08：飞书 Webhook

- [x] 验证完整日报卡片、周报/月报合并区块、考前提醒区块（真实通过）
- [x] 验证 Webhook 失败不阻止邮件渠道
- [x] 用父母飞书群真实收到卡片完成手工验证

### 0.7-T09：Windows 任务计划

- [x] 使用临时 `AIStudyBuddy-Phase07-Smoke` 任务验证 `report.js`、日志、退出码和删除清理（管理员 PowerShell 真实通过）
- [x] 验证 `StartWhenAvailable=true` 和固定周期发送记录去重：`report:2026-05-31`
- [x] 记录正式 22:30 日报、周日/月末合并报告、考前 7/3/1 天提醒的规则

### 0.7-T10：整合链路与 HP 实机验收

- [x] 开发机跑通离线整合：课程/任务 → 本地资料 → OCR → SQLite/文件 → 规则报告 → 渠道去重；QQ SMTP、飞书与 Windows 任务计划另行真实通过（HP 实机暂缓）
- [x] 用固定 `2026-05-31 22:30 Asia/Shanghai` 验证日报、周报、月报、考前提醒合并（开发机离线通过）
- [ ] 在孩子 HP Pavilion Aero（Windows 11、Ryzen 5 5625U、16GB）复测（**⏳ 兼容性验证，非阻塞**）
- [ ] 验收：学习服务可用内存 ≥6GB；OCR/AI/报告峰值可用内存 ≥3GB；无持续分页增长（**⏳ 待 HP 设备可用后执行**）

---

## Phase 0.8：第一个可运行里程碑

**目标**：

```
学生创建课程与考试目标
  → 上传 PDF/图片/文本
  → 格式转换为纯文本
  → 中转 GPT/Claude 生成结构化笔记 + 重点 + 思维导图 + 带来源证据的知识模块
  → 规则生成可完成的学习任务
  → 前端能看到笔记、导图、知识模块和任务
```

**前置条件**：Phase 0.7 开发机验收完成（已满足）。`packages/` 不得把试炼场代码直接当成产品实现。HP 实机兼容复测在设备可用后执行，不阻塞本阶段。

**完成标准**：前置条件满足后，端到端流程可以演示；不需要完整功能，只需核心路径跑通。

### 0.8-T01：项目结构初始化

- [x] 在 `I:\ai-studybuddy` 初始化 monorepo（pnpm workspace，已存在并验证）
- [x] 创建基础包结构：`packages/shared`、`packages/backend`（已验证编译通过）；`packages/frontend` 目录存在，待补 `package.json`（T08 阶段补齐）
- [ ] 配置 TypeScript（已完成）；ESLint、Prettier 待补（非阻塞 T02）
- [x] 配置 `.env.example`（T02 开发时同步补齐，已完成）

### 0.8-T02：共同底座——数据库与迁移

- [x] 基于 Phase 0.7 结果选定 SQLite + `better-sqlite3`；实现项目内简单版本递增 migration runner，不引入额外 migration 框架
- [x] 创建第一批底座表：全局库 `students`、`semesters`、`backup_records`；学期库 `course_instances`、`assessment_attempts`、`study_tasks`、`study_events`、`jobs`、`report_deliveries`。其中 `students`/`course_instances`/`assessment_attempts` 分别对应单孩子档案/课程/考试目标的当前存储边界
- [x] 创建第二批表：`materials`、`normalized_texts`、`structured_notes`、`mind_maps`、`knowledge_modules`
- [x] `assessment_attempts` 具备课程关联、名称、`exam_at`、目标、每日可学习时间、范围摘要、来源与识别置信度、孩子确认基础字段；7/3/1 提醒的正式读取逻辑留待 T06 API 实现
- [x] `knowledge_modules` 具备课程关联、标题、重要度、难度、考察内容、来源资料/证据、学习状态；不保存或复制完整资料正文
- [x] 明确不创建 `questions`、`practice_sessions`、`practice_answers`、`mistakes`、`weak_points`：它们等待 S3/S4 PRD 触发后再迁移
- [x] 启用 WAL、foreign keys、严格迁移版本检查；以干净 `dist/` 运行自动化测试，验证日期校验、初始化成功、重复拒绝、rename/ready 故障全量补偿、分学期隔离、损坏库备份恢复
- [x] T06 前补齐 S1 业务字段与迁移：课程表 `schedule_entries`、考试 `confirmation_status`/`confirmed_at`/变更历史；它们尚未驱动倒计时、提醒或家长报告

> 2026-07-11 T02-R 收尾证据：`pnpm type-check`、`pnpm test` 均通过；测试从清空 `dist/` 与 `tsconfig.tsbuildinfo` 开始构建，确认 SQL schema 已随 TypeScript 产物进入 `dist/`，不存在旧 `.sql` 运行态依赖。

### 0.8-T03：共同底座——文件存储接口

- [x] 封装 `StorageAdapter`，对接本地文件目录
- [x] 实现：上传文件、localhost API 流式下载、逻辑 `storage_key`
- [x] 文件写入 `APP_DATA_ROOT`（通过环境变量配置）
- [x] 路径越界拒绝与 `storage_key` normalize 校验
- [x] 吸纳 GPT 反馈：读操作不隐式创建空库/目录

> 2026-07-11 T03 收尾证据：`pnpm type-check`、`pnpm test` 均通过；新增 `StorageAdapter`、`/api/dev/storage/*`、db-readonly 回归测试；`multer` 单文件大小限制 50MB。

### 0.8-T04：共同底座——格式转换层

- [x] 封装 `PdfConverter`（复用 0.5-T02 调通的 pdf-parse）
- [x] 封装 `OcrConverter`（复用 0.5-T03 调通的 RapidOCR；PaddleOCR 作为备选对比，不阻塞）
- [x] 封装 `TextConverter`（Markdown/纯文本直接入库）
- [x] 统一输出格式：`ConverterResult { ok, sourceType, text, metadata, warnings, error }`

> 2026-07-11 T04 收尾证据：`pnpm type-check`、`pnpm build`、`pnpm test` 均通过；新增 `PdfConverter`/`OcrConverter`/`TextConverter`、`ocr-worker.py`、`/api/dev/converter/*` 与回归测试；`pdf-parse` 固定版本 2.4.5，OCR Python 脚本通过 build 脚本复制到 `dist/scripts`。
> **资料格式边界（T04 基线）**：

| 输入                | 当前策略                                   | 目标阶段             |
| ------------------- | ------------------------------------------ | -------------------- |
| PDF                 | `PdfConverter` 提取文本；扫描版转 OCR 路径 | T04 已支持           |
| JPG/JPEG/PNG 等图片 | `OcrConverter` 调 RapidOCR                 | T04 已支持           |
| TXT/MD/CSV/JSON     | UTF-8 文本直接读取；不承诺结构化语义       | T04 已支持           |
| DOCX                | `mammoth` 提取正文                         | T04A 验证，T04B 装配 |
| PPTX                | `jszip` + XML 提取文字层；图片文字转 OCR   | T04A 验证，T04B 装配 |
| HTML/HTM、网页 URL  | DOM 解析 + Readability 提取正文            | T04A 验证，T04B 装配 |
| 音频                | 暂不处理，后续 ASR 任务                    | 后续阶段             |
| 视频                | 仅预留，不进入当前上传支持                 | 后续阶段             |

**明确不支持**：`.doc`、`.xls/.xlsx`、`.ppt`、`.odt/.ods/.odp`、`.rtf`、`.epub`、`.zip/.rar/7z`、`.eml/.msg` 及其他 Office/容器格式。上传这些格式必须返回明确的“请另存为 PDF、DOCX、PPTX 或文本/图片”提示；不得静默按二进制文本读取。

### 0.8-T04A：扩展格式支持——composer 试炼场调通

**目标**：在 `I:\ai-studybuddy-composer` 逐一调通四类格式的开源处理方案，形成能力卡，再装配进主系统。处理后均输出纯文本，接口与 T04 已有的 `ConverterResult` 保持一致。

**状态**：✅ 已完成（2026-07-11）。能力卡与 smoke test 均通过，四类格式输出结构已与 `ConverterResult` 对齐。

**优先级排序（高→低）**：

- [x] **DOCX**（Word 现代格式）
  - 方案：`mammoth`（MIT 许可）+ `jszip` + `jsdom`
  - 目录：`I:\ai-studybuddy-composer\converter\docx-test\`
  - 完成标准：正文提取完整，图片/图表占位符标注，空文档返回明确错误提示
  - 能力卡：`I:\ai-studybuddy-composer\converter\docx-test\COMPONENT-CARD.md`
  - 旧版 `.doc`（Word 97-2003）：提示用户"另存为 DOCX 后重新上传"，不做二进制解析

- [x] **URL 抓取**（网页链接）
  - 方案：`undici`（显式 `fetch` + `Agent` 作为 `dispatcher`）+ `jsdom` + `@mozilla/readability`
  - 目录：`I:\ai-studybuddy-composer\converter\url-fetch-test\`
  - 完成标准：正文去除导航栏/广告，中文编码正确，请求失败（超时/404/反爬）返回明确错误
  - 能力卡：`I:\ai-studybuddy-composer\converter\url-fetch-test\COMPONENT-CARD.md`
  - 百度百科、知乎等强反爬 URL：当前以"抓取失败，请手动复制正文"提示，不做代理绕过
  - 安全边界：仅允许 `http/https`；禁止 user-info、localhost、私网、回环、链路本地和文件协议；DNS 全地址公网校验；连接复验（`undici.Agent.lookup`）；限制响应大小 5 MB、重定向 3 次、请求超时 10 秒；不执行网页脚本

- [x] **PPTX**（PowerPoint 现代格式）
  - 方案：`jszip`（MIT 许可）解压 .pptx zip 包，正则提取 `<a:t>` 节点文本，按幻灯片序号组装
  - 目录：`I:\ai-studybuddy-composer\converter\pptx-test\`
  - 完成标准：各页文本按顺序提取，嵌入图片内的字注明"需走 OCR"，纯图片幻灯片不报错
  - 能力卡：`I:\ai-studybuddy-composer\converter\pptx-test\COMPONENT-CARD.md`
  - 旧版 `.ppt`（PowerPoint 97-2003）：提示用户"另存为 PPTX 或 PDF 后重新上传"

- [x] **HTML 文件**（`.html`/`.htm` 本地文件）
  - 方案：`jsdom` 构造 DOM + `@mozilla/readability` 解析本地 HTML（与 URL 方案共用）
  - 在 `url-fetch-test` 中追加本地 HTML smoke test：`npm run smoke:html -- samples\course-notice.html`
  - 完成标准：正文提取正确，`<script>`/`<style>` 剥除，中文无乱码；Readability 失败时 fallback 到 body 并给出 warning

> **T04A 收尾证据（2026-07-11）**：
>
> - DOCX：`npm test` 4/4 通过；`samples/chinese-with-image-and-chart.docx` 中文正文完整、`embeddedVisualCount=3`；`samples/empty.docx` 受控失败；版本 mammoth 1.12.0 / jszip 3.10.1 / jsdom 26.1.0。
> - URL/HTML：初始 `npm test` 22/22 通过；审查修复后 25/25 通过，新增 dispatcher 传入、连接层回环 DNS 拒绝、错误响应 body 取消与 Agent `finally` 关闭回归；本地 HTML 中文正文提取成功；真实 URL `https://zh.wikipedia.org/wiki/%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD` 首次抓取成功（`ok: true`，`charCount=124722`，`byteCount=2375227`，`durationMs=5467`），重复访问触发 429 反爬后受控返回人工出口；版本 undici 7.28.0 / jsdom 26.1.0 / @mozilla/readability 0.6.0。
> - PPTX：`npm test` 5/5 通过；三页按数字序、含图页 OCR 提示、纯图片页 `ok: true`；审查修复将原恒真断言替换为命名/十进制/十六进制 XML entity 实测解码；版本 jszip 3.10.1。
> - 全部能力卡已填，主系统 `I:\ai-studybuddy\packages` 未修改。

> **不在本任务范围**：Excel、旧版 Office、OpenDocument、RTF、EPUB、压缩包、邮件附件、音频和视频均不在 T04A/T04B；需要时另立任务并先在 composer 验证。

### 0.8-T04B：扩展格式支持——装配进主系统

**前置条件**：0.8-T04A 全部完成（能力卡已填，smoke test 通过）—— 已满足。

- [x] 新增 `DocxConverter` 封装 mammoth，统一实现 `convert(input: Buffer | string): Promise<ConverterResult>`
- [x] 新增 `UrlFetcher` 封装 fetch + Readability，统一接口 `fetch(url: string): Promise<ConverterResult>`
- [x] 新增 `PptxConverter` 封装 jszip + XML 提取，统一接口与上一致
- [x] `TextConverter` 扩展支持 `.html`/`.htm` 文件（复用 Readability）
- [x] 在 `dev-converter.ts` 补充对应 `/api/dev/converter/docx`、`/url`、`/pptx` 端点，供 smoke test 验证
- [x] 更新文件类型路由：上传接口按扩展名/MIME 分派到对应 Converter，`.doc`/`.ppt`/`.xls` 返回友好提示而非静默失败
- [x] `pnpm type-check`、`pnpm build`、`pnpm test` 全部通过
- [x] 运行 `scripts/check-docs-governance.ps1`，无报错后提交

> **T04B 审查修复证据（2026-07-12）**：
>
> - 修复 URL 重定向链共享 10 秒总 timeout、IPv6/IPv4-mapped IPv6 SSRF 字面量拦截，以及 HTTP/HTTPS 跨协议端口拒绝；DNS `connect.lookup` 复验保留。
> - URL Dev API 失败现返回标准 `ApiError` 信封和稳定错误码；DOCX/PPTX 的 `string` 输入统一解释为本地文件路径。
> - 验证：`pnpm type-check`、`pnpm build`、`pnpm test`（71/71）、`scripts/check-docs-governance.ps1` 与 `git diff --check` 全部通过。

### 0.8-T05：共同底座——AI Provider Router

**状态**：✅ 已完成（2026-07-12）。

- [x] 安装 `openai` SDK，环境变量支持 `AI_PROVIDERS` JSON 数组、`AI_TIMEOUT_MS`，并保留 `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL` 向后兼容
- [x] 抽象 `AiProvider` 接口，实现 `OpenAiProvider`（支持构造函数注入 `fetch` 便于测试）
- [x] 实现 `AiProviderRouter` 多 Provider 轮询链：按 `priority` 升序尝试，首个成功即返回，全部失败抛 `AI_ALL_PROVIDERS_FAILED`
- [x] 实现 `AiLogger`，仅记录 `taskType`、`provider`、`model`、`tokenUsed`、`latencyMs`、`fallbackUsed`、错误码与信息，**不记录 `inputText` 与生成的 `content`**
- [x] 暴露 Dev API `POST /api/dev/ai/generate`，返回标准 `ApiSuccess<AiResponse>`/`ApiError`；未配置返回 `AI_NOT_CONFIGURED`（503），全部失败返回 `AI_ALL_PROVIDERS_FAILED`（502）
- [x] 单元测试覆盖：单 Provider 成功、fallback 到第二 Provider、全部失败、超时 fallback、未配置、OpenAI 响应解析
- [x] `pnpm type-check`、`pnpm build`、`pnpm test`（77/77 通过）、`scripts/check-docs-governance.ps1`、`git diff --check` 全部通过

> **T05 收尾证据（2026-07-12）**：`ai-router.test.mjs` 6 个测试通过；mock fetch 监听 `init.signal` abort 以验证 timeout fallback；Router 通过构造函数注入 `providers`/`fetch` 实现无真实网络依赖的测试。

### 0.8-T06：S1 学习节奏——核心 API

**状态**：✅ 已完成（2026-07-13）。

- [x] 实现 `POST /courses`、`GET /courses`；`retakeOfCourseInstanceId` 仅校验 UUID 格式并原样保存，不校验跨学期存在性
- [x] 实现 `POST /exams`、`GET /exams`；课程可有多个考试目标，考试按 `exam_at` 升序返回；`confirmation_status`/`confirmed_at` 替代 v1 `child_confirmed`
- [x] 实现 `POST /study-tasks`、`PATCH /study-tasks/:id/status`；可写状态仅限 `todo | doing | pending_quality_check | done | skipped`，`overdue` 仅作为 `derivedOverdue` 派生展示字段，不写入 `status`
- [x] 任务可关联考试和知识模块；优先级 `priorityBucket` 由服务按派生逾期、已确认考试日期、截止时间确定性派生，不持久化
- [x] 实现 `POST /study-events`（供 S1/S2/S3/S4/S5/S7 写入时间线）；`sourceSystem` 限定为 `S1 | S2 | S3 | S4 | S5 | S7`
- [x] 实现 `GET /timeline`（学生时间线）；默认 50 条、最大 200 条，按 `occurred_at DESC` 返回，支持 `courseInstanceId` 过滤与学期隔离
- [x] 任务首次进入 `done` 时写入唯一 `study_task_completed` 事件；重复 PATCH `done` 为幂等 no-op，不重复写事件
- [x] 新增 `StudyRhythmService` 集中业务逻辑，新增 `packages/backend/src/api/study-rhythm.ts` 作为正式 `/api` 路由，不放入 `/api/dev`
- [x] `pnpm type-check`、`pnpm build`、`pnpm test`（94/94 通过）、`scripts/check-docs-governance.ps1`、`git diff --check` 全部通过

> **T06 收尾证据（2026-07-13）**：新增 `packages/backend/src/services/study-rhythm-service.ts`、`packages/backend/src/api/study-rhythm.ts`、`packages/backend/src/db/sql/migration-semester-v2.ts`、`packages/backend/test/study-rhythm-api.test.mjs`；更新 `packages/shared/src/types.ts`、`packages/backend/src/db/migrations.ts`、`packages/backend/src/server.ts`、`packages/backend/test/semester-initialization.test.mjs`。S1 API 集成测试 15/15 通过；全量测试 94/94 通过。2026-07-13 审查收尾修复：`PATCH /api/study-tasks/:id/status` 对显式传入的非法 `occurredAt` 返回 `TASK_STATUS_INVALID`，不再静默使用当前时间，也不会写入完成事件。`derivedOverdue` 与 `priorityBucket` 均不在数据库持久化；未确认考试不参与优先级；跨学期 `retakeOfCourseInstanceId` 合法 UUID 原样保存；API 始终返回标准 `ApiSuccess<T>` / `ApiError` 信封。

### 0.8-T07：S2 资料笔记——核心 API

- [x] 开工前按索引触发并创建 `docs/subsystems/03-S2-资料笔记子系统PRD-NoteBuilder.md`
- [x] 实现 `POST /materials/upload`（上传 PDF / 图片 / 文本 / DOCX / PPTX，URL 延后）
- [x] 接入格式转换层，由 SQLite Job Worker 异步处理；转换失败保留原始文件并支持重试/手动粘贴
- [x] 接入 AI Provider Router，生成结构化笔记 + 重点 + 思维导图数据；AI 不可用时保留 normalized_text 并进入 `pending_quality_check`
- [x] 实现 `GET /knowledge-modules`（按课程读取）与模块状态更新；不开始练习/错题表实现
- [x] 实现 `GET /notes/:id`（获取笔记详情）

> **T07 收尾证据（2026-07-13）**：新增 `packages/backend/src/api/note-builder.ts`、`packages/backend/src/services/note-builder-service.ts`、`packages/backend/src/services/material-job-worker.ts`、`packages/backend/src/db/sql/migration-semester-v3.ts`、`packages/backend/test/note-builder-api.test.mjs`；更新 `packages/backend/src/db/migrations.ts`、`packages/backend/src/server.ts`、`packages/shared/src/types.ts`、`packages/backend/test/semester-initialization.test.mjs`。S2 集成测试覆盖文本上传、Worker 转换、AI 未配置降级、资料详情、非法重试、mock AI 成功生成笔记/思维导图/知识模块、materials 列表元数据、knowledge_modules 分页响应、MIME 不匹配拒绝和 StudyEvent 证据字段；全量后端测试 96/96 通过。

### 0.8-T08：前端——最小可用页面

**状态**：✅ 已完成（2026-07-13）。

- [x] 页面 1：课程列表 + 创建课程/考试目标
- [x] 页面 2：资料上传（拖拽或选择文件）
- [x] 页面 3：笔记展示（react-markdown + KaTeX + Markmap 渲染）+ 知识模块与对应学习任务
- [x] 不要求样式完美，要求功能可用

> **T08 收尾证据（2026-07-14）**：新建 `packages/frontend/` 包（React 18 + Vite + TypeScript + react-router-dom），含 `api-client.ts`、`study-rhythm-api.ts`、`note-builder-api.ts`、`use-api-request.ts`、`use-material-polling.ts`、三页 MVP 页面、App Shell、全局样式与 API 客户端回归测试；后端补丁统一 `listMaterials`/`getMaterial` 汇总 SQL 并返回 `noteId`，`MaterialDto` 增加 `noteId` 字段，新增 `noteId` 回归断言。2026-07-14 修复前端 S1 API 契约：考试改用 `/api/exams` 并传递 `semesterId`，新增 `GET /api/study-tasks` 供笔记页读取关联任务。验证：`pnpm type-check` 零错误、前后端构建和测试通过、浏览器验收创建课程/考试目标与资料上传成功、`scripts/check-docs-governance.ps1` 通过、`git diff --check` 无尾部空白。

### 0.8-T09：端到端验证

- [x] 完整走一遍流程：创建课程/考试目标 → 上传 PDF → 等待转换 → 查看笔记 → 生成知识模块/学习任务
- [x] 验证：笔记 Markdown 渲染正确、思维导图可展示、每个模块能回链到来源资料、考试目标能影响任务优先级
- [x] 记录 AI 调用 token 消耗和响应时间
- [x] 临时文件清理不影响笔记数据

> **T09 真实 E2E 结论（2026-07-14，未通过，不勾选完成）**：两次隔离 run 均使用合成文本 PDF，转换均成功并保留 normalized text；无 Provider run 在有限重试后正确进入 `pending_quality_check`，页面显示“需要人工补文”且刷新不白屏。真实 Provider run 的 `note_generate` Job 3 次尝试均收到 Provider 成功响应（token：701/784/831；耗时约：15.4/20.0/16.2 秒），但响应后的严格 JSON 解析失败，未生成结构化笔记、思维导图或知识模块；因此 Markdown/KaTeX/Markmap、模块来源、模块关联任务及 tmp 清理后的笔记读回均**未通过或未执行**，第一个里程碑不能验收为完成。
>
> 同次浏览器验收发现：课程可创建，但考试表单初始状态无法保留必填输入，不能从浏览器提交考试；此前 T08 留档中的“浏览器创建考试目标成功”不再作为有效证据。API 仅证明 `priorityBucket` 的读取时派生：过期任务为 0、同一未来 deadline 的 confirmed 考试关联任务为 1、pending 考试关联任务为 2；这不证明浏览器可确认考试、创建任务或按 bucket 排序。`pending_quality_check` 的 `replace-text` 返回 `INVALID_STATUS`，这符合当前后端只允许 `conversion_failed` 补文的规则；实际缺口是资料页未接入可用补文入口，恢复 UX 与页面状态提示尚未统一。
>
> 独立审查补充：当前 Worker 的 `setInterval` 不等待 `runOnce()`，慢 AI 时理论上允许重叠；本次未观察到重入，不能写成“已证明串行”。前端轮询在页面隐藏时也不会停止，状态变化不重置退避。当前 OCR 临时文件使用系统临时目录，尚无 `APP_DATA_ROOT\tmp` 清理实现或“清理后笔记读回”自动化证据。
>
> 下一步门控：先以脱敏错误摘要复核并修复真实 Provider 响应的 JSON 解析契约，再重跑成功 run；不应在主路径失败时提前立项 T10/T11 或删除 tmp。隔离 evidence 仅保留仓库外的短哈希、状态、计数、允许的模型/token/耗时字段与截图，不含密钥、Provider URL、正文或完整 UUID。
>
> **T09 修复后复验（2026-07-15，预算放宽后通过并勾选完成）**：`4f595c6` 修复 AI JSON 解析与考试表单受控值，`20a67c6` 收紧解析失败错误摘要并补敏感哨兵测试。隔离复验中，真实 Provider 主路径已完成 PDF 转换、AI 笔记、Markdown/KaTeX/Markmap、4 个知识模块、来源关联和 `material_note_completed` 事件；浏览器可纯操作创建 pending 考试；无 Provider 降级仍进入 `pending_quality_check` 且刷新不白屏；按 run 白名单删除 `semesters/<semesterHash>/tmp` 后，重启后端仍可通过 API 与浏览器读回笔记和模块。AI 调用记录 token 1949、耗时 31,987 ms；2026-07-15 用户批准首次 AI 预算从 30 秒放宽到 35 秒，本次复验落入预算。任务创建、考试确认 UI、人工补文恢复闭环、Worker 单飞与轮询优化仍作为 T10/T11/后续独立任务，不纳入 T09 完成范围。

---

## Phase 1：完整学习闭环

**目标**：在不扩大架构的前提下，跑通 S1 + S2 + S3 + S4 + S6 简版；主界面逐步围绕”一个考试项目”组织，而不是围绕数据库对象组织。

**前置条件**：Phase 0.8 T09 已通过。S1/S2 PRD 已存在且 MVP 已实现；S3 PRD 已在获批的 T03 文档任务中创建；S4/S5/S6/S7 仍未触发。

### Phase 1 真实执行顺序

> 编号 T10/T11/T02 沿用历史追溯编号，不代表执行先后。真实执行顺序以下表为准。

| 顺序 | 任务 | 状态 | 范围与门禁 |
| ---- | ---- | ---- | ---------- |
| 1 | Phase 1-T00：协作基线与路线图 | ✅ | 更新 `CLAUDE.md`、`AGENTS.md`、`docs/00`、`docs/04`、`docs/07`，新建 `docs/12`；不改业务代码 |
| 2 | Phase 1-T10：人工补文恢复闭环 | ✅ | 修复 AI 失败或质量待确认后的人工补文 UX、状态提示和恢复路径；不改变 Provider Router 架构 |
| 3 | Phase 1-T11：考试确认与任务创建闭环 | ✅ | 浏览器可确认考试、进入多考试工作台、创建归属任务并更新状态；不含跨考试自动排程 |
| 4 | Phase 1-T02：Provider 健康熔断 | ✅ | 在现有优先级故障转移基础上完成连续失败 5 次、10 分钟冷却、恢复探测、全冷却错误和脱敏日志；不做每请求轮换 |
| 5 | Phase 1-T03：S3 PRD 编写 | ✅ | 按门禁创建 S3 轻量 PRD；不写业务代码 |
| 6 | Phase 1-T03A：S3 数据库与 Schema | ✅ | 学期库 migration v4、`practice_sessions`、`questions`、`practice_answers`、最小 shared 类型与数据库约束/升级测试已完成；不含 API |
| 7 | Phase 1-T03B：S3 练习生成 API | ⏳ | AI 根据笔记/知识模块生成选择题/填空题并入库；不含批改 |
| 8 | Phase 1-T03C：S3 限时作答与规则批改 | ⏳ | 学生限时作答、客观题规则批改、记录逐题结果；不含错题归档 |
| 9 | Phase 1-T03D：S3 练习前端闭环 | ⏳ | 浏览器可发起练习、作答、查看批改结果；集成进工作台”练习”区 |
| 10 | Phase 1-T04：S4 PRD 编写 | ⏳ | S3 MVP 验收后触发；创建 S4 轻量 PRD |
| 11 | Phase 1-T04A：S4 错题归档与 Schema | ⏳ | 创建 `mistakes`、`weak_points` 表；练习错题自动归档 |
| 12 | Phase 1-T04B：S4 错题改错前端 | ⏳ | 浏览器可查看错题、重做、标记掌握；集成进工作台”查漏补缺”区 |
| 13 | Phase 1-T05：回流规则 | ⏳ | 错题/薄弱点提升关联知识模块优先级；已掌握后降低复习频率 |
| 14 | Phase 1-T06：S6 PRD 编写 | ⏳ | S4 完成后触发；创建 S6 轻量 PRD |
| 15 | Phase 1-T06A：S6 家长报告生成 | ⏳ | 规则统计 + AI 润色生成日报/周报/月报/考前提醒 |
| 16 | Phase 1-T06B：S6 报告推送渠道 | ⏳ | QQ SMTP + 飞书 Webhook 推送；失败不丢报告 |
| 17 | Phase 1-T07：S1 时间线扩展 | ⏳ | 接收 S2/S3/S4 的 StudyEvent，时间线完整可读 |

> **执行纪律**：上表中的每一行是单一责任的工作包，不因列入路线图自动获得实施授权。未完成行开始前都必须有对应 `.plans/` 文件、独立审查和用户明确批准；下方复选项是该工作包的可验收责任，不可用来跳过门禁。

> **T00 收尾证据（2026-07-15）**：创建 `docs/12-开发规范-Dev-Rules.md`，重写 `CLAUDE.md`/`AGENTS.md` 为入口引用 docs/12，更新 `docs/00`/`docs/04`/`docs/07`/`docs/09` 状态。8 文件变更，700+ / 459−。commit `ec536df`。

> **T10 收尾证据（2026-07-15）**：后端 `replaceText()` 限定只允许 `conversion_failed` 与 `pending_quality_check` 进入人工完整正文替换，拒绝 `pending`、`converting`、`note_generating`、`completed` 等非恢复态；人工正文作为新的 normalized text 版本写入，记录 `manual` metadata，清空转换/AI 错误并重新创建受限 `note_generate` Job，不改 Provider Router 架构。前端资料卡在失败态内联展示”粘贴完整正文”textarea、空正文禁用、超长提示、提交成功后关闭表单并刷新列表，API 错误显示在当前资料卡附近。新增 API、Worker 与前端测试覆盖手动恢复、竞争 Job 拒绝、AI 失败后重新获得生成机会和原始上传文件保留；验证通过：隔离 `APP_DATA_ROOT=I:\ai-studybuddy-tmp\runs\phase1-t10-full-test` 下 `pnpm test` 通过；隔离 smoke run 使用 Edge 真实浏览器打开 `/materials`，完成学期 ID 应用、课程选择、`pending_quality_check` 补文入口展示、空正文禁用、输入后提交、成功提示与表单关闭，截图留在 `I:\ai-studybuddy-tmp\runs\phase1-t10-smoke\browser-smoke-success.png`。commit `d053770`，merge `3ec811b`。

> **T11 收尾证据（2026-07-15）**：新增单考试查询与 pending 确认 API，确认事务写入固定 S1 证据事件并立即驱动任务优先级；课程页提供确认入口，confirmed 考试可进入 `/exams/:examId` 工作台。工作台展示日期、倒计时、当前考试任务进度和任务闭环，支持 confirmed 考试切换、近期最多 5 场概览、pending 待确认边界及前后 7 天只读提示；资料导航通过白名单校验的 `courseInstanceId` 保持课程上下文。验证通过：`pnpm type-check`、后端 build、前端 build、隔离全量测试（后端 109/109、前端 32/32）及 Playwright Chromium 1/1；浏览器证据保存在仓库外 `I:\ai-studybuddy-tmp\runs\phase1-t11-20260715-master-final-e2e-retry\playwright`。实现提交 `ff6322e`、`57a94ca`、`78619fa`，已快进合并到 `master`，最终 HEAD 为 `04e6f37`；当前本地 `master` 尚未 push。未实现跨考试自动排程、智能任务平衡、模拟考、临考速背或 S3 业务代码。

### Phase 1 产品组织原则

- 借鉴 KaoBuddy 的信息架构，但不复制源码、视觉、文案或资产。
- 页面逐步围绕”考试项目工作台”组织：总览 → 资料 → 计划 → 练习 → 查漏补缺 → 冲刺。
- 顶部长期显示考试日期、倒计时和总体进度。
- 每个空状态都告诉学生下一步做什么。
- 模拟考和临考速背属于 S5 / Phase 2；Phase 1 只预留信息架构，不提前实现。

### Phase 1 各任务详细拆解

#### T11：考试确认与任务创建闭环（已完成）

> 本任务于 2026-07-15 获明确批准后按 `.plans/phase1-t11-exam-confirmation-and-task-closure-plan.md` 完成；以下范围已通过自动化与 Chromium 浏览器验收。

- [x] **T11-A 考试查询与确认 API**：单考试读取、确认状态矩阵、幂等、学期隔离与确认事件。
- [x] **T11-B 课程页确认入口**：pending 的确认动作、confirmed 的工作台入口与操作错误反馈。
- [x] **T11-C 单考试工作台壳**：`/exams/:examId`、confirmed 倒计时、当前考试任务进度、空状态和 URL 刷新保持。
- [x] **T11-D 当前考试任务闭环**：手工创建绑定当前考试的任务，以及 `todo → doing → done` 状态动作。
- [x] **T11-E 多考试视角**：已确认考试切换器、近期最多 5 场概览、pending 的非倒计时展示及前后 7 天只读提示。
- [x] **T11-F 资料导航上下文**：`courseInstanceId` 查询参数白名单验证、预选和手动切换 URL 同步。
- [x] **T11-G 验收与收尾**：后端集成、前端组件、Playwright Chromium、文档治理与提交证据。

#### T02：Provider 健康熔断（已完成）

- [x] 后端：在 `AiProviderRouter` 增加按 Provider 实例隔离的连续失败计数
- [x] 后端：连续失败第 5 次后进入 10 分钟冷却，冷却期间跳过且以 `AI_PROVIDER_COOLDOWN` 记录尝试摘要
- [x] 后端：冷却到期允许恢复探测；成功清零，失败立即开启新的 10 分钟冷却
- [x] 后端：全部 Provider 冷却且没有真实调用时抛 `AI_ALL_PROVIDERS_COOLING_DOWN`，只含 Provider 名称和最早恢复时间
- [x] 后端：记录 `AI_PROVIDER_CIRCUIT_OPENED` / `AI_PROVIDER_CIRCUIT_CLOSED` 脱敏日志，不接收 Error、Key、URL、正文或完整 UUID
- [x] 测试：覆盖阈值、跳过、恢复、重新熔断、Provider/Router 隔离、全冷却、混合失败与最早恢复时间
- [x] 测试：两个 `OpenAiProvider` 使用受控 `.invalid` fetch 验证 fallback 和冷却跳过，不访问真实外部 Provider

> **T02 收尾证据（2026-07-16）**：按已批准的 `.plans/phase1-t02-provider-health-circuit-breaker-plan.md` 在隔离 worktree 实施。最终验证使用 `APP_DATA_ROOT=I:\files\run\redacted\run-phase1-t02-final-001`：`pnpm type-check`、后端 build、前端 build 均通过；`ai-router.test.mjs` 17/17、后端全量 120/120、前端全量 32/32 通过。未新增数据库、migration、环境变量、真实外部 Provider 请求、S3 业务代码或 S4–S7 PRD。

#### T03：S3 限时练习（拆为 PRD + 3 个实现子任务 + 前端）

**T03 PRD（已完成，纯文档）**
- [x] 读 docs/00 确认 S3 门禁已满足
- [x] 创建 `docs/subsystems/03-S3-限时练习子系统PRD-PracticeRunner.md`
- [x] 更新 docs/00 索引

**T03A Schema（已完成）**（已按获批计划实施并通过验收；下一门禁为 T03B）

> **T03A 完成证据（2026-07-16）**：已新增学期库 migration v4、`practice_sessions`、`questions`、`practice_answers` 三表、11 个索引、8 个跨表一致性 trigger 与 S3 最小 shared 类型；7/7 专项数据库集成测试覆盖 fresh/v3 升级、约束、关联、父子更新和级联语义。最终 `pnpm type-check`、后端 build、前端 build 均通过，后端全量 127/127、前端全量 32/32 通过。未实现 S3 API、Service、Worker、AI 调用、前端或错题归档。

- [x] 创建 `questions` 表（题型、题干、选项、答案、题目顺序、难度、关联知识模块/来源资料）
- [x] 创建 `practice_sessions` 表（考试关联、限时、开始/结束、得分）
- [x] 创建 `practice_answers` 表（逐题作答、正确性、用时）
- [x] migration v4、数据库约束/升级测试与 type-check 验证

**T03B 练习生成**（门禁：T03A 已验收；需独立计划并获批）
- [ ] `PracticeRunnerService` 按知识模块和难度选题或调 AI 生成
- [ ] `POST /api/practice-sessions`（创建练习，AI 生成题目入库）
- [ ] `GET /api/practice-sessions/:id`（获取练习与题目）
- [ ] 测试：AI 生成解析、题目入库与关联正确

**T03C 批改**（门禁：T03B 已验收；需独立计划并获批）
- [ ] `POST /api/practice-sessions/:id/submit`（提交作答，规则批改客观题）
- [ ] 批改后写入 `practice_answers`，计算 session 得分
- [ ] 错题事实标记并写入 `practice_completed` 事件
- [ ] 测试：选择题/填空题批改逻辑、得分计算、事件写入

**T03D 前端**（门禁：T03C 已验收；需独立计划并获批）
- [ ] 前端 API 封装：创建练习、获取题目、提交作答
- [ ] 练习页面：限时倒计时、逐题作答、提交
- [ ] 结果页面：逐题批改详情、得分、错题标记
- [ ] 工作台”练习”区集成：从知识模块发起练习
- [ ] 测试：前端组件测试 + 浏览器 smoke

#### T04：S4 错题改错（拆为 PRD + 2 个实现子任务）

**T04 PRD**（门禁：S3 MVP 验收通过；T04 文档计划已批准）
- [ ] 创建 `docs/subsystems/05-S4-错题改错子系统PRD-ErrorFixer.md`
- [ ] 更新 docs/00 索引

**T04A Schema 与归档**（门禁：S4 PRD 已创建；T04A 独立实现计划已批准）
- [ ] 创建 `mistakes` 表（错题记录、次数、最近错误、掌握状态、关联 question/module）
- [ ] 创建 `weak_points` 表（薄弱点由多次错题证据归纳）
- [ ] S3 练习批改后自动归档到 `mistakes`
- [ ] 测试：归档逻辑、重复错题计数递增

**T04B 前端**（门禁：T04A 已验收；T04B 独立实现计划已批准）
- [ ] 错题列表与筛选（按课程/模块/掌握状态）
- [ ] 错题重做流程（重新作答 → 批改 → 更新掌握状态）
- [ ] 工作台”查漏补缺”区集成
- [ ] 测试：前端组件 + 浏览器 smoke

#### T05：回流规则（门禁：T04B 已验收；独立计划已批准）

- [ ] 错题/薄弱点提升关联知识模块 `studyStatus` 为”需要复习”
- [ ] 关联学习任务 `priorityBucket` 受薄弱点影响提升
- [ ] 已掌握后降低复习优先级，不删除历史记录
- [ ] 测试：优先级派生逻辑覆盖各场景

#### T06：S6 家长报告简版（拆为 PRD + 2 个实现子任务）

**T06 PRD**（门禁：Phase 1 后期且准备正式发送家长报告；T06 文档计划已批准）
- [ ] 创建 `docs/subsystems/06-S6-家长面板子系统PRD-ParentWindow.md`
- [ ] 更新 docs/00 索引

**T06A 报告生成**（门禁：S6 PRD 已创建；T06A 独立实现计划已批准）
- [ ] 复用 Phase 0.7 规则报告：统计课程/任务/完成/逾期/学习时长/趋势
- [ ] AI 润色成功附加总结，失败仍发送规则报告
- [ ] 报告不含资料原文、笔记正文、答案或聊天内容
- [ ] 测试：日报/周报/月报/考前提醒生成正确

**T06B 推送渠道**（门禁：T06A 已验收；T06B 独立实现计划已批准）
- [ ] QQ SMTP HTML 报告发送
- [ ] 飞书 Webhook 卡片推送
- [ ] 渠道失败互不阻塞，去重 `report:<date>` 记录
- [ ] 测试：双渠道独立、失败隔离、去重

#### T07：S1 时间线扩展（门禁：至少一个新增 S3/S4 事件生产者已验收；独立计划已批准）

- [ ] 完整接收 S2/S3/S4 写入的 StudyEvent（`material_note_completed`、`practice_completed`、`mistake_reviewed` 等）
- [ ] 时间线 API 按事件类型过滤
- [ ] 前端工作台总览展示近期学习活动
- [ ] 测试：多子系统事件写入与读取

---

## Phase 1.5：课堂 ASR（S7）

**目标**：录音 → ASR → 文字 → 纯文本 → 复用 S2 笔记生成管道。

**前置条件**：Phase 1 中 S2 笔记管道稳定运行；S7 PRD 尚未创建，必须先由 T01 在门禁满足并获批后创建。

| 顺序 | 任务 | 状态 | 单一责任 |
| ---- | ---- | ---- | -------- |
| 1 | T01：S7 PRD 编写 | ⏳ | 创建 `docs/subsystems/07-S7-课堂录音子系统PRD-ClassCapture.md` |
| 2 | T02：ASR 组件 composer 调通 | ⏳ | SenseVoice/FunASR 在 composer 跑通 smoke test，填写能力卡 |
| 3 | T03：FFmpeg 音频预处理 | ⏳ | 切片、降噪、格式转换；composer 能力卡 |
| 4 | T04：ASR Adapter 装配 | ⏳ | ASR 封装为 `AuralConverter`，输出 `ConverterResult` |
| 5 | T05：录音上传与转写 Job | ⏳ | 后端接受音频上传，Job Worker 调 ASR 后进入 S2 管道 |
| 6 | T06：前端录音/上传页面 | ⏳ | 浏览器可上传录音文件，查看转写进度与笔记结果 |

---

## Phase 2：期末冲刺（S5）

**目标**：模拟考 + 临考速背 + 冲刺计划；Phase 1 可以借鉴信息架构，但不提前实现。

**前置条件**：Phase 1 中 S3 练习 + S4 错题稳定运行；S5 PRD 尚未创建，必须先由 T01 在门禁满足并获批后创建。

| 顺序 | 任务 | 状态 | 单一责任 |
| ---- | ---- | ---- | -------- |
| 1 | T01：S5 PRD 编写 | ⏳ | 创建 `docs/subsystems/08-S5-期末冲刺子系统PRD-ExamCrammer.md` |
| 2 | T02：模拟考 Schema 与生成 | ⏳ | AI 根据全部知识模块生成模拟卷，计时作答与批改 |
| 3 | T03：模拟考前端 | ⏳ | 浏览器可进行模拟考，查看成绩分析 |
| 4 | T04：临考速背 | ⏳ | 按薄弱点和错题生成速背卡片，限时翻阅 |
| 5 | T05：冲刺计划生成 | ⏳ | 根据考试倒计时和薄弱点自动建议每日复习计划 |
| 6 | T06：工作台”冲刺”区集成 | ⏳ | 考试前 N 天自动进入冲刺模式，工作台展示冲刺入口 |

---

## Phase 3：打磨与安全

**目标**：家长端完善、安全加固、性能优化。

**前置条件**：Phase 2 完成；产品进入稳定运行。

| 顺序 | 任务 | 状态 | 单一责任 |
| ---- | ---- | ---- | -------- |
| 1 | T01：S6 家长面板完善 | ⏳ | 独立家长登录、历史报告查阅、学习概况仪表盘 |
| 2 | T02：安全审计 | ⏳ | API 认证/鉴权、输入校验加固、CSRF/XSS 防护 |
| 3 | T03：性能基线 | ⏳ | 建立响应时间/内存基线、Worker 并发优化、前端首屏 |
| 4 | T04：备份与恢复 | ⏳ | 自动定期备份、损坏检测、一键恢复验证 |
| 5 | T05：日志规范化 | ⏳ | 脱敏日志、分级输出、日志轮转与清理 |

---

## 任务状态说明

| 符号 | 含义 |
| ---- | ---- |
| ✅ | 已完成并验证 |
| 🔄 | 进行中 |
| ⏳ | 待开始 |
| ❌ | 已跳过或放弃（需注明原因） |
| - [ ] | 待完成的具体任务 |
| - [x] | 已完成的具体任务 |

---

## 文档门禁检查点

每个任务开始前，确认：

1. 已先读 `docs/00-文档索引-Index.md`；
2. 当前任务需要的子系统 PRD 或规范文档已存在，或触发条件已经满足；
3. 若新增文档，同步更新 `docs/00`；
4. 若涉及实现，计划已获用户明确批准；
5. 提交前运行 `scripts/check-docs-governance.ps1` 和 `git diff --check`。

### 规范文档触发条件

> 开发动作触发文档，而不是提前创建空文档。

| 即将开始的动作 | 必须先存在/创建的文档 | 当前状态 | 说明 |
| -------------- | -------------------- | -------- | ---- |
| 设计共同数据模型、队列、对象存储、AI Provider、Adapter | `08-共同底座架构-Architecture.md` | ✅ 已创建 | 没有共同底座设计，不开始跨子系统实现 |
| 调通第一个开源组件 smoke test | `09-测试验收计划-Test-Plan.md` | ✅ 已创建 | 先定义怎么验收，再调组件 |
| 写第一个后端服务 / Adapter / API / Worker | `10-后端开发规范-Backend-Guidelines.md` | ✅ 已创建 | 先统一路径、日志、Adapter 输出约定 |
| 写第一个正式前端页面 | `11-前端开发规范-Frontend-Guidelines.md` | ✅ 已创建 | 先统一页面、组件、状态和渲染规范 |
| 多 AI / 多分支 / 多 worktree 协作 | `12-开发规范-Dev-Rules.md` | ✅ 已创建（Phase 1-T00） | 先统一协作、提交、归档、备份规则 |

门禁流程：

```text
收到任务 → 读 00 索引 → 查目标文档是否存在 → 查触发条件 → 不满足则不创建 → 满足则创建 → 更新 00 索引 → 运行治理检查 → 提交
```

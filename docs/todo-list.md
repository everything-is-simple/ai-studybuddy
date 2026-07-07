# AI StudyBuddy 任务清单

**版本**：v1.0
**日期**：2026-07-06
**状态**：Phase 1 待启动

> 本文档按开发顺序拆解任务，每个任务粒度控制在单次对话可完成。
> AI 容易出错的环节用 ⚠️ 标注。
> 完成的任务打勾 `[x]`，未完成的留空 `[ ]`。

---

## Phase 0：开源底座决策固化（已完成，后续执行约束）

### 0.1 开源底座 SoT

- [x] **任务描述**：确定“不 fork 大系统，保留自有架构，模块化参考开源项目”的最终路线。
- [x] **输出**：`docs/open-source-foundation.md`
- [x] **最终决定**：KaoBuddy 第一参考，MiaowTest 补刷题/错题/统计，考试粥助手补轻量 MVP，RAGFlow/Dify 只做 AI 工作流参考，SenseVoice/FunASR/PaddleOCR 做底层能力。

### 0.2 后续开发搬运顺序

- [ ] **第一步**：按 KaoBuddy 复刻“资料 → 知识点 → 计划 → 练习/模拟考 → 错题”学习闭环。
- [ ] **第二步**：按 MiaowTest 思路完善题库、练习记录、错题统计和管理视图。
- [ ] **第三步**：按考试粥助手校准 MVP 体验，保证资料上传、AI 笔记、练习、错题追踪能先跑通。
- [ ] **第四步**：按 RAGFlow/Dify 思路抽象 AI Workflow，但不替换本项目业务后端。
- [ ] **第五步**：以 SenseVoice/FunASR/PaddleOCR 独立服务方式接入 ASR/OCR。




---

## Phase 0.5：开源组件调试与装配（组件先行）

> 原则：每个成熟开源组件先在 `G:\ai-studybuddy-composer` 独立调通，形成组件能力卡和 smoke test，再封装 Adapter 接入主系统。

### 0.5.1 composer 目录与组件能力卡

- [ ] 创建并记录 `G:\ai-studybuddy-composer` 子目录结构
- [ ] 为每个 MVP 组件建立 `COMPONENT-CARD.md`
- [ ] 记录 License、安装方式、输入输出、smoke test、Adapter 名称

### 0.5.2 MVP 必接组件调通

- [ ] 调通 PDF.js / pdf-parse：PDF → 文本
- [ ] 调通 PaddleOCR + PP-OCRv6：图片 / 试卷 → 文本
- [ ] 调通 Markmap：Markdown / 层级结构 → 思维导图
- [ ] 调通 KaTeX + react-markdown：结构化笔记展示
- [ ] 调通 MinIO：上传 / 下载 PDF、图片
- [ ] 调通 BullMQ + Redis：异步 job、失败重试
- [ ] 调通 DeepSeek Provider：纯文本 → 结构化 JSON
- [ ] 预留 Qwen / Kimi / GPT Provider 配置位和最小样例

### 0.5.3 工程治理脚本要求

- [ ] 建立 backup zip 脚本文档要求：写入阶段、commit、风险、恢复方式
- [ ] 建立 tmp 清理脚本文档要求：清空后系统可重跑转换任务
- [ ] 建立 logs 落盘规范：不保存 API Key、学生隐私全文、完整答案
- [ ] 明确 Phase 1.5 再调通 SenseVoice / FunASR
- [ ] 明确视频 FFmpeg 放到后续增强

---

## Phase 1：MVP — 多格式资料导入到学习闭环

**目标**：学生上传 PDF / 文本 / 图片 → 格式转换为纯文本 → AI 输出结构化笔记 + 重点高亮 + 思维导图 → 练习 → 错题 → 家长时间线。音频 ASR 进入 Phase 1.5。

---

### 1. 项目初始化与基础设施

#### 1.1 Monorepo 脚手架搭建

- [ ] **任务描述**：初始化 Turborepo monorepo 项目，配置 apps/mobile（Expo）+ apps/server（Fastify）+ packages/shared
- **输入文件**：dev-rules.md（项目结构规范）
- **输出文件**：turbo.json、根 package.json、各子包 package.json、tsconfig.json
- **验收标准**：
  - `turbo run dev` 能同时启动前后端
  - `turbo run build` 无报错
  - TypeScript strict 模式开启
  - ESLint 配置完成

#### 1.2 Docker Compose 基础设施

- [ ] **任务描述**：配置 docker-compose.yml，启动 PostgreSQL 16（含 pgvector 扩展）+ Redis 7 + MinIO
- **输入文件**：ARCHITECTURE.md（技术栈选型）
- **输出文件**：docker-compose.yml、.env.example
- **验收标准**：
  - `docker-compose up` 三个服务全部健康
  - PostgreSQL 可连接，pgvector 扩展已启用
  - Redis 可连接
  - MinIO 控制台可访问

#### 1.3 共享类型包初始化

- [ ] **任务描述**：配置 packages/shared，定义初始 TypeScript 类型和枚举常量
- **输入文件**：ARCHITECTURE.md（数据表结构）
- **输出文件**：packages/shared/types/index.ts、packages/shared/constants/index.ts
- **验收标准**：
  - 前后端可通过 `@ai-studybuddy/shared` 导入
  - 包含：UserRole、TaskStatus、MaterialStatus、ConverterStatus 等枚举
  - 包含：User、Course、Session 等基础类型

#### 1.4 后端基础框架

- [ ] **任务描述**：搭建 Fastify 基础框架，配置插件体系（CORS、JWT、rate-limit、pino 日志）、全局错误处理、健康检查接口
- **输入文件**：backend-guidelines.md（架构分层）、dev-rules.md（后端规范）
- **输出文件**：apps/server/src/app.ts、middleware/、基础路由
- **验收标准**：
  - `GET /health` 返回 `{ status: "ok" }`
  - 全局错误处理返回统一格式 `{ code, message, data }`
  - CORS 配置允许前端开发地址
  - 日志输出 JSON 格式

#### 1.5 数据库 Schema 与迁移

- [ ] **任务描述**：用 Drizzle ORM 定义 Phase 1 所需表结构（users、family_spaces、space_members、courses、sessions、materials、normalized_texts、notes、structured_notes、mind_maps、exercises、wrong_questions），生成初始迁移
- **输入文件**：ARCHITECTURE.md（第四节数据库设计）
- **输出文件**：apps/server/src/db/schema.ts、migrations/
- **验收标准**：
  - `drizzle-kit migrate` 成功执行
  - 所有表、索引创建正确
  - pgvector 扩展启用
- ⚠️ **风险点**：Drizzle ORM 的 pgvector 支持需要额外配置，确认 drizzle-orm/pg-core 是否原生支持 `VECTOR` 类型

#### 1.6 前端基础框架

- [ ] **任务描述**：搭建 Expo 项目，配置 Expo Router（文件系统路由）、Zustand、React Query、基础 UI 组件库、暗色模式、导航结构
- **输入文件**：frontend-guidelines.md（导航架构、设计语言）、dev-rules.md（前端规范）
- **输出文件**：apps/mobile/ 完整目录结构、_layout.tsx、Tab 导航
- **验收标准**：
  - 4 个 Tab 页面可切换（课程/任务/错题本/我的）
  - 暗色模式正常工作
  - React DevTools 可连接
  - 基础 UI 组件（Button、Card、Input）可复用
- **说明**：错题本 Tab 功能在 Phase 2 才实现（见 Phase 2 任务），Phase 1 该 Tab 显示空状态占位（如"做题功能上线后这里会有你的错题"），不阻塞 Tab 导航验收

---

### 2. 认证模块

#### 2.1 后端认证 API

- [ ] **任务描述**：实现注册、登录、Token 刷新、验证码发送接口。JWT 签发与验证中间件
- **输入文件**：ARCHITECTURE.md（5.1 认证 API）、backend-guidelines.md（第三节认证设计）
- **输出文件**：routes/auth.ts、services/auth.ts、middleware/auth.ts
- **验收标准**：
  - `POST /auth/register` 创建用户，返回 JWT
  - `POST /auth/login` 验证凭证，返回 access_token + refresh_token
  - `POST /auth/refresh` 刷新 token
  - JWT 中间件拦截未认证请求返回 401
  - 密码 bcrypt hash（cost=12）
- ⚠️ **风险点**：短信验证码初期可用 mock（控制台打印），不要接入真实短信服务

#### 2.2 前端认证页面

- [ ] **任务描述**：实现登录页、注册页、加入家庭空间页。认证状态管理（authStore）、Token 自动刷新
- **输入文件**：frontend-guidelines.md（导航架构 2.1）
- **输出文件**：app/(auth)/login.tsx、register.tsx、join-space.tsx、stores/authStore.ts、lib/api-client.ts
- **验收标准**：
  - 登录成功跳转 Tab 首页
  - Token 过期自动刷新，用户无感
  - 未登录自动跳转登录页
  - API 请求自动附带 Bearer token

#### 2.3 家庭空间基础

- [ ] **任务描述**：实现创建家庭空间、生成邀请码、扫码加入接口和前端
- **输入文件**：ARCHITECTURE.md（5.2 家庭空间 API）
- **输出文件**：routes/spaces.ts、services/spaces.ts
- **验收标准**：
  - 学生注册后自动创建个人空间
  - 邀请码 8 位字符，唯一
  - 家长用邀请码成功加入空间

---

### 3. 课程与课次管理

#### 3.1 后端课程/课次 API

- [ ] **任务描述**：实现课程 CRUD + 课次 CRUD 接口，含权限校验（只能操作自己的课程）
- **输入文件**：ARCHITECTURE.md（5.3 课程与课次 API）
- **输出文件**：routes/courses.ts、routes/sessions.ts、services/courses.ts
- **验收标准**：
  - 课程 CRUD 正常
  - 课次 CRUD 正常
  - 访问他人课程返回 40101
  - 删除课程级联删除课次

#### 3.2 前端课程列表页

- [ ] **任务描述**：实现课程列表页（Tab1），支持创建课程（BottomSheet）、进入课程详情
- **输入文件**：frontend-guidelines.md（导航架构、3.1 课堂记录页）
- **输出文件**：app/(tabs)/courses.tsx、components/course/CourseCard.tsx、stores/courseStore.ts
- **验收标准**：
  - 显示课程卡片（课程名、老师、课次数）
  - 新建课程 BottomSheet 弹出流畅
  - 点击进入课程详情页

#### 3.3 前端课次详情页

- [ ] **任务描述**：实现课次详情页，展示课次信息、素材列表、整理结果（Segment 切换：资料/笔记/整理/练习）
- **输入文件**：frontend-guidelines.md（3.2 课次详情页）
- **输出文件**：app/session/[id].tsx、components/session/
- **验收标准**：
  - Segment 切换平滑
  - 显示 PDF/图片/文本素材列表、笔记列表
  - 整理结果区域预留（后续填充）

---

### 4. 记录模块

#### 4.1 后端文件上传

- [ ] **任务描述**：实现文件上传接口（直传 + 分片上传），MinIO 存储集成，签名 URL 生成
- **输入文件**：backend-guidelines.md（4.4 文件上传策略）
- **输出文件**：routes/materials.ts、services/storage.ts、lib/minio.ts
- **验收标准**：
  - 直传文件 ≤ 10MB 成功写入 MinIO
  - 分片上传（每片 5MB）成功合并
  - 签名 URL 可访问文件（1小时有效）
- ⚠️ **风险点**：分片上传的合并顺序和完整性校验

#### 4.2 后端资料/笔记/链接 API

- [ ] **任务描述**：实现 PDF、图片、文本素材记录接口，笔记保存、链接保存接口，关联到课次
- **输入文件**：ARCHITECTURE.md（5.4 记录 API）
- **输出文件**：routes/materials.ts、routes/notes.ts、services/materials.ts
- **验收标准**：
  - PDF / 图片 / 文本素材写入 materials 表，status=uploaded
  - 笔记写入 notes 表
  - 链接写入 links 表，后续由 Readability 任务提取正文

#### 4.3 前端多格式资料上传

- [ ] **任务描述**：实现 PDF / 图片 / 文本上传入口，支持课次内添加素材和备注
- **输入文件**：frontend-guidelines.md（课次详情页、资料导入入口）
- **输出文件**：app/session/[id]/materials.tsx、hooks/useMaterialUpload.ts、components/materials/
- **验收标准**：
  - 学生能上传 PDF 文件
  - 学生能上传图片 / 试卷照片
  - 学生能粘贴 Markdown / 纯文本
  - 上传完成后自动进入 FormatConverter 队列
- ⚠️ **风险点**：移动端文件选择器、图片权限和大文件上传体验

#### 4.4 前端笔记与链接输入

- [ ] **任务描述**：实现笔记输入（多行文本框）和链接保存功能
- **输入文件**：frontend-guidelines.md（3.1 课堂记录页）
- **输出文件**：components/notes/NoteEditor.tsx、components/links/LinkInput.tsx
- **验收标准**：
  - 笔记支持多行输入、保存
  - 链接输入 URL 后自动保存

---

### 5. AI 整理模块（核心价值）

#### 5.0 FormatConverter Adapter 框架

- [ ] **任务描述**：实现 FormatConverter Router，按文件类型分发到 PdfConverter、OcrConverter、TextConverter；音频/视频 Converter 只预留接口，Phase 1.5 接入
- **输入文件**：ARCHITECTURE.md（7.1 用户动作到系统组件流程图）、backend-guidelines.md（ConverterResult 约定）
- **输出文件**：converters/index.ts、converters/pdf.ts、converters/ocr.ts、converters/text.ts、workers/format-convert.ts
- **验收标准**：
  - PDF → PDF.js / pdf-parse → normalized_texts
  - 图片 / 试卷 → PaddleOCR + PP-OCRv6 → normalized_texts
  - Markdown / 纯文本 → 直接入库
  - 所有 Converter 返回统一 ConverterResult

#### 5.1 PDF / OCR 转换能力接入

- [ ] **任务描述**：把 Phase 0.5 已调通的 PDF.js / pdf-parse、PaddleOCR + PP-OCRv6 通过 Adapter 接入 Worker
- **输入文件**：open-source-foundation.md（组件能力卡）、backend-guidelines.md（7.2 Adapter 接入规则）
- **输出文件**：converters/pdf.ts、converters/ocr.ts、workers/format-convert.ts
- **验收标准**：
  - 输入 1 个 PDF，输出可读纯文本
  - 输入 1 张试卷图片，输出 OCR 文本
  - 临时文件写入 TMP_ROOT，日志写入 LOG_ROOT
  - 失败时保留 warning/error，不阻断其他资料处理

#### 5.2 BullMQ 任务队列搭建

- [ ] **任务描述**：搭建 BullMQ 队列基础设施，Worker 进程，任务状态跟踪，WebSocket 通知
- **输入文件**：backend-guidelines.md（6.3 AI 任务队列设计）
- **输出文件**：lib/queue.ts、workers/index.ts、lib/websocket.ts
- **验收标准**：
  - 任务加入队列 → Worker 消费 → 状态更新正常
  - 任务失败自动重试（最多 3 次）
  - WebSocket 通知前端任务完成
  - 前端轮询和 WebSocket 双保险

#### 5.3 AI Provider 基础框架

- [ ] **任务描述**：实现 Provider Registry、DeepSeek Provider（OpenAI 兼容 SDK）、配置读取（用户自定义 → 系统默认）
- **输入文件**：ARCHITECTURE.md（第六节 AI Provider 配置架构）、backend-guidelines.md（6.2 Provider 抽象层）
- **输出文件**：ai/provider-registry.ts、ai/providers/deepseek.ts、db/schema.ts（ai_provider_configs 表）
- **验收标准**：
  - `getProvider(spaceId, fn)` 返回正确配置
  - DeepSeek API 调用成功返回结果
  - 用户未配置时使用系统默认
- ⚠️ **风险点**：DeepSeek API 的 base_url 和模型名需确认可用

#### 5.4 笔记结构化 Pipeline

- [ ] **任务描述**：实现结构化笔记生成 Worker，构造 prompt（注入课程上下文），解析 LLM 输出为 Markdown + 重点高亮
- **输入文件**：ARCHITECTURE.md（7.3 结构化笔记 Pipeline）
- **输出文件**：ai/notes.ts、ai/prompts/note-structuring.ts、workers/organize.ts
- **验收标准**：
  - 输入 normalized_texts + 手写笔记 → 输出 Markdown 结构化笔记
  - 包含章节、[定义]/[公式]/[重点] 标签
  - 末尾附"本课次要点总结"
  - highlights JSON 正确提取
  - 写入 structured_notes 表

#### 5.5 思维导图 Pipeline

- [ ] **任务描述**：在笔记结构化同一次 LLM job 中输出思维导图数据；前端用 Markmap 渲染，单独思维导图 Worker 后续优化
- **输入文件**：ARCHITECTURE.md（7.4 思维导图 Pipeline）
- **输出文件**：ai/prompts/note-structuring.ts、components/organize/MindMapView.tsx
- **验收标准**：
  - 输入统一纯文本 → 同时输出结构化笔记与 JSON 树形结构
  - 包含 `is_key: true` 标注重点节点
  - 前端用 Markmap 渲染层级结构
  - 写入 mind_maps 表

#### 5.6 整理触发 API 与编排

- [ ] **任务描述**：实现 `POST /sessions/:id/organize` 接口，编排完整 Pipeline（格式转换→统一纯文本→结构化笔记+重点+思维导图），幂等处理，状态查询接口
- **输入文件**：ARCHITECTURE.md（5.5 整理 API）
- **输出文件**：routes/organize.ts、services/organize.ts
- **验收标准**：
  - 触发后按顺序执行：格式转换 → 统一纯文本 → 笔记/重点/思维导图
  - 重复触发返回已有任务（幂等）
  - `GET /sessions/:id/organize/status` 返回实时进度
  - 完成后 WebSocket 通知前端

#### 5.7 前端整理结果展示

- [ ] **任务描述**：实现课次详情页的整理结果展示——Markdown 笔记渲染、思维导图渲染（react-native-webview + Markmap 渲染层级 Markdown / JSON）、重点高亮列表、AI 处理进度条
- **输入文件**：frontend-guidelines.md（3.2 课次详情页、第八节依赖清单）
- **输出文件**：components/organize/StructuredNote.tsx、MindMapView.tsx（WebView 封装）、HighlightList.tsx、AIProgressBar.tsx
- **验收标准**：
  - Markdown 渲染正确（标题、列表、加粗、代码块）
  - 数学公式用 KaTeX 渲染
  - 思维导图 WebView 正确渲染 Markmap，支持缩放/平移/节点展开折叠（均由 Markmap 自带交互提供）
  - AI 处理中显示分步进度条
  - 处理完成后自动刷新展示结果
- ⚠️ **风险点**：WebView 与 RN 之间传递 Markmap 数据的桥接（建议用 `injectedJavaScript` 或 `postMessage`），首次加载 Markmap.js 资源的离线打包（避免每次联网加载 CDN）

---

### 6. 联调与验收

#### 6.1 端到端联调

- [ ] **任务描述**：完整流程联调——注册→创建课程→创建课次→上传 PDF/文本/图片→格式转换→AI 整理→查看结果→练习→错题入库→家长时间线
- **输入文件**：test-plan.md（Phase 1 验收标准）
- **输出文件**：无（修复 Bug 为主）
- **验收标准**：
  - 全流程顺畅走通
  - 上传 PDF/文本/图片，60-120 秒内看到结构化笔记 + 重点 + 思维导图
  - 无控制台报错，无 UI 闪烁

#### 6.2 多格式资料入口验证

- [ ] PDF 上传 → PDF.js / pdf-parse 提取文本 → 入库
- [ ] 图片 / 试卷上传 → PaddleOCR + PP-OCRv6 OCR → 入库
- [ ] Markdown / 纯文本上传 → 直接入库
- [ ] 统一触发结构化笔记 + 重点 + 思维导图生成

#### 6.3 Phase 1 回归测试

- [ ] **任务描述**：补充 Phase 1 所有单元测试和集成测试，跑通 CI 流水线
- **输入文件**：test-plan.md（第二、三节测试用例）
- **输出文件**：tests/ 目录下所有测试文件
- **验收标准**：
  - 单元测试覆盖率 ≥ 80%
  - 集成测试覆盖认证、课程、整理全流程
  - CI 流水线全绿
  - `tsc --noEmit` 无报错

---

## Future（Phase 2+ 预留）

以下任务在 Phase 1 验收通过后开始，具体拆解在 Phase 1 结束时补充：

- [ ] **推送通知基础设施**（需提前到 Phase 2 开始前，不能拖到 Phase 5）：设备 token 注册（expo-notifications）、`device_tokens`/`notification_logs` 表、Expo Push API 集成——见 backend-guidelines.md 6.6。原因：Phase 2 的"错题复习提醒"（每天8点推送）依赖此基础设施，若拖到 Phase 5 会导致错题本核心机制（艾宾浩斯复习）体验不完整
- [ ] **AI 调用预算控制**（需在 Phase 2 开始前完成）：`ai_budgets` 表、试用额度扣减逻辑、超限降级逻辑——见 backend-guidelines.md 6.5 和 PRD.md 8.6。原因：Phase 2 引入 AI 出题/批改/教学解析 后调用量显著上升，预算机制必须先于高频功能上线
- [ ] Phase 2：写题模块（AI 出题 + 做题 + 批改 + 教学解析 + 错题本）
- [ ] Phase 3：真题与变题（真题 OCR + 教学解析重生成 + 变题组卷 + 限时考试）
- [ ] Phase 4：家长可见 + 备考调度（家长面板 + 考前预警 + 备考计划）
- [ ] Phase 5：打磨与上线（UI 打磨 + 性能优化 + 离线支持 + 部署）

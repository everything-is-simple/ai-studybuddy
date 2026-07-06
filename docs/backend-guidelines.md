# AI StudyBuddy 后端设计指南

**版本**：v1.0
**日期**：2026-07-06
**适用范围**：apps/server（Node.js / Fastify）

> 本文档定义后端架构设计原则、API 设计决策、数据库策略、安全方案、AI 服务集成模式和部署策略。
> 代码层面的规范见 dev-rules.md，本文档聚焦"设计决策"。

---

## 一、设计原则

### 1.1 核心理念

| 原则 | 说明 | 反面案例 |
|------|------|----------|
| **API 先行** | 先定义接口契约，再实现逻辑 | 先写逻辑再补接口，导致前后端对不上 |
| **异步优先** | AI 任务全部走队列，不阻塞 HTTP 请求 | 上传录音后同步等 ASR 返回，请求超时 |
| **类型安全** | TypeScript strict + Drizzle schema，端到端类型推导 | 手动写 SQL 字符串，类型全靠注释 |
| **可配置 AI** | 每个 AI 功能可独立切换模型，用户可自接入 | 硬编码 API Key 和模型名 |
| **最小权限** | 家长只能 GET，学生只能操作自己的数据 | 一个接口返回所有用户数据 |
| **幂等设计** | 重试不产生副作用（重复提交、重复触发整理） | 重复触发 AI 整理生成两份笔记 |

### 1.2 架构分层

```
请求进入 → 认证中间件 → 路由（Schema 验证）→ Service（业务逻辑）→ DB/AI
                                                        ↓
                                              Worker（异步任务）→ AI 服务 → 回调写 DB → WebSocket 通知
```

**分层职责：**

| 层级 | 职责 | 不做什么 |
|------|------|----------|
| 路由层 routes/ | 定义 URL、HTTP 方法、请求验证 schema | 不写业务逻辑 |
| 服务层 services/ | 业务逻辑、数据校验、权限判断 | 不直接操作 req/res |
| 数据层 db/ | Drizzle schema、迁移、查询构造 | 不写业务判断 |
| AI 层 ai/ | AI 服务调用封装、prompt 构造 | 不直接操作 DB |
| Worker 层 workers/ | 异步任务消费、重试、状态更新 | 不处理 HTTP 请求 |
| 中间件 middleware/ | 认证、权限、日志、错误处理 | 不做业务逻辑 |

---

## 二、技术栈详解

### 2.1 Fastify 设计决策

| 决策 | 选型 | 理由 |
|------|------|------|
| 框架 | Fastify v5 | 性能最优（比 Express 快 2-3x），原生 TypeScript，插件体系清晰 |
| 请求验证 | Fastify 内置 JSON Schema（基于 Ajv） | 零依赖、编译时优化、自动生成类型 |
| 序列化 | fast-json-stringify | 响应序列化比 JSON.stringify 快 2x |
| 插件注册 | fastify-plugin 包装共享插件 | 控制 encapsulation 边界 |
| 日志 | pino（Fastify 内置） | 结构化 JSON 日志，性能极高 |

### 2.2 Drizzle ORM 设计决策

| 决策 | 选型 | 理由 |
|------|------|------|
| ORM | Drizzle ORM | 类型安全、SQL-like API、迁移工具成熟 |
| 查询风格 | Drizzle Query API（类 SQL） | 比 Prisma 更灵活，支持复杂 JOIN |
| Schema 定义 | drizzle-orm/pg-core | 与 PostgreSQL 深度集成 |
| 迁移 | drizzle-kit generate + migrate | 自动生成迁移文件，支持命名 |
| 连接池 | postgres.js（drizzle 推荐驱动） | 轻量、高性能、支持 prepared statements |

### 2.3 Redis + BullMQ 设计决策

| 决策 | 选型 | 理由 |
|------|------|------|
| 队列 | BullMQ | Redis-based，支持优先级、延迟、重试、cron |
| 缓存 | Redis 原生 | AI 结果缓存、会话缓存、限流 |
| 实时通知 | WebSocket（Fastify ws 插件） | AI 任务完成后推送前端 |

---

## 三、认证与授权设计

### 3.1 认证流程

```
注册 → 手机号/邮箱 + 验证码 → 创建用户 → 返回 JWT
登录 → 验证凭证 → 返回 access_token (15min) + refresh_token (7d)
刷新 → refresh_token → 验证 → 返回新 access_token
```

### 3.2 JWT 策略

| Token 类型 | 有效期 | 存储位置 | 用途 |
|-----------|--------|---------|------|
| access_token | 15 分钟 | 前端内存 + AsyncStorage | 每次 API 请求 |
| refresh_token | 7 天 | AsyncStorage（HttpOnly cookie 备选） | 刷新 access_token |

### 3.3 权限模型

```
请求 → JWT 解析 → 获取 user_id + role
  │
  ├─ role=student → 可读写自己的数据
  ├─ role=parent  → 只读家庭空间内的汇总数据
  └─ 无 token     → 拒绝（401）
```

**权限检查点：**

| 场景 | 检查逻辑 |
|------|----------|
| 学生访问课程 | course.user_id === currentUser.id |
| 学生访问家庭空间 | space_members 表中存在该用户 |
| 家长访问时间线 | role=parent && space_members 中存在 && 只返回汇总状态 |
| 家长点赞 | role=parent && task 属于同空间学生 |

### 3.4 家庭空间权限隔离

```
家庭空间 = 数据隔离边界
- 一个学生可属于多个空间（如父母各自一个空间）
- 一个空间可有多个家长（爸爸+妈妈）
- 空间内数据共享，空间间数据隔离
- 学生创建空间 → 生成邀请码 → 家长扫码加入
```

---

## 四、API 设计决策

### 4.1 RESTful 设计原则

| 原则 | 说明 |
|------|------|
| 资源用名词 | `/courses`, `/sessions`, `/questions` |
| 操作用 HTTP 方法 | GET（查）、POST（增）、PATCH（改）、DELETE（删） |
| 嵌套最多一层 | `/courses/:id/sessions`，不出现三层嵌套 |
| 批量操作用独立端点 | `POST /api/v1/tasks/batch-update` 而非循环调用单个接口 |
| 触发操作用动词 | `POST /sessions/:id/organize`（触发 AI 整理） |

### 4.2 请求验证策略

```typescript
// 每个路由必须定义 schema
const createCourseSchema = {
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', maxLength: 200 },
      teacher: { type: 'string', maxLength: 100 },
      semester: { type: 'string', maxLength: 50 },
      schedule: { type: 'object' },
    },
    additionalProperties: false,  // 拒绝多余字段
  },
};
```

**验证规则：**
- 所有字符串字段必须有 `maxLength`
- 所有必填字段必须在 `required` 中
- 开启 `additionalProperties: false`，拒绝未定义字段
- 枚举字段用 `enum` 限制可选值

### 4.3 分页策略

| 场景 | 策略 | 说明 |
|------|------|------|
| 列表查询 | cursor-based 或 offset-based | 默认 offset，大数据量用 cursor |
| 默认页大小 | 20 条 | 防止一次拉取过多数据 |
| 最大页大小 | 100 条 | 超过返回 400 |
| 响应格式 | `{ items, total, page, page_size }` | 统一格式 |

### 4.4 文件上传策略

| 场景 | 策略 | 说明 |
|------|------|------|
| 录音文件 | 分片上传（每片 5MB） | 支持断点续传，避免大文件一次传 |
| 图片（OCR） | 直传（单文件 ≤ 10MB） | 拍照图片不会太大 |
| 视频 | 分片上传（每片 10MB） | 可选功能 |

**上传流程：**
```
前端分片 → 逐片 POST /upload/chunk → 全部完成 POST /upload/complete → 后台合并 → 写入 S3/MinIO
```

### 4.5 幂等性设计

| 场景 | 幂等方案 |
|------|----------|
| 触发 AI 整理 | 检查 session 是否已有 status=processing，有则返回已有任务 ID |
| 提交答案 | submission 基于 user_id + question_set_id 唯一，重复提交更新而非新建 |
| 家长点赞 | UNIQUE(task_id, from_user)，重复点赞忽略 |
| 创建课次 | 基于 course_id + date + topic 去重 |

---

## 五、数据库设计决策

### 5.1 核心策略

| 策略 | 说明 |
|------|------|
| 主键 UUID | 全局唯一，前端可预生成，避免自增 ID 暴露信息 |
| 软删除 | 关键数据用 deleted_at 字段，不物理删除 |
| 审计字段 | 所有表有 created_at，需要更新的表有 updated_at |
| JSONB 字段 | 灵活结构用 JSONB（如题目选项、知识点列表），避免过度建表 |
| 枚举用 VARCHAR | 而非 PostgreSQL enum 类型，便于扩展新值无需 ALTER |
| 时区统一 | 所有时间字段用 TIMESTAMPTZ，存储 UTC，展示时转本地 |

### 5.2 数据关系设计

```
users (1) ──< (N) courses ──< (N) sessions ──< (N) recordings
                                         ──< (N) notes
                                         ──< (N) links
                                         ──< (N) structured_notes
                                         ──< (N) mind_maps
                                         ──< (N) question_sets ──< (N) questions
                                                              ──< (N) submissions ──< (1) grading_results

users (1) ──< (N) error_questions ──< (N) error_reviews
                               ──< (N) error_review_schedules

users (1) ──< (N) tasks
users (1) ──< (N) family_spaces ──< (N) space_members
                              ──< (N) encouragements
```

### 5.3 迁移策略

```
开发流程：
1. 修改 db/schema.ts
2. drizzle-kit generate --name="描述"  → 生成迁移文件
3. 审查生成的 SQL（人工检查）
4. drizzle-kit migrate                 → 执行迁移
5. 提交 schema.ts + 迁移文件到 Git

铁律：
- 已有迁移文件绝对不能修改
- 每次迁移必须是增量的
- 生产环境迁移前必须在开发环境验证
```

---

## 六、AI 服务集成设计

### 6.1 Provider 抽象层

```typescript
// 所有 AI 调用统一通过 Provider Registry
// 不直接调用任何特定模型的 SDK

interface AIProvider {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
}

// 每个 Provider 实现统一接口
class DeepSeekProvider implements AIProvider { ... }
class QwenProvider implements AIProvider { ... }
class OpenAIProvider implements AIProvider { ... }  // 兼容所有 OpenAI API 格式

// Registry 管理 Provider 实例
class ProviderRegistry {
  getProvider(spaceId: string, fn: AIFunction): AIProvider { ... }
}
```

### 6.2 AI 任务队列设计

```
HTTP 请求（触发 AI 任务）
  │
  ├─ 1. 创建任务记录（status=pending）
  ├─ 2. 加入 BullMQ 队列（带优先级）
  ├─ 3. 立即返回任务 ID（前端轮询或等 WebSocket）
  │
  └─ Worker 消费：
      ├─ 4. 更新 status=processing
      ├─ 5. 调用 AI Provider
      ├─ 6. 解析结果，写入 DB
      ├─ 7. 更新 status=done
      └─ 8. WebSocket 通知前端
```

**队列优先级：**

| 优先级 | 任务类型 | 理由 |
|--------|---------|------|
| 高 | AI 批改 | 学生在等结果 |
| 高 | 错题复习排程 | 每日定时，影响推送 |
| 中 | 录音转写 | 后续整理依赖它 |
| 中 | 笔记结构化 | 学生等待查看 |
| 低 | 思维导图 | 可在笔记之后异步 |
| 低 | 变题生成 | 非实时需求 |
| 低 | AI 出题 | 可提前生成缓存 |

**Worker 并发数控制**（防止自部署 ASR/OCR 被压垮，也防止 AI API 触发限流）：

| Worker | 并发数 | 理由 |
|--------|--------|------|
| ASR Worker（SenseVoice/FunASR） | 1 | CPU 自部署，单实例串行处理，避免多任务抢占 CPU 导致单个任务耗时暴涨 |
| OCR Worker（PaddleOCR） | 1 | 同上 |
| LLM Worker（笔记/出题/批改/CoT等） | 3 | API 调用型任务，可并发但要控制在 Provider 的 RPM 限制内 |
| 变题/复习排程 Worker | 2 | 非实时，适度并发即可 |

用 BullMQ 的 `concurrency` 选项配置：`worker.run({ concurrency: 1 })`。用户一次上传多条录音时，任务会排队而不是同时抢占 CPU。

### 6.3 AI 错误处理

| 错误类型 | 处理策略 |
|---------|---------|
| API 超时（>30s） | 重试 2 次，间隔指数退避（1s, 4s） |
| API 返回错误 | 记录到 ai_call_logs，标记任务 failed，通知前端 |
| 模型不可用 | 回退到默认 Provider，记录告警 |
| Token 超限 | 自动截断输入，记录日志 |
| 响应格式异常 | JSON 解析失败时重试一次，仍失败则标记 failed |

**CoT 解析（DeepSeek R1）专项 fallback**：R1 是价格最高（¥4/¥16 每百万token）且承担最核心解题价值的功能，单独配置备选模型（如 Kimi K2.6），R1 不可用时自动降级调用备选模型，而不是直接失败，保证学生做题体验不中断。

### 6.4 AI 调用预算控制（成本控制核心）

**背景**：PRD 8.6 确认了 AI Key 混合策略——新用户使用系统试用额度，用完后引导切换为自备 Key。试用额度必须有硬性上限，否则开发者账户可能被无限透支；即便用户自备 Key，考前冲刺期高频触发 CoT 解析（R1 模型最贵）也可能产生费用惊喜，需要预算提醒。

```
ai_provider_configs 表增加字段（或新增 ai_budgets 表）：
- budget_type: 'trial' | 'user_key'        -- 试用额度 还是 用户自备Key
- monthly_call_limit: INT                   -- 试用额度：每月调用次数上限（如 50）
- monthly_cost_limit_cny: DECIMAL           -- 用户自备Key：每月费用软上限（用户自设，如 ¥20）
- current_month_calls: INT                  -- 本月已用次数
- current_month_cost_cny: DECIMAL           -- 本月已产生费用（从 ai_call_logs 按 token 单价估算汇总）
```

**执行逻辑：**

| 场景 | 触发条件 | 行为 |
|------|---------|------|
| 试用额度超限 | current_month_calls ≥ monthly_call_limit（trial） | 拒绝调用，返回业务错误码，前端提示"试用额度已用完，配置你自己的 API Key 继续使用" |
| 自备 Key 费用告警 | current_month_cost_cny ≥ monthly_cost_limit_cny × 0.8 | 推送通知"本月 AI 费用已达 ¥16（预算 ¥20 的 80%）" |
| 自备 Key 费用超限 | current_month_cost_cny ≥ monthly_cost_limit_cny | 推送通知 + 非紧急任务（思维导图、变题生成等低优先级队列）自动降级为更便宜的模型（如 R1 降级为 V3.2），批改和转写等核心功能不降级 |
| 每月 1 日 | Cron 定时任务 | 重置 current_month_calls / current_month_cost_cny 为 0 |

**规则：预算检查在任务入队前做（route 层），不是 Worker 消费时做**——避免任务已排队等待很久才发现超限被拒绝，浪费用户等待时间。

### 6.5 推送通知设计

**背景**：PRD 定义了多种推送场景（AI 处理完成、任务截止提醒、错题复习提醒、家长点赞），这些通知需要在 App **不在前台**时也能送达，WebSocket 只能覆盖 App 在线场景，必须叠加系统级推送。

```
设备 Token 注册：
1. App 启动时通过 expo-notifications 获取设备 push token（Expo Push Token）
2. POST /api/v1/users/me/push-token 上传 token，写入 device_tokens 表
3. 一个用户可有多台设备（如换新手机后旧设备 token 失效不清理，靠发送失败自然淘汰）

发送流程：
BullMQ 定时/触发任务 → 查 device_tokens → 调用 Expo Push API（服务端统一走 Expo 推送网关，
不需要分别对接 FCM/APNs，Expo 已封装好双端差异）→ 记录发送结果到 notification_logs
```

**关键表**：`device_tokens`（user_id, push_token, platform, created_at）、`notification_logs`（user_id, type, payload, status, sent_at）

**通知类型与触发时机：**

| 通知类型 | 触发时机 | 优先级 |
|---------|---------|--------|
| AI 处理完成 | Worker 完成笔记/思维导图生成 | 中 |
| 任务截止提醒 | 作业/练习截止前 2 小时（Cron 扫描） | 中 |
| 错题复习提醒 | 每天早上 8 点（Cron 定时） | 高 |
| 超时警告 | 任务超时未完成（Cron 扫描 tasks 表） | 中 |
| 备考提醒 | 考试前 2 个月触发（exam_schedules 扫描） | 中 |
| 家长点赞 | 家长点击点赞按钮后实时触发 | 低 |
| AI 预算告警 | 见 6.4 预算超限逻辑 | 高 |

**失败处理**：Expo Push API 返回失效 token（如用户卸载 App）时，标记 `device_tokens.is_valid = false`，不再发送，不重试。

### 6.6 Prompt 管理策略

```
prompt 不放数据库，放代码中的常量文件：

apps/server/src/ai/prompts/
├── note-structuring.ts    # 笔记结构化 prompt
├── mindmap.ts             # 思维导图 prompt
├── quiz-generation.ts     # 出题 prompt
├── cot-analysis.ts        # CoT 解析 prompt
├── grading.ts             # 批改 prompt
└── error-variation.ts     # 错题变题 prompt

每个 prompt 文件导出：
- system prompt（角色设定）
- buildUserPrompt(data)（构造用户输入）
- parseResponse(raw)（解析 AI 输出）
```

---

## 七、安全设计

### 7.1 安全原则

| 原则 | 实现方式 |
|------|----------|
| 输入验证 | Fastify JSON Schema 验证，拒绝非法输入 |
| SQL 注入 | Drizzle ORM 参数化查询，禁止原始 SQL |
| XSS | 前端处理，后端存储不转义（Markdown 内容） |
| CSRF | API 用 JWT（Bearer token），不用 cookie 认证，天然免疫 |
| 文件上传 | 类型白名单（audio/*, image/*, video/*），大小限制，病毒扫描（后期） |
| 速率限制 | @fastify/rate-limit，每 IP 100 请求/分钟 |
| API Key 加密 | ai_provider_configs.api_key 加密存储（AES-256-GCM） |
| 敏感日志 | 日志中脱敏 API Key（只显示前4位 + ****） |

### 7.2 数据安全

| 数据 | 保护策略 |
|------|----------|
| 密码 | bcrypt hash（cost=12），不存明文 |
| API Key | AES-256-GCM 加密存储，运行时解密 |
| 学生答案 | 家长不可见，权限层隔离 |
| 录音文件 | S3 私有 bucket，签名 URL（有效期 1 小时） |
| 个人信息 | 手机号/邮箱不暴露给家长端 |

---

## 八、部署与运维设计

### 8.1 容器化部署

```
docker-compose.yml
├── app-server    # Fastify 后端（Node.js 22）
├── app-worker    # BullMQ Worker（同镜像，不同入口命令）
├── postgres      # PostgreSQL 16 + pgvector 扩展
├── redis         # Redis 7
├── minio         # 对象存储
├── asr-service   # SenseVoice/FunASR（自部署）
└── ocr-service   # PaddleOCR（自部署）
```

### 8.2 环境变量分层

| 层级 | 文件 | 说明 |
|------|------|------|
| 开发 | .env.development | 本地开发用，提交到 Git 的 .env.example |
| 生产 | .env.production | 服务器部署用，不提交 |
| 共享 | .env.example | 所有变量的说明和示例值 |

### 8.3 健康检查

```
GET /health          → { status: "ok", version, uptime }
GET /health/db       → 检查 PostgreSQL 连接
GET /health/redis    → 检查 Redis 连接
GET /health/queue    → 检查 BullMQ 队列积压情况
```

### 8.4 日志策略

| 环境 | 格式 | 说明 |
|------|------|------|
| 开发 | pino-pretty（彩色可读） | 方便调试 |
| 生产 | JSON（结构化） | 方便日志系统采集 |

**日志级别：**
- error：系统错误、AI 调用失败、数据库异常
- warn：超时、重试、降级
- info：正常业务流程（创建课程、提交答案、AI 任务完成）
- debug：开发调试信息

---

## 九、缓存策略

| 缓存对象 | 缓存位置 | TTL | 失效策略 |
|---------|---------|-----|---------|
| 课程列表 | Redis | 5 分钟 | 课程增删改时失效 |
| 课次详情 | Redis | 10 分钟 | 课次更新时失效 |
| AI 整理结果 | DB（持久化） | 永久 | 重新整理时覆盖 |
| AI Provider 配置 | Redis | 30 分钟 | 配置更新时失效 |
| JWT 黑名单 | Redis | 与 token 剩余有效期一致 | 登出时加入黑名单 |
| 错题复习队列 | Redis | 1 小时 | 复习完成或排程更新时失效 |

---

## 十、与其他文档的关系

| 文档 | 本文档从中取用 |
|------|--------------|
| PRD.md | 四大功能定义、AI 配置策略、用户角色权限需求 |
| ARCHITECTURE.md | 完整表结构、API 接口列表、Pipeline 设计、技术栈选型 |
| dev-rules.md | 代码规范、命名规范、禁止事项、Git 规范 |
| frontend-guidelines.md | 前端需要后端提供的接口契约、实时通知需求 |

**本文档不重复代码层面的规范**（如怎么写 Service、怎么定义 Schema），只定义"设计决策"（为什么选这个方案、安全怎么保障、AI 怎么集成）。

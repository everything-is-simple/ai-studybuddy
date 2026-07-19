# Phase 1-M03 设置中心配置可观测性与安全摘要计划

**状态**：独立复审通过，已按用户选择的方案 A 获准实施（不回显已保存秘密）
**日期**：2026-07-19
**任务分支**：`codex/phase1-m03-settings-configuration-observability`
**基线**：`origin/master` @ `3e2226671af0d1b75fe706dd18ee2571eeb6ee40`

## 1. 背景与问题证据

T08 配置中心在启动时可将根 `.env.local` 的 AI、SMTP、飞书配置作为运行时 fallback 应用到 Router/Registry；但 `ConfigurationService.initialize()` 只把 DPAPI 加密存储中的配置登记为 `verified_pass`。后续 `applyEnvironmentFallback()` 仅更新运行时实例，不更新 `ConfigurationService` 快照、来源、状态或安全摘要。因此 `/api/config/status` 以及 `/settings` 会把可工作的环境 fallback 显示为“未配置 / 降级”，表单也只有空输入框。

另有连接错误可观测性不足：AI HTTP 429 被统一映射为 `AI_UNKNOWN`，无法区分可鉴权但余额、配额或速率受限的情况；SMTP 多类网络/TLS 类失败也落入 `SMTP_UNKNOWN`。现有页面的高级自定义 Provider / 中转站入口被折叠，且没有“已保存配置”的安全摘要，容易被误判为没有加载。

本任务不把真实 API Key、SMTP 授权码或飞书 Webhook 解密并发送到浏览器。用户请求的“星号与显示完整字符”采用方案 A 的安全边界：显示已配置状态、来源、脱敏摘要和重新输入/测试入口；对已保存秘密始终显示不可逆的掩码，不提供“显示已保存完整字符”开关。仅允许用户在当前页面自行输入的候选值以 `password` 控件编辑，候选值不会回填、不写 localStorage/sessionStorage。

## 2. 范围与非目标

### 范围

1. 为 AI、SMTP、飞书增加来源可辨识的安全状态：`verified_pass`、`environment_fallback`、`unconfigured`；状态 API 明确运行时是否可用。
2. 将环境 fallback 的有效候选配置以**内存快照**登记到 `ConfigurationService`，但不写入 DPAPI 存储、不伪造“已验证”时间。
3. 向设置页返回并渲染不含秘密的配置摘要：
   - AI：Provider 数量、显示名/模型/优先级与来源标签；不返回 API Key 或完整自定义中转 URL；
   - SMTP：已配置状态与经过遮蔽的账号/收件人提示；授权码永不返回；
   - 飞书：Webhook 已保存/环境 fallback 状态；完整 URL 永不返回。
4. 调整设置页状态卡：显示“已验证”“环境配置（待验证）”或“未配置”，展示掩码（例如 `•••••••• 已保存，不可回显`）、现有安全摘要、测试现有配置与替换配置入口；确保高级自定义 Provider / 中转站入口明确可见。
5. 保持真实连接测试只有用户主动触发才执行；修正 AI 429、SMTP 常见连接/认证/TLS/超时错误的固定、脱敏错误码映射。
6. 补齐后端集成、前端组件与 Playwright 验收，证明不返回秘密、不落浏览器存储、环境 fallback 可见、既有保存/重测语义未回归。

### 非目标

- 不读取、打印、提交或持久化任何 `.env.local`、API Key、SMTP 授权码、邮箱地址或飞书 Webhook 的真实值。
- 不实现已保存秘密的明文回显、复制或“显示完整字符”开关；如要改变这条安全规格，必须另立设计、风险评审与用户明确批准。
- 不自动或批量调用真实 AI、QQ SMTP、飞书、个人中转站、CC Switch、日抛或 CPA 服务；自动化测试使用本地 fake/mock 传输。
- 不改变 Provider 路由的“按优先级失败切换 + 冷却”语义，不把它写成成功请求轮询。
- 不扩展学生端业务流程、数据库 schema、S5/S7 或家长 Web 面板。

## 3. 实施步骤

### A. 后端状态模型与启动衔接

- 扩展 `configuration-service.ts` 的渠道状态来源/枚举和安全展示数据，保持 API 永远不包含 secret 字段。
- 新增专用的环境 fallback 登记方法：仅当没有 DPAPI active snapshot 时接收已完成环境校验的候选配置，设置内存快照、`environment_fallback`、`lastVerified=null` 和安全摘要，不写加密存储与状态元数据。
- 将 `runtime-configuration.ts` 的环境解析重构为返回候选快照；启动时用服务方法登记 fallback，再通过既有 listener / `applyRuntimeSnapshot` 安装运行时实例。DPAPI 已保存配置优先于环境 fallback。
- 保证 `retest()` 可以对环境 fallback 的内存快照执行显式测试，但测试成功不在用户明确“测试并激活/保存”前隐式覆盖存储。

### B. 安全摘要与 API

- 在 `configuration-types.ts` / API DTO 中定义白名单式 summary/hint；只包含必要的 Provider 名称、模型、优先级、来源和遮蔽后的非密钥标识。
- 使用统一的遮蔽函数处理邮箱/账号提示；Webhook、API Key、授权码和自定义 URL token 一律不返回。
- 调整 `/api/config/status` 与前端 API 类型；保留 `{ success, data, error }` 响应封装和 loopback/Origin 防护。

### C. 连接失败分类

- AI Provider 测试保留固定中文脱敏文案；将 HTTP 429 映射为明确的额度/配额或速率受限错误码，不传播上游响应正文。
- SMTP 继续不回显传输层原始报错；对认证、拒绝、超时、DNS、TLS/连接类的常见错误码归入固定安全错误码，未知异常仍为 `SMTP_UNKNOWN`。
- 飞书既有固定错误码/测试卡片语义不变；本任务测试不触发真实 webhook。

### D. 设置页体验

- 更新 `settings-page.tsx` 和 API 类型，将通道来源、可用性、摘要和掩码展示置于首屏卡片，避免将已加载配置误显示为空白。
- AI 卡显示已配置 fallback 队列的安全概览及“替换/重新测试”操作；官方预设仍可用于新增候选，`高级自定义 Provider / 中转站`作为清晰可见的展开入口。
- SMTP 首屏仍只提供账号、授权码、收件邮箱；飞书首屏仍只提供 Webhook。所有秘密输入继续是 `password`，成功后清空输入值；不新增持久化到浏览器的逻辑。
- 状态文案明确：环境 fallback 代表“已检测到配置、运行时可用、尚未通过本机配置中心记录验证”，不能暗示已完成真实连接测试。

### E. 测试与文档收尾

- 后端：扩展 ConfigurationService、runtime configuration、config API、ConnectionTester 的集成回归。覆盖环境 fallback 状态、安全摘要/secret 缺失、存储配置优先、显式重测、429、SMTP 分类和不写入存储。
- 前端：更新 SettingsPage 测试，覆盖三种状态、掩码、无 secret 回填、可访问的自定义 Provider 入口和本地存储为空。
- Playwright：在真实本地 Express/SQLite 服务下用受控环境变量构造 fallback，不访问外网；验证 `/settings` 首屏显示已有安全摘要，DOM/网络请求/浏览器存储均不含 fake secret，并验证窄屏布局。
- 在新的 `APP_DATA_ROOT` 下执行：`pnpm type-check`、后端/前端 build、`pnpm test`、`pnpm test:e2e`、文档治理、`git diff --check`。记录 KaTeX chunk-size warning（若仍退出码 0）为非阻塞警告。
- 完成后更新 `docs/04-开发任务清单-Todo-List.md` 的实现项、验证证据和版本记录；不提交运行数据、截图或日志。

## 4. 验收标准

- 仅使用 `.env.local` fallback 启动时，`/api/config/status` 和 `/settings` 不再显示“未配置 / 降级”，而是明确显示“环境配置（待验证）”；运行时可用性与状态一致。
- 每个 AI / SMTP / 飞书渠道均有安全摘要；响应、页面 DOM、localStorage、sessionStorage、日志和测试报告不含真实或 fake secret 的完整值。
- 已保存 DPAPI 配置优先级高于环境 fallback；环境 fallback 不会被隐式持久化或标为 `verified_pass`。
- AI 429 显示固定的额度/配额/速率受限错误码；SMTP 常见失败有固定脱敏错误码；不泄露上游异常正文。
- 设置页可见官方预设、清晰的高级自定义 Provider / 中转站入口、SMTP 和飞书首屏字段；秘密控件均为 `password`。
- 全量验证通过；若出现业务缺陷、外部服务失败或不可重现问题，停止修改并记录证据等待用户决定。

## 5. 风险、回滚与人工验证

- **风险**：把环境 fallback 错标为已验证会误导用户。缓解：使用独立来源状态，验证时间为 `null`，显式显示“待验证”。
- **风险**：摘要意外包含秘密。缓解：白名单 DTO、断言 JSON 不含 secret 字段、测试 fake secret 的 DOM/存储/日志缺失。
- **风险**：自定义 Provider URL 本身可能带 token。缓解：安全摘要不回显完整 URL，只显示用户给出的名称和非秘密模型信息。
- **回滚**：若摘要或状态模型出现安全回归，回退 M03 任务分支的提交；不影响既有 DPAPI 存储文件。
- **人工验证**：在用户的正常数据根且由用户主动启动/确认的服务中访问 `/settings`，检查已有配置显示“环境配置（待验证）”，点击“测试现有配置”仅在用户主动操作时触发外部连接。真实邮箱、飞书、AI 测试不作为 CI 必跑项。

## 6. 计划审查

- [x] 范围与 T08 安全契约一致：不回显、不保存浏览器秘密、仍用 password 输入。
- [x] 明确修复运行时 fallback 与 ConfigurationService 状态分离的根因，而非用前端猜测掩盖。
- [x] 明确“显示已保存完整字符”不在方案 A 范围，避免无审查地降低安全边界。
- [x] 覆盖 AI/SMTP/飞书、官方/自定义 Provider、API/前端/E2E 及窄屏回归。
- [x] 全部自动化使用 fake secret/本地传输，不会触发真实外部渠道。
- [x] 未引入无关业务、schema、用户流程或文档门禁越界。
- [x] 2026-07-19 独立复审：逐项核对启动入口、状态/API、连接测试、前端页面及既有测试锚点；文档治理通过。已修正计划登记文件的末尾空白，不影响范围。

# Phase 1-T08 本机配置中心与连接验收实施计划（修订 v6）

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现本机配置中心——首次启动无 AI/SMTP/飞书配置时系统可降级运行，用户通过前端设置页完成配置、连接测试和激活，密钥安全存储于 Windows 当前用户加密位置。

**Architecture:** 后端新增 `ConfigurationService` 管理三组配置（AI Provider、QQ SMTP、飞书 Webhook）加一个运行状态面板，每组独立维护四态状态机。密钥通过 Windows DPAPI 加密后存储在 `APP_DATA_ROOT/config/` 下。配置更新采用"内存测试→一次性加密写入并激活"流程——候选配置不落盘，只有测试通过的配置才写入 `active` 文件。前端新增 `/settings` 页面含四分区（AI / SMTP / 飞书 / 运行状态）和首次启动检测。

**Tech Stack:** TypeScript、Express、`@primno/dpapi` v2.0.1（N-API 预构建、Node 22 兼容）、React 18、Vite、`useApiRequest`、`node:test` + Vitest + Playwright。

---

## 0. 门禁与方案选择

### 0.1 门禁结论

- T08 门禁要求：独立实施计划、审查和用户明确批准。本文件即为独立计划。
- T07 已完成，Phase 1 功能核心的前置任务全部到位。
- `docs/04` T08 列明 7 个验收责任：首次启动向导、分区配置（含运行状态）、加密存储、连接测试、运行降级、原子激活和测试。

### 0.2 方案比较与选择

| #   | 方案                                          | 结论                                                                  |
| --- | --------------------------------------------- | --------------------------------------------------------------------- |
| 1   | **推荐：DPAPI 加密 JSON 文件 + 后端状态追踪** | 单机部署最简；DPAPI 天然绑定当前 Windows 用户，无需管理单独的加密密钥 |
| 2   | 不采用：SQLite 存储密钥                       | 数据库文件可被直接拷贝到其他机器解密，安全性不如 DPAPI 绑定用户       |
| 3   | 不采用：系统 Credential Manager               | API 复杂且不支持批量读写结构化配置                                    |
| 4   | 不采用：环境变量/dotenv 作为生产机制          | 明文存储，不满足安全要求；保留为开发/恢复 fallback                    |

### 0.3 DPAPI 依赖选型（技术 spike 结论）

| 候选                       | 状态                                                   | 结论                                      |
| -------------------------- | ------------------------------------------------------ | ----------------------------------------- |
| **`@primno/dpapi` v2.0.1** | 2025-01-12 发布、N-API 预构建（x64/arm64）、13k 周下载 | ✅ 采用                                   |
| `win-dpapi` v1.1.0         | 2020-06-13、NAN 方式需编译                             | ❌ 过旧、编译依赖重                       |
| PowerShell child_process   | ~518ms/次                                              | ❌ 作为灾难恢复文档方案保留，不用于运行时 |
| `koffi` FFI                | 可行但需大量 struct 定义                               | ❌ 不必要复杂度                           |

**API 调用形式（P1 修订）：**

```ts
import { Dpapi, isPlatformSupported } from '@primno/dpapi';

if (!isPlatformSupported) {
  throw new Error('CONFIG_DPAPI_UNAVAILABLE');
}

// 静态方法调用，不需要 new Dpapi()
const encrypted = Dpapi.protectData(Buffer.from('secret', 'utf-8'), null, 'CurrentUser');
const decrypted = Dpapi.unprotectData(encrypted, null, 'CurrentUser');
```

Node 兼容性：声明 `engines: >=14`，当前终端 Node v25.4.0。**实施门槛**：T08-A 开始前必须在 Node 22 实机执行 roundtrip 验证，验证通过后才继续后续子任务。实施时记录脱敏命令结果（Node 版本、架构、roundtrip 布尔通过），并在 `docs/04` T08 完成证据中登记。不记录明文或密文，不输出到 `.plans/` 目录。

安装方式：`pnpm add @primno/dpapi --filter backend`，预构建二进制自动下载，不需要 Python/MSVC。

失败错误码：若 `isPlatformSupported` 为 false 或 `Dpapi.protectData` 抛错，`SecretProtector` 返回 `CONFIG_DPAPI_UNAVAILABLE` 错误码，系统降级运行（视同无配置）。

### 0.4 降级策略

- `APP_DATA_ROOT` 仍为必需环境变量（系统无法确定数据目录则不启动）。
- AI、SMTP、飞书三组配置全部为可选——未配置或验证失败时：
  - AI 未配置/降级：返回明确错误码 `AI_NOT_CONFIGURED`
  - SMTP 未配置：S6 邮件推送跳过，本地报告仍生成
  - 飞书未配置：S6 飞书推送跳过，本地报告仍生成
- 每个通道独立降级，一个失败不阻塞其他。

### 0.5 配置存储生命周期（P1 修订重点）

**核心不变量：只有测试通过的配置才写入磁盘。**

```
用户提交配置 → 仅在内存中持有候选值
                  → 调用连接测试（使用内存候选值）
                        → 失败：丢弃内存候选值，返回错误
                        → 成功：一次性写入 {channel}.active.enc（原子 rename）
                                 → 如旧 active 存在，先备份为 {channel}.prev.enc
                                 → 更新内存快照
                                 → 通知运行时消费者使用新快照
```

**磁盘文件布局：**

```
{APP_DATA_ROOT}/config/
├── ai.active.enc          # 当前已激活的 AI 配置（DPAPI 加密）
├── ai.prev.enc            # 上一份有效 AI 配置（备份）
├── smtp.active.enc
├── smtp.prev.enc
├── feishu.active.enc
├── feishu.prev.enc
└── state.json             # 非加密，只含各通道状态和最后验证时间（辅助元数据，非激活事实来源）
```

**原子写入流程（P1 二审+三审修订）：**

为避免"active 重命名为 prev 后、新 active 写入前"的中断窗口，采用以下顺序。临时文件使用唯一名称（`{channel}.{randomId}.tmp`），避免并发请求覆盖同一临时文件（但同 channel 同时只有一个请求在写入——由 T08-B 串行锁保证）。

1. 加密候选配置 → 写入 `{channel}.{randomId}.tmp`
2. 如果 `{channel}.active.enc` 存在 → `rename(active.enc, prev.enc)`（覆盖旧 prev）
3. `rename({channel}.{randomId}.tmp, active.enc)`
4. 若步骤 2/3 任一失败 → 清理临时文件 → **不更新内存快照，不发事件** → 返回错误
5. 只有 `active.enc` 写入成功后 → 更新内存快照 → 发激活事件

**重启行为（P1 二审 + P2 四审补充）：**

0. **临时文件清理（P2 四审补充）：** 扫描 `{APP_DATA_ROOT}/config/` 目录，删除匹配 `{channel}.*.tmp` 模式的文件（严格白名单：channel 为 `ai`/`smtp`/`feishu`，后缀必须为 `.tmp`）。这些是上次进程中断留下的未完成写入产物。其他文件（包括 `.enc`、`state.json`、不匹配模式的文件）一律不删除。
1. 读取 `{channel}.active.enc` → 解密成功 → 加载到内存快照
2. `active.enc` 不存在但 `prev.enc` 存在 → **自动恢复**：`rename(prev.enc, active.enc)` → 解密成功 → 加载 → 记录 `CONFIG_RECOVERED_FROM_PREV`
3. `active.enc` 解密失败（损坏）→ 尝试 `prev.enc` → 成功则 `rename(prev.enc, active.enc)` → 记录 `CONFIG_RECOVERED_FROM_BACKUP`
4. `active.enc` 和 `prev.enc` 均不可用 → 该通道状态 = `unconfigured`，记录 `CONFIG_CORRUPT_DEGRADED`，降级运行
5. 不存在"候选未验证"的磁盘文件——候选配置只在请求内存中存活

**state.json 定位：**

- 只记录 `{ [channel]: { status, lastVerifiedAt, summary } }`
- 不是激活事实来源——启动时以 `active.enc` 可解密为准
- 激活时间和配置摘要可选地写入 state.json，供前端展示"最后验证"时间
- 如果 state.json 损坏或缺失，不影响配置恢复——从 active.enc 重建状态

**验证要求（P1 二审补充）：**

T08-A 实现后，针对原子写入流程注入中断点，验证：

- 步骤 2 后中断 → 重启后从 prev 恢复
- 步骤 3 失败 → 内存快照和事件不触发，旧配置继续有效
- 双文件损坏 → 降级到 unconfigured，不崩溃
- 残留 `.tmp` 文件 → 启动时清理，不影响正常配置加载
- 非白名单文件（如 `unknown.dat`）→ 不被清理

**与 `.env.local` 共存优先级：**

- 若 `config/{channel}.active.enc` 存在且可解密 → 使用加密存储配置（优先）
- 否则 fallback 到 `.env.local` 中的同类配置（开发兼容 + 灾难恢复）
- 一旦用户通过设置页激活了加密配置，`.env.local` 中的同类配置被忽略

---

## 1. 子任务拆分

### T08-A：SecretProtector 抽象与 DPAPI 实现

**目标：** 提供可注入的 `SecretProtector` 接口，Windows 生产实现使用 `@primno/dpapi`，测试使用内存 mock。

**实现要点：**

- [ ] 新建 `packages/backend/src/config/secret-protector.ts`
  ```ts
  export interface SecretProtector {
    encrypt(plaintext: Buffer): Buffer;
    decrypt(ciphertext: Buffer): Buffer;
    readonly available: boolean;
  }
  ```
- [ ] 新建 `packages/backend/src/config/dpapi-protector.ts`
  - 使用 `@primno/dpapi`：**静态方法** `Dpapi.protectData(data, null, 'CurrentUser')`（不是 `new Dpapi().protectData`）
  - `available` 属性：检查 `isPlatformSupported`
  - 平台不支持或加载失败时 `encrypt`/`decrypt` 抛出 `CONFIG_DPAPI_UNAVAILABLE`
- [ ] 新建 `packages/backend/src/config/test-protector.ts`
  - 简单的 XOR 或 base64 "加密"，仅用于自动化测试
  - 与生产隔离：只在 `NODE_ENV=test` 或依赖注入时使用
- [ ] 安装依赖：`pnpm add @primno/dpapi --filter backend`
- [ ] 验证：在本机运行 roundtrip 测试确认 `@primno/dpapi` 正常工作
- [ ] 新建 `packages/backend/src/config/secure-store.ts`
  - 接受注入的 `SecretProtector`
  - `write(channel, data)`: 按 0.5 原子写入流程执行：
    1. 加密 → 写 `{channel}.{randomId}.tmp`（唯一名称）
    2. 若 `active.enc` 存在 → `rename(active.enc, prev.enc)`（覆盖旧 prev）
    3. `rename({randomId}.tmp, active.enc)`
    4. 任一步骤失败 → 清理临时文件 → 抛错（不更新调用方状态）
  - `read(channel)`: 读 `active.enc` → 解密 → 返回；损坏时尝试 `prev.enc`；`active` 不存在但 `prev` 存在时自动恢复
  - `exists(channel)`: 检查 `active.enc` 是否存在
- [ ] 测试覆盖（使用 TestProtector）：
  - 加密后 roundtrip 恢复
  - 原子写入中断注入：步骤 2 后进程退出 → 重启后从 prev 自动恢复
  - 写入失败不留下半成品
  - 损坏 active 时 fallback 到 prev
  - prev 也损坏时返回明确错误码 `CONFIG_CORRUPT_DEGRADED`
  - 不同 channel 文件互不影响

### T08-B：ConfigurationService 与状态机

**目标：** 管理三组配置的四态生命周期，提供运行时配置快照分发。

**四态定义：**

```
unconfigured ──(用户提交+测试通过+写入)──→ verified_pass
verified_pass ──(用户提交新值+测试通过+写入)──→ verified_pass（更新）
verified_pass ──(active.enc损坏+prev恢复失败)──→ unconfigured
```

注意：不存在 `configured_unverified` 或 `verified_fail` 的持久化磁盘状态。用户提交的候选配置如果测试失败，直接丢弃，磁盘无变化。状态机简化为：

| 持久化状态      | 含义                                     |
| --------------- | ---------------------------------------- |
| `unconfigured`  | 无 active.enc 或不可读                   |
| `verified_pass` | active.enc 存在且上次启动/激活时解密成功 |

前端可展示的瞬时状态（不持久化）：

| 瞬时状态      | 含义                                   |
| ------------- | -------------------------------------- |
| `testing`     | 正在执行连接测试                       |
| `test_failed` | 本次测试失败，但不影响已有 active 配置 |

**实现要点：**

- [ ] 新建 `packages/backend/src/config/configuration-service.ts`
  - 构造时接受 `SecureStore` 实例和 `ConnectionTester` 实例
  - `initialize()`: 启动时读取三个 channel 的 active 配置，加载到内存快照；读取失败按 0.5 节规则处理
  - `getChannelStatus(channel)`: 返回 `{ status, lastVerified, summary }`（脱敏）
  - `getAllStatus()`: 三组 + 运行状态聚合
  - `testAndActivate(channel, candidateConfig)`: 核心方法——获取 channel 锁 → 在内存中用候选值执行连接测试 → 成功则写入磁盘并更新快照 → 失败则丢弃候选值并返回错误 → 释放锁
  - `getActiveSnapshot(channel)`: 返回当前内存中的不可变配置快照（内部使用）
  - `onConfigActivated(listener)`: 事件订阅，通知所有消费者
- [ ] **并发控制（P1 三审 + P2 四审补充）：**
  - 每个 channel 维护一个独立的 Promise 串行队列（`channelLocks: Map<Channel, Promise<void>>`）
  - `testAndActivate()` 入口获取 channel 锁，测试 + 写入 + 激活作为一个串行临界区
  - 不同 channel 仍可并行（AI 激活不阻塞 SMTP 激活）
  - 临时文件使用唯一名称：`{channel}.{randomId}.tmp`（不再使用固定的 `new.tmp`）
  - **异常释放语义（P2 四审补充）：**
    - 锁在 `finally` 中无条件释放（resolve），无论测试/写入成功或失败
    - 后继任务等待的是前一个锁的 settle（resolve），不继承 rejected 状态
    - 实现模式：
      ```ts
      async testAndActivate(channel, config) {
        const prev = this.channelLocks.get(channel) ?? Promise.resolve();
        let release: () => void;
        const current = new Promise<void>(r => { release = r; });
        this.channelLocks.set(channel, current);
        await prev;  // 等待前一个完成（无论成功/失败）
        try {
          return await this.doTestAndActivate(channel, config);
        } finally {
          release!();  // 释放锁，后继者可继续
        }
      }
      ```
    - 后继任务始终能执行——第一个任务抛错不阻塞第二个
  - 重复提交（同一候选值）：幂等无害——重新测试并重新写入
- [ ] `state.json` 只记录 `{ [channel]: { status, lastVerifiedAt } }`，作为启动时的辅助元数据
- [ ] 测试覆盖：
  - 启动时无配置不崩溃
  - testAndActivate 成功 → 磁盘有 active.enc + 内存快照更新 + 事件触发
  - testAndActivate 失败 → 磁盘无变化 + 内存快照不变
  - 损坏恢复流程（active 损坏 → prev 恢复 / 双损坏 → unconfigured）
  - 事件订阅者收到正确的新快照
  - **同 channel 并发激活**：两个请求同时调用 `testAndActivate('ai', ...)`，只有一个在执行测试和写入，另一个排队等待，最终两个都成功但结果是最后一个写入的值
  - **跨 channel 并发激活**：AI 和 SMTP 同时激活，互不阻塞，各自独立完成
  - **前一个失败，后继仍可成功（P2 四审回归）：** 第一个请求使用错误密钥导致测试失败，第二个请求使用正确密钥排队后正常激活

### T08-C：连接测试服务

**目标：** 三个通道各一个连接测试函数，接受内存中的候选配置（非磁盘配置），返回标准化结果。

**实现要点：**

- [ ] 新建 `packages/backend/src/config/connection-tester.ts`
- [ ] `testAi(candidateConfig)`: **逐个 Provider 分别测试（P2 三审补充）**
  - 对 `candidateConfig.providers` 数组中的每个 Provider 独立执行最小请求（"reply OK"），超时 15s
  - 返回按 Provider 名称划分的结果数组：
    ```ts
    interface AiTestResult {
      pass: boolean; // 全部通过才为 true
      providers: Array<{
        name: string; // provider 名称（安全展示）
        pass: boolean;
        latencyMs?: number;
        model?: string;
        errorCode?: string;
        sanitizedMessage?: string; // 不含 URL/key
      }>;
    }
    ```
  - **全部通过**才允许激活。部分失败时返回 `pass: false` + 逐 Provider 状态
  - 理由：若只测第一个成功就激活，备用 Provider 的错误密钥在故障转移时才暴露
- [ ] `testSmtp(candidateConfig, sendTestEmail: boolean)`: 使用 `nodemailer.createTransport(config).verify()` 验证连接
  - 可选发送测试邮件（固定模板 "AI StudyBuddy 配置测试"，收件地址用配置中的 `to`）
  - 成功：`{ pass: true, smtpGreeting }`
  - 失败：`{ pass: false, errorCode, sanitizedMessage }`
- [ ] `testFeishu(candidateConfig)`: 向 webhook URL POST 固定测试卡片（标题"配置测试"，不含学生数据）
  - 成功：`{ pass: true }`
  - 失败：`{ pass: false, errorCode, sanitizedMessage }`
- [ ] 所有错误信息脱敏：不含密钥、完整 URL、请求体、完整错误栈
- [ ] 错误码枚举：`AI_CONNECTION_TIMEOUT`、`AI_AUTH_FAILED`、`AI_UNKNOWN`、`SMTP_AUTH_FAILED`、`SMTP_CONNECTION_REFUSED`、`FEISHU_WEBHOOK_REJECTED` 等
- [ ] 测试覆盖：
  - Mock 成功/失败/超时场景
  - 返回结果不含密钥或完整 URL
  - 各通道独立

### T08-D：配置 API 端点与安全防护

**目标：** 前端可通过 REST API 读取状态、提交并测试配置（一步完成）、查看运行状态。整个本机 API 受统一的 loopback Origin 策略保护，配置写接口额外限定 JSON 请求。

**端点设计：**

| 方法 | 路径                                     | 用途                                           | 安全等级                |
| ---- | ---------------------------------------- | ---------------------------------------------- | ----------------------- |
| GET  | `/api/config/status`                     | 返回三组配置状态 + 运行状态面板；不含密钥      | Origin 校验             |
| POST | `/api/config/:channel/test-and-activate` | 接收候选配置 → 内存测试 → 成功则加密写入并激活 | Origin 校验 + JSON only |
| POST | `/api/config/:channel/retest`            | 使用已激活配置重新测试连接                     | Origin 校验 + JSON only |

**P1 四审 + 五审：Origin/CORS 防护**

当前 `server.ts:22` 使用 `app.use(cors())`（开放 CORS）。它会在配置路由之前处理预检请求；仅给 `/api/config/*` 叠加第二个 CORS 中间件无法形成可靠边界。配置中心启用真实 Provider 后，恶意网页还可能调用其他写 API 或开发 AI API，因此 T08 将替换整个 `/api` 的开放 CORS，而不是只保护配置路由。

- [ ] 新建 `packages/backend/src/middleware/api-origin-policy.ts`
  - 在 `server.ts` 中移除开放的 `app.use(cors())`，改为在所有 `/api` 路由之前挂载统一 Origin 策略
  - 默认允许的 Origin：
    - `http://localhost:5173`、`http://127.0.0.1:5173`（Vite 开发）
    - `http://localhost:4173`、`http://127.0.0.1:4173`（Vite preview / Playwright）
  - 同步给 Vite `server` 和 `preview` 设置固定端口与 `strictPort: true`，避免自动漂移到未授权端口
  - 当前临时使用的 `4174` 不作为永久默认；确需使用时通过 `CONFIG_ALLOWED_ORIGINS` 显式追加
  - `CONFIG_ALLOWED_ORIGINS` 通过 `env.ts` 集中读取，并同步 `.env.example` 与 `docs/10`
  - 追加项必须由 `URL` 解析为精确 Origin，只允许 `http:` + loopback hostname（`localhost`、`127.0.0.1` 或 `[::1]`）+ 显式端口；拒绝远程 host、凭据、路径、查询、fragment 和 `*`
  - 请求包含 `Origin` 头时：校验 Origin 是否在白名单中
    - 不在白名单 → 返回 403，响应体为固定错误码 `CONFIG_ORIGIN_REJECTED`，不回显 Origin、URL 或密钥
  - 请求不包含 `Origin` 头（本机 CLI 请求如 curl、测试脚本）→ 允许通过
  - `OPTIONS` 必须先完成 Origin 校验：白名单 Origin 返回 204 和允许头，非法 Origin 返回 403 且不返回 `Access-Control-Allow-Origin`
  - 预检处理完成后，配置 POST 路由才检查 Content-Type；GET/OPTIONS 不要求 JSON
  - 配置 POST 只接受 `Content-Type: application/json`，拒绝 `application/x-www-form-urlencoded` 和 `multipart/form-data`
    - 表单式提交返回 415 `CONFIG_UNSUPPORTED_CONTENT_TYPE`
- [ ] 测试覆盖：
  - `127.0.0.1:5173`、`localhost:5173`、`127.0.0.1:4173` → 通过
  - 合法 OPTIONS 预检不被 JSON 检查误判为 415
  - 恶意 Origin（`http://evil.com`）→ 403
  - 伪造 preflight（OPTIONS + 恶意 Origin）→ 不返回 Access-Control-Allow-Origin
  - `CONFIG_ALLOWED_ORIGINS` 中的 loopback 追加项 → 通过；远程 Origin、`*`、带路径或凭据的值 → 启动校验拒绝
  - 无 Origin 的本机 CLI 请求 → 通过
  - `Content-Type: application/x-www-form-urlencoded` → 415
  - 403/415 响应不含密钥、URL 或 Origin 值

**P2 四审：输入格式与资源上限**

- [ ] POST body 验证规则：
  - AI:
    - `providers` 数组长度：1–10（上限 10 个 Provider）
    - `name`：1–50 字符，去除控制字符（`\x00-\x1F`）后存储和记录日志
    - `baseUrl`：1–200 字符，只允许 `https://` 或 `http://`（本机 HTTP Provider 允许，但仅限 `127.0.0.1` 或 `localhost`），不允许 `file://`、`ftp://` 或无协议
    - `apiKey`：1–200 字符
    - `model`：1–100 字符，去除控制字符
    - `priority`：整数，范围 1–100，不允许 NaN/Infinity
    - Provider 按 `priority` 升序稳定排序（priority 相同时保留提交顺序）
  - SMTP:
    - `host`：1–253 字符
    - `port`：整数，范围 1–65535
    - `secure`：布尔
    - `user`：1–200 字符
    - `authCode`：1–200 字符
    - `to`：1–200 字符，基本邮箱格式校验（含 `@`）
  - feishu:
    - `webhookUrl`：1–500 字符，必须以 `https://` 开头
  - 所有字符串字段超出上限 → 400 + 固定错误码 `CONFIG_FIELD_TOO_LONG`
  - Provider 名称进入日志前去除控制字符，避免误填密钥扩散到日志
- [ ] AI 多 Provider 测试整体超时：
  - 单 Provider 超时 15s
  - 整体测试超时 = `min(providers.length * 15, 60)` 秒（上限 60s）
  - 整体超时触发时，未完成的 Provider 标记为 `AI_TEST_OVERALL_TIMEOUT`

**实现要点：**

- [ ] 新建 `packages/backend/src/routes/config-routes.ts`
- [ ] `channel` 参数验证：只接受 `ai` | `smtp` | `feishu`
- [ ] GET `/api/config/status` 响应：
  ```json
  {
    "ai": { "status": "verified_pass", "lastVerified": "...", "summary": "gpt-4o via 2 providers" },
    "smtp": { "status": "unconfigured", "lastVerified": null, "summary": null },
    "feishu": { "status": "verified_pass", "lastVerified": "...", "summary": "webhook 已激活" },
    "runtime": {
      "dataDir": true,
      "aiAvailable": true,
      "smtpAvailable": false,
      "feishuAvailable": true,
      "uptime": 3600,
      "nodeVersion": "22.x.x"
    }
  }
  ```
- [ ] 响应中永远不返回完整 apiKey、authCode、webhookUrl、完整路径；summary 只含模型名或 provider 数量
- [ ] 注册路由到 Express app；统一 Origin 策略先于全部 `/api` 路由，配置 JSON-only 检查只挂载在配置 POST 路由
- [ ] 测试覆盖：
  - 状态读取不含密钥
  - 无效 channel 返回 400
  - test-and-activate 成功 → 状态变 verified_pass + 返回逐 Provider 测试结果
  - test-and-activate 失败 → 状态不变 + 返回错误码和脱敏消息
  - retest 在无 active 时返回 404
  - providers 超过 10 个 → 400
  - port 超出范围 → 400
  - 字段超长 → 400 `CONFIG_FIELD_TOO_LONG`
  - 控制字符被清除后正常保存

### T08-E：运行时配置消费者统一接入（P1 三审修订）

**目标：** 所有配置消费者通过统一机制获取配置；激活新配置后，在途请求继续使用旧 Router，新请求使用新 Router；同一配置下的 Router 实例复用，保留 T02 熔断状态。

**当前消费者清单：**

| 消费者          | 文件                                             | 当前读取方式                                     | T08 接入方式                    |
| --------------- | ------------------------------------------------ | ------------------------------------------------ | ------------------------------- |
| AI: dev API     | `api/dev-ai.ts:12`                               | 模块级 `const aiRouter = new AiProviderRouter()` | 改为 `AiRouterProxy`            |
| AI: 资料 Worker | `services/material-job-worker.ts:48`             | 类属性 `new AiProviderRouter()`                  | 改为 `AiRouterProxy`            |
| AI: 练习服务    | `services/practice-runner-service.ts:232`        | 构造时 `new AiProviderRouter()`                  | 改为 `AiRouterProxy`            |
| SMTP            | `services/parent-report-delivery-service.ts:475` | 直接读 `config.smtp*`                            | 改为 `getCurrentSmtpConfig()`   |
| 飞书            | `services/parent-report-delivery-service.ts:501` | 直接读 `config.feishuWebhookUrl`                 | 改为 `getCurrentFeishuConfig()` |

**说明：** 报告 AI 润色当前未接线（ParentReportService 默认构造不传 `summarizeWithAi`），不是消费者。实际 AI 消费者为 3 个。

**设计：激活时构建 Router + 原子替换引用 + 代理读取（P1 三审修订）**

核心思想：

- 模块级 `currentAiRouter` 保存一个完整的 `AiProviderRouter` 实例（含熔断状态）
- 激活新 AI 配置时，**构建一个新的 `AiProviderRouter`**，然后原子替换 `currentAiRouter` 引用
- `AiRouterProxy.generate()` 在每次请求**开始时**读取一次 `currentAiRouter` 并调用，整个请求使用同一实例
- 同一配置下的多次请求复用同一 Router 实例 → T02 熔断状态正常跨请求累计

```
配置激活 → new AiProviderRouter(newProviders) → currentAiRouter = newRouter
             ↗ 旧 Router 被在途请求持有，GC 在所有引用释放后回收
请求 A → proxy.generate() → const router = currentAiRouter → router.generate(...)
请求 B → proxy.generate() → const router = currentAiRouter → router.generate(...)
// A 和 B 使用同一实例，熔断计数跨请求累计
```

- [ ] 新建 `packages/backend/src/config/config-registry.ts`
  - 模块级变量：
    ```ts
    let currentAiRouter: AiProviderRouter | null = null;
    let currentSmtpConfig: SmtpConfig | null = null;
    let currentFeishuConfig: FeishuConfig | null = null;
    ```
  - `setAiRouter(router: AiProviderRouter | null)` — 原子替换（单赋值）
  - `getAiRouter(): AiProviderRouter | null` — 返回当前引用
  - `setSmtpConfig(config: SmtpConfig | null)` — 原子替换
  - `getCurrentSmtpConfig(): SmtpConfig | null`
  - `setFeishuConfig(config: FeishuConfig | null)` — 原子替换
  - `getCurrentFeishuConfig(): FeishuConfig | null`
- [ ] `ConfigurationService` 激活 AI 配置时：
  - 用新的 provider 列表调用 `new AiProviderRouter({ providers })` 构建新实例
  - 调用 `setAiRouter(newRouter)` 原子替换
  - 旧 Router 不主动销毁——在途请求持有的引用继续有效，GC 自然回收
- [ ] 新建 `packages/backend/src/adapters/ai/ai-router-proxy.ts`
  - 导出 `class AiRouterProxy implements AiProvider`
  - `generate(request)`:
    ```ts
    const router = getAiRouter();
    if (!router) throw new AiProviderError('AI_NOT_CONFIGURED', ...);
    return router.generate(request);  // 整个请求使用同一 router 实例
    ```
  - 不在 generate 内构建新 Router——只读取并调用现有实例
- [ ] 改造 AI 消费者（3 处）：
  - `dev-ai.ts:12`：`const aiRouter = new AiRouterProxy()`
  - `material-job-worker.ts:48`：`private readonly ai: AiProvider = new AiRouterProxy()`
  - `practice-runner-service.ts:232`：默认值改为 `new AiRouterProxy()`，仍支持注入（测试）
- [ ] 改造 `AiProviderRouter` 构造：
  - 接受显式 `providers: AiProvider[]` 参数
  - 不再读 `config` 全局——provider 列表由调用方提供
  - 保留 `buildProvidersFromConfig()` 作为初始化 helper（读 `.env.local` fallback 时使用）
- [ ] 改造 SMTP/飞书消费者：
  - `parent-report-delivery-service.ts`：`isSmtpConfigured()` 读 `getCurrentSmtpConfig()`
  - 发送时使用 `getCurrentSmtpConfig()` 返回的快照
  - 飞书同理：`getCurrentFeishuConfig()`
- [ ] 家长报告 runner（独立进程）：
  - 一次性脚本进程，启动时初始化 ConfigurationService → 调用 `setAiRouter/setSmtpConfig/setFeishuConfig`
  - 无需热重载——每次运行都是新进程
- [ ] **启动顺序（P2 五审补充）：**
  - Web 后端使用显式 `bootstrap()`：先完成 `ConfigurationService.initialize()`，再调用 Express `listen()`，最后启动 Material Worker 定时器
  - 模块级 `AiRouterProxy` 可以提前构造，但初始化完成前不对外接收请求、不运行 Job
  - DPAPI 不可用、单通道文件损坏或缺少配置属于受控降级：`initialize()` 返回各通道状态，不留下未处理 Promise
  - 非预期初始化异常写固定脱敏错误码；除 `APP_DATA_ROOT` 不可用等既有启动硬失败外，其余通道错误不得阻止后端进入降级模式
  - 家长报告 runner 必须先 `await ConfigurationService.initialize()`，再创建 `ParentReportDeliveryService` 并执行重试/投递
- [ ] 启动优先级规则：
  1. `ConfigurationService.initialize()` 尝试读取 `{channel}.active.enc`
  2. 成功 → 用加密存储配置构建 Router/Config → 调用 `setXxx()` 注册
  3. 失败 → fallback 读 `.env.local` 的对应字段 → 同样调用 `setXxx()` 注册
  4. 两者都无 → 不调用 `setXxx()`，保持 null，该通道 unconfigured 降级运行
- [ ] 测试覆盖：
  - 同一配置下多次 generate 使用同一 Router 实例（断言引用相等）
  - 激活新配置后，新请求使用新 Router，旧请求继续完成
  - T02 熔断状态跨请求累计：连续失败 5 次后进入冷却
  - 空配置启动所有消费者不崩溃
  - AI 未配置时返回 `AI_NOT_CONFIGURED`
  - `.env.local` fallback 正常（CI 环境）
  - 配置初始化完成前 Express 尚未监听、Material Worker 尚未执行
  - 单通道初始化失败时其他通道和 Web 后端仍可用
  - 家长报告 runner 在初始化完成后才构造并调用投递服务

### T08-F：前端设置页面（含运行状态分区）

**目标：** 用户可通过浏览器完成配置管理全流程，并查看系统运行状态。

**页面结构：** `/settings` 路由，包含四个分区：

1. **运行状态** — 数据目录可用性、AI/SMTP/飞书当前可用状态、后端运行时长、版本
2. **AI Provider** — 多 provider 列表编辑、测试并激活
3. **QQ SMTP** — SMTP 配置表单、测试并激活（含可选测试邮件）
4. **飞书 Webhook** — webhook URL 表单、测试并激活

**实现要点：**

- [ ] 新建 `packages/frontend/src/pages/settings-page.tsx`
- [ ] 运行状态分区（P2 修订补充）：
  - 只读面板，展示 `runtime` 字段
  - 后端连接状态（API 可达性）
  - 数据目录状态（可用/不可用，不显示完整路径）
  - AI 可用/降级（`AI_NOT_CONFIGURED` vs 正常）
  - SMTP 可用/未配置
  - 飞书可用/未配置
  - 固定错误码展示（如 `CONFIG_DPAPI_UNAVAILABLE`、`CONFIG_CORRUPT_DEGRADED`）
- [ ] 每个配置分区显示：
  - 当前状态徽章（未配置 / 已通过）+ 颜色
  - 配置表单（密钥字段用 password input，提交后清空本地值）
  - "测试并激活"按钮 → 显示加载状态 → 显示通过（自动激活）/失败结果
  - 已有配置时：显示脱敏摘要和最后验证时间
  - "重新测试"按钮（验证现有配置仍有效）
- [ ] AI Provider 分区：支持多 provider 列表编辑（添加/删除/排序优先级）
- [ ] 首次启动检测：
  - 前端启动时调用 `GET /api/config/status`
  - 如果三组全为 `unconfigured`，在 app 壳层显示"首次配置引导"提示卡，点击进入 `/settings`
  - 不强制跳转（用户可跳过，系统降级运行）
- [ ] 添加到顶部导航区域（齿轮图标）
- [ ] 响应式：移动端分区竖排
- [ ] 测试覆盖（Vitest + jsdom）：
  - 运行状态面板正确展示各通道状态
  - 测试并激活成功后状态更新
  - 测试失败时显示错误码和脱敏消息
  - 密钥不回显
  - 首次引导条件触发
  - 固定错误码正确显示

### T08-G：集成验收与收尾

**目标：** 全流程端到端验证。

**验收清单：**

- [ ] **冷启动无配置**：删除 `config/` 目录 + 清空 `.env.local` AI/SMTP/飞书字段 → 启动后端 → 不崩溃，API 返回三组 `unconfigured`，运行状态显示降级
- [ ] **前端首次引导**：打开浏览器 → 显示配置引导提示 → 点击进入 settings → 运行状态面板可见
- [ ] **AI 配置全流程**：填写 provider → "测试并激活" → pass → AI 功能立即恢复（无需重启）
- [ ] **AI 测试失败**：填写错误密钥 → "测试并激活" → 失败 → 显示脱敏错误 → 已有 active 配置不受影响
- [ ] **SMTP 配置全流程（P2 二审修订）**：填写 SMTP 信息 → "测试并激活" → **自动化测试使用 mock SMTP 验证连接逻辑** → 激活成功；真实邮件发送测试由用户显式触发，不作为常规验收依赖
- [ ] **飞书配置全流程（P2 二审修订）**：填写 webhook → "测试并激活" → **自动化测试使用 mock Feishu 验证连接逻辑** → 激活成功；真实飞书卡片测试由用户显式触发，不作为常规验收依赖
- [ ] **密钥不泄漏**：GET 状态 API 不含明文密钥；前端不存储密钥；日志不含密钥
- [ ] **通道隔离**：AI 配置失败不影响 SMTP/飞书功能
- [ ] **重启恢复**：激活后重启后端 → 自动加载已激活配置 → 状态保持 → 消费者正常使用
- [ ] **损坏恢复**：手动损坏 `ai.active.enc` → 重启 → 尝试 `ai.prev.enc` 恢复 → 成功则继续；双损坏则降级到 unconfigured，不崩溃
- [ ] **active 缺失恢复（P1 二审补充）**：手动删除 `ai.active.enc` 但保留 `ai.prev.enc` → 重启 → 自动从 prev 恢复并记录 `CONFIG_RECOVERED_FROM_PREV`
- [ ] **`.env.local` 兼容**：无 active.enc 但 `.env.local` 有配置时，消费者正常使用 `.env.local` 值
- [ ] **`.env.local` 被加密存储覆盖**：active.enc 存在时，`.env.local` 中同类配置被忽略
- [ ] **在途请求安全（P1 二审补充）**：AI 请求进行中，激活新配置 → 在途请求完成时使用启动时的快照，不受新配置影响
- [ ] 构建验证：`pnpm type-check` + 后端 build + 前端 build + `pnpm test` 全通过
- [ ] 文档治理通过
- [ ] Playwright 浏览器验收脚本覆盖设置页面基本流程（使用 mock 连接测试，不依赖真实外部服务）

**真实渠道测试规则（P2 二审补充）：**

真实 AI Provider、SMTP 邮件、飞书 Webhook 测试**不作为自动化验收或常规合并门槛**。它们：

- 由用户通过前端设置页显式触发（"发送测试邮件"勾选框、真实 Provider 测试）
- 仅在用户另行批准后执行
- 结果不阻塞分支合并到 master
- 用于验证真实环境配置正确性，不替代自动化测试覆盖

---

## 2. 执行顺序与依赖

```
T08-A (SecretProtector + SecureStore) ──→ T08-B (ConfigService)
                                                    │
T08-C (连接测试服务) ───────────────────────────────┤
                                                    ↓
                                         T08-D (API 端点)
                                                    │
T08-E (消费者统一接入) ←── T08-B                     │
         │                                          │
         └──────────────────────────────────────────┤
                                                    ↓
                                         T08-F (前端设置页 + 运行状态)
                                                    │
                                                    ↓
                                         T08-G (集成验收)
```

- T08-A → T08-B（B 依赖 SecureStore）
- T08-C 可与 T08-A 并行
- T08-D 依赖 T08-B + T08-C
- T08-E 依赖 T08-B（但可与 T08-D 并行推进）
- T08-F 依赖 T08-D + T08-E
- T08-G 是最终集成验收

---

## 3. 安全与隐私规则

1. **候选配置不落盘**：候选值只在请求内存中测试，测试失败直接丢弃，磁盘无任何变化
2. **密钥只进不出**：API 接收明文密钥后立即用于内存测试，测试通过才加密写入；GET 永远只返回脱敏摘要
3. **日志脱敏**：连接测试日志只记录 `{ channel, pass, latencyMs, errorCode }`，不含密钥、URL、邮箱正文、完整错误栈
4. **DPAPI 绑定**：加密文件只能在创建它的 Windows 用户下解密；换用户或拷贝到其他机器无法解密
5. **`.env.local` 定位**：仅作为开发 fallback 和灾难恢复入口；加密存储存在时优先
6. **测试邮件/卡片**：固定模板，标题 "AI StudyBuddy 配置测试"，不含任何学生数据
7. **运行状态不暴露**：不显示完整路径、内部 IP、密钥前缀以外的任何密钥信息

---

## 4. 不做的事

- 不实现多用户认证或角色（本机单用户产品）
- 不实现远程配置同步或云端备份
- 不修改学期创建/选择流程（属于 T09A）
- 不新增其他页面或路由（仅 `/settings`）
- 不提供模糊的"非 Windows 生产 fallback"——自动化测试使用注入式 TestProtector，CI 不需要 DPAPI
- 不把真实密钥、Provider URL、完整 UUID 提交进仓库
- 不在本任务实现每日首页或全局导航（属于 T09B/T09D）
- 不存在"保存但未验证"的磁盘状态——磁盘上只有已激活配置和备份

---

## 5. 风险与缓解

| 风险                                | 缓解                                                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `@primno/dpapi` 预构建缺少当前 arch | 包声明 N-API `engines: >=14`，提供 x64/arm64 预构建；实施 T08-A 前先做 Node 22 实机 roundtrip 验证（见 0.3 实施门槛） |
| `@primno/dpapi` 未来不维护          | 接口通过 `SecretProtector` 抽象，可替换为 koffi 或 PowerShell 实现                                                    |
| CI 无 Windows/DPAPI                 | 所有测试注入 `TestProtector`，不依赖真实 DPAPI                                                                        |
| SMTP/飞书测试依赖外部服务           | 自动化测试全部使用 mock；真实通道测试是用户手动操作                                                                   |
| 配置文件损坏（断电/磁盘错误）       | 原子写入（tmp + rename）+ prev 备份 + 双损坏降级到 unconfigured                                                       |
| 同 channel 并发激活竞态             | 每 channel 独立串行锁（见 T08-B 并发控制）                                                                            |
| 在途 AI 请求与配置切换竞态          | 不可变引用设计——请求开始时读取 `currentAiRouter`，整个请求生命周期使用该实例                                          |

---

## 6. 预估工作量

| 子任务                              | 预估                                                   |
| ----------------------------------- | ------------------------------------------------------ |
| T08-A SecretProtector + SecureStore | 中（抽象 + @primno/dpapi 集成 + 原子写入 + prev 备份） |
| T08-B ConfigService                 | 中（状态机 + 事件通知 + 启动恢复）                     |
| T08-C 连接测试                      | 中（三个通道各需不同协议）                             |
| T08-D API 端点 + 安全防护           | 中（Origin 校验 + 输入上限 + 路由注册）                |
| T08-E 消费者统一接入                | 中（改造 5 处消费者 + 代理+注册表 + 优先级规则）       |
| T08-F 前端设置页 + 运行状态         | 中（四分区 + 表单 + 多 provider 编辑）                 |
| T08-G 集成验收                      | 中（Playwright + 冷启动 + 重启 + 损坏恢复）            |

---

## 7. 审查修订记录

| 版本 | 日期       | 修订内容                                                                                                                                                                                                                                                                                   |
| ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| v1   | 2026-07-17 | 初始计划                                                                                                                                                                                                                                                                                   |
| v2   | 2026-07-17 | P1: 消除"保存未验证配置到磁盘"；P1: 依赖改为 `@primno/dpapi` + SecretProtector 抽象；P1: 运行时消费者统一接入；P2: 运行状态分区                                                                                                                                                            |
| v3   | 2026-07-17 | P1: AI Router 改为代理对象；P1: 原子写入补充 prev 恢复；P1: DPAPI 静态方法+实施门槛；P2: 真实渠道 smoke 不作合并门槛                                                                                                                                                                       |
| v4   | 2026-07-17 | P1: AiRouterProxy 引用传递保留 T02 熔断；P1: 每 channel Promise 串行锁+唯一临时文件名；P2: AI 逐 Provider 测试全通过才激活；P2: roundtrip 证据位置修正                                                                                                                                     |
| v5   | 2026-07-17 | P1: 配置写接口增加 Origin 白名单校验和 JSON-only 限制，防止恶意网页跨站改写；P2: Promise 锁增加 finally 释放语义和失败后继回归测试；P2: 输入格式与资源上限（Provider 数量、字段长度、port 范围、URL 协议、控制字符清理、整体测试超时）；P2: 启动时清理残留 .tmp 文件（严格白名单模式匹配） |
| v6   | 2026-07-17 | P1: 用统一 loopback Origin 策略替换全局开放 CORS，补齐真实 Vite 5173、固定 preview 4173、合法预检顺序和受限 Origin 扩展；P2: 明确 ConfigurationService 必须先于 Express listen、Material Worker 和家长报告投递初始化；同步五审状态                                                         |

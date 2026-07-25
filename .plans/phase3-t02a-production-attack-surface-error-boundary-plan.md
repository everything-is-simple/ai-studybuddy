# PHASE3-T02A 生产攻击面与统一错误边界实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不扩大产品范围的前提下，收紧生产后端的开发路由攻击面、统一 API 异常响应、显式固定生产运行模式，并在后端配置层强制回环监听。

**Architecture:** `createApp` 接收显式的开发路由开关，生产启动由集中配置 `nodeEnv` 决定是否允许开发路由；所有 Express 解析错误、文件上传错误和未知异常经过单一 JSON 错误边界，外部只得到固定中文错误码/消息。`env.ts` 负责解析并校验运行模式和 `BACKEND_HOST`，PowerShell 启动脚本在加载运行时配置后显式固定 `NODE_ENV=production`，测试环境显式声明为 `test`，从而不依赖宿主机环境的偶然值。

**Tech Stack:** Node.js 24、TypeScript、Express、Multer、Node test runner、PowerShell、pnpm。

---

## 0. 当前事实、批准边界与切片状态

- 高层 `PHASE3-T02：安全与隐私基线审计计划` 已于 **2026-07-25** 获用户明确批准，并已进入 `origin/master`，但不代表安全修复、上线审计或用户电脑安装验收完成。
- 本切片是 T02 的首个独立实施计划，当前状态为 **计划待用户批准**；在用户批准本计划前不得修改业务代码、测试代码或部署脚本。
- 当前已确认的待处理风险候选：
  1. `packages/backend/src/app.ts` 无条件挂载 `/api/dev`、`/api/dev/storage`、`/api/dev/converter`、`/api/dev/ai`；
  2. `express.json()` 畸形 JSON、Multer 错误和未知异常没有统一的最终 JSON 脱敏错误边界；
  3. `packages/backend/src/config/env.ts` 没有明确 `nodeEnv`，`BACKEND_HOST` 只读取环境变量而未在后端核心拒绝非 `127.0.0.1`；
  4. `scripts/start-production.ps1` 依赖 wrapper 校验回环，但启动 Node 子进程前没有显式设置 `$env:NODE_ENV = 'production'`。
- 已存在的正向控制必须保持：API Origin 策略、当前健康检查、静态资源/SPA fallback、开发路由专项测试、PowerShell 回环检查和 `APP_DATA_ROOT` 隔离测试。
- 不读取、输出或持久化真实 API Key、Provider URL、学生真实资料、课堂录音、正式数据库、正式日志或正式运行数据。

## 1. 范围与非范围

### 1.1 本切片范围

1. 生产模式关闭全部 `/api/dev*` 开发/诊断路由，并返回统一 JSON 404；开发和测试模式继续显式允许现有 dev API，不能破坏现有开发测试。
2. 为 API 增加统一 JSON 错误边界，覆盖：畸形 JSON、传递到全局边界的 Multer 文件错误和未知异常；既有路由已安全处理的领域错误保持当前业务语义。
3. 统一错误外部契约为：

```json
{
  "success": false,
  "error": {
    "code": "SAFE_ERROR_CODE",
    "message": "固定中文提示"
  }
}
```

该结构遵循 `packages/shared/src/types.ts` 的现有 `ApiError`：成功态使用 `data`，失败态使用 `error`；本切片不扩大共享类型或强制失败响应增加 `data:null`。

4. 外部错误响应不得包含 `stack`、绝对路径、原始异常消息、storage key、Provider 原始响应、API Key、Webhook、学生资料或课堂内容。
5. `env.ts` 增加严格运行模式解析；后端核心拒绝非 `127.0.0.1` 的 `BACKEND_HOST`。
6. `start-production.ps1` 在启动 Node 子进程前显式设置 `NODE_ENV=production`；开发/测试启动路径显式传入 `development` 或 `test`。

### 1.2 明确非范围

- 不处理 OCR/whisper.cpp 子进程环境 allowlist、日志轮转/脱敏、备份/恢复/ACL、配置文件秘密扫描或学生核心流程失败矩阵；这些进入 T02 的后续独立切片。
- 不新增业务 API、Schema、Worker、前端页面、认证/鉴权、公网入口或家长面板。
- 不执行真实 Provider、SMTP、飞书、ASR 网络试验，不启动 Docker/WSL，不修改 Firewall、组策略、注册表或安全策略。
- 不执行用户电脑安装验收，不处理完整 S7、G2/外部 ASR 主线或 S3 Worker。
- 不改变已有业务错误语义以外的产品行为；若现有错误信息为英文，仅在统一边界中替换为不泄露内部细节的固定中文外部提示。

## 2. 文件变更地图

### 2.1 计划批准后允许修改的源码/脚本

- **Modify:** `packages/backend/src/config/env.ts`：增加 `nodeEnv` 解析、允许值校验、`BACKEND_HOST` 回环校验。
- **Modify:** `packages/backend/src/server.ts`：将 `config.nodeEnv` 转换为显式 `enableDevRoutes` 传给 `createApp`。
- **Modify:** `packages/backend/src/app.ts`：增加开发路由开关；调整 API 404 文案；挂载最终统一 JSON 错误中间件。
- **Create:** `packages/backend/src/middleware/api-error-handler.ts`：集中定义安全错误码、固定中文消息和 Express 错误归一化逻辑；不得输出底层异常内容。
- **Modify:** `scripts/start-production.ps1`：在 Node 子进程启动前设置 `$env:NODE_ENV = 'production'`，保留已有回环检查和隐藏窗口行为。

### 2.2 计划批准后允许修改的测试

- **Create:** `packages/backend/test/production-attack-surface-error-boundary.test.mjs`：通过已构建 `dist/server.js` 验证生产/测试模式的开发路由开关、畸形 JSON、未知异常和无泄露响应。
- **Modify:** `packages/backend/test/app-bootstrap.test.mjs`：增加 `createApp` 显式开关和直接注入未知异常的错误边界测试；已有 Origin/API 断言必须继续保留。
- **Modify:** `packages/backend/test/dev-converter-api.test.mjs`、`packages/backend/test/dev-storage-api.test.mjs`：启动子进程时显式传入 `NODE_ENV=test`，证明开发测试不会依赖宿主机默认环境。
- **Create:** `packages/backend/test/env-boundary.test.mjs`：在隔离子进程中验证合法 `development`/`test`/`production` 和非法运行模式，以及非回环 `BACKEND_HOST` 被拒绝；测试不得打印完整环境内容。
- **Modify:** `packages/backend/test/production-static-host.test.mjs`：补充生产模式 `/api/dev/*` 统一 404 和错误响应不含内部细节的断言；保留现有静态资源、SPA fallback 和 API 404 断言。

### 2.3 计划批准后允许更新的文档/任务状态

- **Modify:** `docs/04-开发任务清单-Todo-List.md`：仅在实现和验证完成后登记 T02A 证据；实现前保持“计划待批”，不得勾选完成。
- **Modify if required by governance:** `docs/00-文档索引-Index.md`：仅当文档治理脚本要求新计划在索引中出现时同步；若治理规则不要求 `.plans` 逐项索引，则不做无必要变更。
- **Create:** `.plans/phase3-t02a-production-attack-surface-error-boundary-plan.md`：本文件，仅描述实施步骤，不作为已完成安全审计证据。

## 3. 外部契约与安全决策

### 3.1 开发路由开关

- `createApp` 增加必填或等价的显式 `enableDevRoutes: boolean` 配置；安全默认值为 `false`。
- `server.ts` 只在 `config.nodeEnv === 'development' || config.nodeEnv === 'test'` 时传 `true`，生产传 `false`。
- `app.ts` 仅在开关为 `true` 时挂载四组 dev 路由；生产访问 `/api/dev`、`/api/dev/storage`、`/api/dev/converter`、`/api/dev/ai` 均由统一 API 404 返回。
- 生产 404 的外部响应使用固定中文，例如 `NOT_FOUND` / `未找到请求的接口`，不回显请求路径以外的内部信息；失败态遵循共享 `ApiError`，不返回成功态 `data`。

### 3.2 统一错误边界

- `api-error-handler.ts` 对以下类别做固定映射：
  - `entity.parse.failed` → HTTP 400、`INVALID_JSON`、`请求体不是有效的 JSON`；
  - Multer `LIMIT_FILE_SIZE` → HTTP 413、`FILE_TOO_LARGE`、`上传文件超过大小限制`；
  - 已知带安全错误码的应用错误 → 保留允许列表中的 code/message/status，并清除其他字段；
  - 其余异常 → HTTP 500、`INTERNAL_ERROR`、`服务暂时无法完成请求，请稍后重试`。
- 对未知异常只允许内部使用固定安全事件标记或无敏感关联 ID；本切片不新增持久化日志，测试中不得断言或输出原始异常文本。
- 处理器必须在响应已发送时调用 `next(error)`，避免重复写响应；否则返回统一 JSON。
- API 404 和错误中间件均应保持 `Content-Type: application/json`，并避免 Express 默认 HTML 错误页。

### 3.3 运行模式与回环边界

- `nodeEnv` 允许值固定为 `development`、`test`、`production`；缺省值保持现有开发运行兼容性，但生产启动脚本必须显式写入 `production`。
- 非法 `NODE_ENV` 在启动配置阶段以固定配置错误终止，不回显环境变量全值。
- `BACKEND_HOST` 缺省为 `127.0.0.1`；任何非精确 `127.0.0.1` 值在 `env.ts` 配置边界拒绝，包括 `0.0.0.0`、主机名和其他 IPv4/IPv6 表示。
- PowerShell wrapper 的校验继续保留，形成脚本层和 Node 核心层双重边界；不得以删除 wrapper 校验替代核心校验。

## 4. 分步实施任务

### Task 1: 锁定现有契约并写失败测试

**Files:**
- Create: `packages/backend/test/production-attack-surface-error-boundary.test.mjs`
- Create: `packages/backend/test/env-boundary.test.mjs`
- Modify: `packages/backend/test/app-bootstrap.test.mjs`
- Modify: `packages/backend/test/production-static-host.test.mjs`
- Modify: `packages/backend/test/dev-converter-api.test.mjs`
- Modify: `packages/backend/test/dev-storage-api.test.mjs`

- [ ] **Step 1: 为生产 dev API 隔离写失败测试**
  - 用唯一隔离 `APP_DATA_ROOT` 和空 AI Provider 环境启动编译后的 `dist/server.js`，设置 `NODE_ENV=production`、`BACKEND_HOST=127.0.0.1`。
  - 使用真实存在且不会调用外部服务的请求组合：GET `/api/dev/db-health`、GET `/api/dev/storage/exists?key=phase3-t02a-sentinel`、POST `/api/dev/converter/text`（不上传文件）、POST `/api/dev/ai/generate`（JSON 空对象）。生产模式下预期均为 JSON 404，响应为 `success:false`、`error.code='NOT_FOUND'`，且不返回成功态 `data`；响应不得包含 `stack`、`node_modules`、`H:\`、`/home/`、`/tmp/` 等绝对路径或 sentinel storage key。
  - 同一测试文件再以 `NODE_ENV=test` 启动一次，调用 GET `/api/dev/db-health`，预期 HTTP 200 且 `success:true`，以证明开关不是永久删除开发能力。

- [ ] **Step 2: 为错误边界写失败测试**
  - 在 `createApp` 测试中显式启用或禁用 dev 路由，不依赖默认值。
  - 发送 `Content-Type: application/json` 且 body 为 `{bad-json` 的请求到一个需要 JSON body 的现有 API，预期 HTTP 400、JSON `INVALID_JSON`。
  - 在测试文件中创建一个最小 Express 测试 app：先挂载会抛出 `Error('SECRET_INTERNAL_PATH H:\\private\\student.txt')` 的路由，再挂载导出的 `apiErrorHandler`；预期 HTTP 500、`INTERNAL_ERROR`、固定中文消息，响应文本不包含 `SECRET_INTERNAL_PATH`、`H:\\private`、`stack` 或原始异常消息。生产 `createApp` 不增加测试专用路由或后门。
  - 保留并加强 `production-static-host.test.mjs` 的 API 404 断言，验证默认 HTML 错误页不会出现。

- [ ] **Step 3: 为运行模式和回环校验写失败测试**
  - 在隔离子进程中加载 `env.ts`/编译后的配置模块：`NODE_ENV=development|test|production` 启动配置成功；`NODE_ENV=staging` 以固定配置错误退出。
  - `BACKEND_HOST=127.0.0.1` 成功；`0.0.0.0`、`localhost`、`::1` 和一个私网 IPv4 地址均失败。
  - 断言失败输出只含固定错误码/类别，不含完整环境 dump、API Key、Provider URL 或未脱敏路径。

- [ ] **Step 4: 让现有 dev API 测试显式声明 test 模式**
  - 在 `dev-converter-api.test.mjs` 与 `dev-storage-api.test.mjs` 的 `spawn` 环境中加入 `NODE_ENV: 'test'`。
  - 若其他直接启动 `dist/server.js` 的测试因 fail-closed 开关失败，只对确实需要 dev 路由的测试显式补 `NODE_ENV: 'test'`，不得把生产模式改成测试默认。

- [ ] **Step 5: 运行失败测试确认红灯**

```powershell
$env:APP_DATA_ROOT = 'H:\ai-studybuddy-tmp\runs\phase3-t02a-red-production-boundary'
pnpm -r --filter backend run build
pnpm --dir packages/backend exec node --test --test-concurrency=1 test/production-attack-surface-error-boundary.test.mjs test/env-boundary.test.mjs
```

  **Expected:** 新增断言在实现前至少因 `nodeEnv`、`enableDevRoutes` 或统一错误响应尚不存在而失败；不得用放宽断言、跳过测试或修改生产语义消除红灯。

### Task 2: 实现配置边界和显式生产模式

**Files:**
- Modify: `packages/backend/src/config/env.ts`
- Modify: `packages/backend/src/server.ts`
- Modify: `scripts/start-production.ps1`
- Test: `packages/backend/test/env-boundary.test.mjs`

- [ ] **Step 1: 在 `env.ts` 增加有限运行模式解析**
  - 定义 `NodeEnv = 'development' | 'test' | 'production'` 或等价窄类型。
  - 读取 `process.env.NODE_ENV ?? 'development'`；只接受三个值，其他值抛出固定配置错误，不把原始值拼接到错误消息中。
  - 将 `nodeEnv` 放入导出的 `config`，供 `server.ts` 唯一读取。

- [ ] **Step 2: 在 `env.ts` 增加精确回环校验**
  - 保持默认 `BACKEND_HOST='127.0.0.1'`。
  - 在导出 `config` 前拒绝非精确 `127.0.0.1`，错误使用固定 code/category；不要只依赖 PowerShell。
  - 配置测试通过隔离子进程执行，避免同一 Node 进程缓存模块导致环境变量污染。

- [ ] **Step 3: 在 `server.ts` 传递开发路由开关**
  - 将 `enableDevRoutes` 设为 `config.nodeEnv !== 'production'`，或使用显式允许列表 `config.nodeEnv === 'development' || config.nodeEnv === 'test'`。
  - 不从请求、前端参数或任意 Provider 配置推导该开关。

- [ ] **Step 4: 在 `start-production.ps1` 固定生产环境**
  - 保留 `Assert-AIStudyBuddyLoopbackHost`。
  - 在 `Start-Process` 前设置 `$env:NODE_ENV = 'production'`，确保当前 PowerShell 进程加载的运行时 env 与 Node 子进程一致。
  - 不把 env 文件原文、秘密或异常对象直接输出到终端；维持现有脱敏错误路径。

- [ ] **Step 5: 运行配置专项测试**

```powershell
$env:APP_DATA_ROOT = 'H:\ai-studybuddy-tmp\runs\phase3-t02a-config-boundary'
pnpm --dir packages/backend exec node --test --test-concurrency=1 test/env-boundary.test.mjs
```

  **Expected:** 合法运行模式和 `127.0.0.1` 通过；非法运行模式和非回环主机在配置初始化阶段失败，错误输出不含原始秘密或环境全文。

### Task 3: 实现生产 dev API 隔离

**Files:**
- Modify: `packages/backend/src/app.ts`
- Modify: `packages/backend/src/server.ts`
- Test: `packages/backend/test/production-attack-surface-error-boundary.test.mjs`
- Test: `packages/backend/test/production-static-host.test.mjs`

- [ ] **Step 1: 为 `createApp` 增加安全默认的显式选项**
  - 在 `createApp` 的 options 中增加 `enableDevRoutes: boolean`，默认路径必须关闭；若现有 TypeScript 调用点未传入，逐一更新为明确值，不用隐式环境判断。
  - 只有 `enableDevRoutes === true` 时挂载四个 dev router。

- [ ] **Step 2: 保持 dev 路由测试可用**
  - 直接构造 app 的开发测试明确传 `enableDevRoutes: true`。
  - 通过 `server.ts` 启动的测试子进程使用 `NODE_ENV=test`，由配置层传入 `true`。
  - 不在生产启动脚本或生产测试中设置开发开关。

- [ ] **Step 3: 验证生产路由面和普通 API 404**
  - 生产请求四个 dev 路由前缀均返回统一 JSON 404。
  - 非 dev 的 `/api/health`、现有业务路由和静态资源继续工作；API 404 不进入 SPA fallback。
  - 响应中不得出现内部路由模块名、文件路径或 storage key。

- [ ] **Step 4: 运行专项测试**

```powershell
$env:APP_DATA_ROOT = 'H:\ai-studybuddy-tmp\runs\phase3-t02a-production-dev-routes'
pnpm --dir packages/backend exec node --test --test-concurrency=1 test/production-attack-surface-error-boundary.test.mjs test/production-static-host.test.mjs test/dev-converter-api.test.mjs test/dev-storage-api.test.mjs
```

  **Expected:** 生产 dev API 全部 404 且 JSON；`NODE_ENV=test` 的 converter/storage 既有 roundtrip 和边界测试继续通过。

### Task 4: 实现统一 JSON 错误边界

**Files:**
- Create: `packages/backend/src/middleware/api-error-handler.ts`
- Modify: `packages/backend/src/app.ts`
- Modify: `packages/backend/test/app-bootstrap.test.mjs`
- Modify: `packages/backend/test/production-attack-surface-error-boundary.test.mjs`

- [ ] **Step 1: 定义安全错误类型和固定外部映射**
  - 允许列表至少包含 `NOT_FOUND`、`INVALID_JSON`、`FILE_TOO_LARGE`、`BAD_REQUEST`、`INTERNAL_ERROR`。
  - 每个 code 对应固定 HTTP status 和固定中文 message；未知 code 降级为 `INTERNAL_ERROR`。
  - 输出对象只构造 `success:false`、`error:{code,message}`，不得展开原始错误对象。

- [ ] **Step 2: 处理解析错误、Multer 错误和未知异常**
  - 识别 Express JSON `entity.parse.failed`，返回 400。
  - 识别 Multer `LIMIT_FILE_SIZE`，返回 413；其他上传错误返回安全的 `BAD_REQUEST` 或 `INTERNAL_ERROR`，不返回 `err.message`。
  - 未知异常固定返回 500；若响应已发送则调用 `next(error)`，不得再次写 body。

- [ ] **Step 3: 在 app 中注册最终错误边界**
  - API 404 使用同一安全响应构造器。
  - 将 error middleware 放在所有 API、静态资源和 SPA fallback 注册之后，确保异常不会落入 Express HTML 默认错误页。
  - 对非 API 静态资源错误不泄露文件系统路径；保持现有前端 fallback 行为。

- [ ] **Step 4: 运行错误边界专项测试**

```powershell
$env:APP_DATA_ROOT = 'H:\ai-studybuddy-tmp\runs\phase3-t02a-error-boundary'
pnpm --dir packages/backend exec node --test --test-concurrency=1 test/app-bootstrap.test.mjs test/production-attack-surface-error-boundary.test.mjs test/production-static-host.test.mjs
```

  **Expected:** 畸形 JSON 为脱敏 JSON 400；未知异常为固定中文 JSON 500；所有断言确认响应不含 `stack`、本机路径、storage key、原始异常文本或秘密。

### Task 5: 回归、文档和独立审查

**Files:**
- Modify: `docs/04-开发任务清单-Todo-List.md`
- Modify if required: `docs/00-文档索引-Index.md`
- Test: all files changed above

- [ ] **Step 1: 检查生产启动脚本证据**
  - 在仓库外临时隔离目录执行脚本的静态/单元级检查，确认 Node 子进程环境收到 `NODE_ENV=production`、`BACKEND_HOST=127.0.0.1`，且不执行用户电脑安装验收。
  - 不连接真实 Provider、SMTP、飞书或 ASR。

- [ ] **Step 2: 运行专项和全量验证**

```powershell
$env:APP_DATA_ROOT = 'H:\ai-studybuddy-tmp\runs\phase3-t02a-final'
pnpm type-check
pnpm -r --filter backend run build
pnpm --dir packages/backend exec node --test --test-concurrency=1 test/production-attack-surface-error-boundary.test.mjs test/env-boundary.test.mjs test/app-bootstrap.test.mjs test/production-static-host.test.mjs test/dev-converter-api.test.mjs test/dev-storage-api.test.mjs
pnpm -r --filter @ai-studybuddy/frontend run build
pnpm test
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
```

  **Expected:** type-check、后端/前端构建、专项测试、全量测试、文档治理和 diff 检查均 exit code 0；所有运行数据只落在仓库外隔离目录。

- [ ] **Step 3: 独立审查安全负面断言**
  - 搜索本次差异中是否出现 `process.env` 全量输出、`err.stack`、`err.message` 外部回显、绝对盘符、生产 dev route 挂载、未显式 `NODE_ENV` 的生产启动路径。
  - 对生产模式请求四个 dev 路由、畸形 JSON和未知异常各执行一次人工响应检查；确认失败态仅含 `success:false` 与固定中文 `error`、无栈/路径/秘密。
  - 确认测试没有调用真实外部服务或使用正式数据。

- [ ] **Step 4: 更新 docs/04 为完成或阻塞事实**
  - 只有实现、专项测试、全量验证和独立审查全部通过，才将 T02A 登记为已完成，并写明分支、提交哈希、验证结果和未完成的用户电脑验收门禁。
  - 若任一 P0/P1 未修复，保持 T02A 为未完成并登记准确阻塞原因；不得把分支完成写成 `master` 或 `origin/master` 完成。

- [ ] **Step 5: 提交并交付**

```powershell
git status --short --branch
git diff --check
git add packages/backend/src/app.ts packages/backend/src/config/env.ts packages/backend/src/server.ts packages/backend/src/middleware/api-error-handler.ts scripts/start-production.ps1 packages/backend/test/production-attack-surface-error-boundary.test.mjs packages/backend/test/env-boundary.test.mjs packages/backend/test/app-bootstrap.test.mjs packages/backend/test/production-static-host.test.mjs packages/backend/test/dev-converter-api.test.mjs packages/backend/test/dev-storage-api.test.mjs docs/04-开发任务清单-Todo-List.md
git diff --cached --check
git commit -m "fix(phase3): 收紧生产攻击面与统一错误边界"
```

  **Expected:** 仅纳入批准范围内的源码、测试和文档；提交成功后仍需按仓库规则 rebase/fast-forward 合回 `master` 并重新验证，未合回前不得报告主线完成。

## 5. 风险分级与完成门槛

- **P0：** 发现生产 dev API 可调用、秘密/学生真实资料/正式数据泄露、非回环监听可达或错误边界泄露可直接利用的内部信息时，立即停止普通上线流程并先隔离、清理、轮换和复验。
- **P1：** 本切片目标风险，包括生产 dev 路由暴露、无统一 JSON 错误边界、畸形 JSON/上传异常落入 HTML 或回显内部信息、生产模式不显式固定、后端核心不拒绝非回环监听。
- **P2：** 后续切片的子进程环境 allowlist、日志治理、路径/备份/ACL、核心流程失败矩阵等，不在 T02A 结束时冒充完成。
- **P3：** 文档示例、错误码扩展说明、维护性重构建议。

T02A 只有同时满足以下条件，才可报告“该切片实施完成”：

1. 生产模式四组 dev API 均不可用并返回统一 JSON 404；开发/测试模式既有 dev API 测试通过。
2. 畸形 JSON、Multer 文件限制和未知异常均返回与共享 `ApiError` 一致的 `{ success:false, error:{code,message} }`，不泄露栈、路径、秘密、storage key 或原始异常。
3. `NODE_ENV` 合法值受控，生产启动脚本显式设置 `production`。
4. `BACKEND_HOST` 在后端核心配置层拒绝所有非 `127.0.0.1` 值，PowerShell wrapper 校验仍保留。
5. type-check、构建、专项测试、全量测试、文档治理和 diff 检查全部有可复现证据。
6. `docs/04` 明确区分 T02A 分支事实与 `master`/`origin/master` 集成事实；用户电脑安装验收仍保持未完成。

## 6. 验证命令基线

本计划批准后，所有会写运行数据的命令都必须先设置新的仓库外隔离 `APP_DATA_ROOT`。以下路径是首次完整回归的确定性隔离目录；后续重复执行必须使用新的唯一目录。T02A 最低命令集：

```powershell
$env:APP_DATA_ROOT = 'H:\ai-studybuddy-tmp\runs\phase3-t02a-final-20260725-01'
pnpm type-check
pnpm -r --filter backend run build
pnpm -r --filter @ai-studybuddy/frontend run build
pnpm test
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
git status --short --branch
```

后续重复执行时不得复用已有运行目录。纯计划创建阶段只运行文档治理、`git diff --check`、计划占位符扫描和 Git 状态检查，不运行会写运行数据的业务测试或真实外部服务。

## 7. 独立自审结论

- **范围完整性：通过。** 本计划覆盖生产 dev API 隔离、统一 JSON 错误边界、显式生产模式和后端回环校验；后续 T02 切片边界已明确列出。
- **TDD 可执行性：通过。** 每个 P1 目标都有失败测试、最小实现、专项回归和全量验证步骤；测试文件和启动环境均已指定。
- **隐私/秘密边界：通过。** 计划不要求读取、打印或持久化真实 Key、Provider URL、学生资料、课堂录音、正式运行数据或完整秘密环境。
- **兼容性：通过。** 开发/测试 dev API 通过显式 `NODE_ENV` 保留；生产默认 fail-closed；既有 Origin、健康检查、静态资源和 SPA fallback 纳入回归。
- **治理边界：通过。** 未授权完整 S7、G2、S3 Worker、Docker/WSL、Firewall、用户电脑验收或业务产品扩张；未把计划创建写成安全审计完成。
- **状态结论：** 本文件只是 T02A 实施计划，**等待用户明确批准；批准前不得实施安全修复**。

## 8. 后续批准动作

请批准或退回本 T02A 计划。只有收到明确批准后，才可在本 worktree 中按 Task 1→Task 5 实施；批准 T02A 也只授权本计划范围内的源码、测试和文档变更，不自动授权 T02 的其他切片。
# PHASE3-T02C 配置加载与环境错误脱敏实施计划

> **任务**：PHASE3-T02C：配置加载、`.env`/运行环境解析与配置校验错误脱敏
> **状态**：已推送 `origin/master`；任务分支 `codex/phase3-t02c-env-error-redaction` 的实现提交 `3a0b6bf` 已安全 fast-forward 集成到主线。不创建未来 PRD，不执行真实外部服务。
> **基线**：`origin/master` `6507dd3`，已包含 PHASE3-T02A `7f976a0` 与 PHASE3-T02B `eeb9cb1`。

## 1. Summary

T02C 只收口配置加载和配置校验失败时的秘密回显边界：非法 `.env` 行、Provider URL/API Key、`AI_PROVIDERS` 原文、SMTP、Webhook、`APP_DATA_ROOT`、绝对路径、完整宿主环境、stack 或 raw parser message 都不得进入外部错误、测试输出、日志摘要或文档证据。

本计划不重复 T02A/T02B：

- T02A 已处理生产 `/api/dev*` 隔离、统一 JSON API 错误边界、显式 `NODE_ENV=production` 和后端核心回环校验。
- T02B 已处理 OCR 与 whisper.cpp 子进程环境 allowlist，以及 OCR 子进程输出脱敏。
- T02C 仅处理配置文件/环境变量加载、解析、校验失败的错误契约和测试证明。

## 2. Scope

### 2.1 允许的后续实现范围

- 后端配置集中读取：`packages/backend/src/config/env.ts`。
- 配置中心输入校验与测试连接失败的安全错误契约：`packages/backend/src/routes/config-routes.ts`、配置 registry/connection tester 的相关测试，前提是不调用真实外部服务。
- Windows 部署/检查脚本中 `.env` 导入与安装检查的错误呈现：`scripts/lib/AIStudyBuddy.Deployment.psm1`、`scripts/check-installation.ps1`。仅收口错误信息，不扩大安装流程。
- 新增或调整专门测试，例如：
  - `packages/backend/test/env-error-redaction.test.mjs`
  - `packages/backend/test/config-validation-redaction.test.mjs`
  - `packages/backend/test/deployment-env-redaction.test.mjs`

### 2.2 明确非范围

- 不处理日志轮转、日志保留、备份/ACL、生产防火墙、Docker/WSL、完整 S7、G2、S3 Worker、用户电脑验收、打包输出目录递归删除保护。
- 不执行真实 OCR、真实 whisper.cpp、Provider、SMTP、Webhook 或其他真实外部服务。
- 不修改产品 API、前端交互、数据库 Schema、Worker 或部署包结构。
- 不回退、不重做 T02A/T02B。

## 3. 安全错误契约

### 3.1 允许对外暴露的信息

配置加载失败时只允许暴露以下信息：

- 固定错误码，例如 `CONFIG_LOAD_FAILED`、`CONFIG_ENV_INVALID`、`CONFIG_SECRET_REDACTED`。
- 固定中文提示，例如 `配置加载失败，请检查配置项格式`。
- 配置键名，例如 `NODE_ENV`、`BACKEND_HOST`、`AI_PROVIDERS`、`SMTP_HOST`、`FEISHU_WEBHOOK_URL`。
- 配置类别，例如 `runtime`、`provider`、`smtp`、`webhook`、`data-root`。
- 非值型上下文，例如 `lineNumber` 或 `sourceKind`，前提是不包含原始行、绝对路径或变量值。

### 3.2 禁止暴露的信息

任何 thrown error、stderr/stdout、日志摘要、测试输出、公开 API 错误或文档证据中均不得包含：

- API Key、token、SMTP auth code、Webhook URL、Provider base URL。
- `AI_PROVIDERS` 原始 JSON 字符串或解析失败片段。
- `APP_DATA_ROOT` 的真实值、任何正式数据目录、绝对盘符路径或用户目录。
- 非法 `.env` 原始行、重复键的原始值、空 key 行内容。
- 完整宿主 `process.env`、PowerShell `$env:*` dump、`{ ...process.env }` dump。
- stack、raw parser message、底层异常 `.message` 原文、`err.stack` 或 `err.toString()`。

### 3.3 错误矩阵

| 场景                        | 允许输出                                      | 禁止输出                            | 建议错误码                    |
| --------------------------- | --------------------------------------------- | ----------------------------------- | ----------------------------- |
| `.env` 非法行               | 固定提示、`lineNumber`、`sourceKind=env-file` | 原始行内容、路径、变量值            | `CONFIG_ENV_LINE_INVALID`     |
| `.env` 重复键               | 固定提示、键名                                | 两次赋值内容、文件路径              | `CONFIG_ENV_DUPLICATE_KEY`    |
| `.env` 空 key / 非法 key    | 固定提示、`lineNumber`                        | 原始行内容                          | `CONFIG_ENV_KEY_INVALID`      |
| `NODE_ENV` 非法             | 键名、允许值类别、固定提示                    | 非法值                              | `CONFIG_NODE_ENV_INVALID`     |
| `BACKEND_HOST` 非法         | 键名、固定提示                                | 实际 host 值                        | `CONFIG_BACKEND_HOST_INVALID` |
| `APP_DATA_ROOT` 缺失/不可写 | 键名、类别、固定提示                          | 真实路径、底层 IO 错误原文          | `CONFIG_DATA_ROOT_INVALID`    |
| `AI_PROVIDERS` JSON 非法    | 键名、类别、固定提示                          | 原始 JSON、URL、key、parser message | `CONFIG_AI_PROVIDERS_INVALID` |
| Provider 字段非法           | provider index、字段名、固定提示              | `baseUrl`、`apiKey`、模型外秘密值   | `CONFIG_PROVIDER_INVALID`     |
| SMTP 配置非法               | 字段名、类别、固定提示                        | host/user/auth code/to 原值         | `CONFIG_SMTP_INVALID`         |
| Webhook 配置非法            | 字段名、类别、固定提示                        | URL 原文                            | `CONFIG_WEBHOOK_INVALID`      |

原则：启动期或脚本期错误可以带“变量名/类别/行号”，但不能带“变量值/原始行/路径/底层异常”。运行期公开 API 错误保持 T02A 的安全 JSON 契约，只给固定错误码和固定中文提示。

## 4. 实施步骤（待用户批准后）

1. **先写失败测试**
   - 构造合成 `.env` 文件，包含非法行、重复键、空 key、非法 `NODE_ENV`、非法 `BACKEND_HOST`、合成 Provider/SMTP/Webhook 哨兵值。
   - 捕获 thrown error、子进程 stdout/stderr、公开 API 响应和测试内日志摘要。
   - 断言只出现允许的错误码、变量名、类别或行号；断言所有哨兵值和原始行均不存在。

2. **统一后端配置错误类型**
   - 在 `env.ts` 或相邻配置模块中引入小型安全错误结构，例如 `{ code, message, key?, category?, lineNumber? }`。
   - 任何配置解析失败都先映射到安全错误，再抛出或返回。
   - 禁止把 `resolvedRoot`、底层 IO error、JSON parser message 或配置值拼进异常消息。

3. **收口 `.env` 导入脚本错误**
   - `Import-AIStudyBuddyEnvFile` 后续不得 `throw "Invalid env line: $line"`。
   - `Assert-AIStudyBuddyLoopbackHost` 后续不得输出实际 host 值。
   - `check-installation.ps1` 后续不得把 `Exception.Message` 中的原始值直接作为检查详情；应转换为固定摘要。

4. **收口 Provider/SMTP/Webhook 校验失败**
   - 配置中心已有 DTO/校验错误继续只返回固定错误码。
   - 测试连接的失败摘要继续使用固定 sanitized code/message，新增回归证明候选值不泄露。
   - 不调用真实 Provider/SMTP/Webhook，只用 fake adapter 或注入 seam。

5. **文档与状态更新**
   - 实施完成前，`docs/04` 只能写“计划已创建/等待批准”或“任务分支实施中”。
   - 只有任务分支实现、复验、独立审查、主线集成和推送完成后，才能把 T02C 写为完成。

## 5. 测试计划

### 5.1 Windows/Node 24 基线

后续实施验证必须在 Windows 原生 Node 24 上执行，先断言主版本：

```powershell
if ((node -p "process.versions.node.split('.')[0]") -ne '24') { throw 'Node 24 is required' }
```

所有会写运行数据的命令必须使用新的仓库外隔离根，例如：

```powershell
$env:APP_DATA_ROOT = 'H:\ai-studybuddy-tmp\runs\phase3-t02c-verify-20260726-01'
$env:NODE_ENV = 'test'
$env:AI_PROVIDERS = ''
$env:AI_API_KEY = ''
$env:AI_BASE_URL = ''
$env:AI_MODEL = ''
$env:SMTP_HOST = ''
$env:SMTP_USER = ''
$env:SMTP_AUTH_CODE = ''
$env:SMTP_TO = ''
$env:FEISHU_WEBHOOK_URL = ''
```

### 5.2 必须新增的负向证明

- 非法 `.env` 行不会回显原始行内容。
- `AI_PROVIDERS` 中的合成 Provider URL/API Key 不会出现在 thrown error、stdout、stderr、日志摘要或公开 API 错误中。
- SMTP host/user/auth code/to 的合成哨兵不会出现在任何错误输出中。
- Webhook URL 合成哨兵不会出现在任何错误输出中。
- `APP_DATA_ROOT` 合成绝对路径不会出现在公开错误或脚本检查详情中。
- `NODE_ENV` 和 `BACKEND_HOST` 非法值不被回显；只允许出现键名。
- 测试不 dump `process.env`，不使用 `{ ...process.env }` 作为断言失败输出，不打印完整配置对象。

### 5.3 建议验证命令

```powershell
$env:APP_DATA_ROOT = 'H:\ai-studybuddy-tmp\runs\phase3-t02c-verify-20260726-01'
$env:NODE_ENV = 'test'
$env:AI_PROVIDERS = ''
$env:AI_API_KEY = ''
$env:AI_BASE_URL = ''
$env:AI_MODEL = ''
$env:SMTP_HOST = ''
$env:SMTP_USER = ''
$env:SMTP_AUTH_CODE = ''
$env:SMTP_TO = ''
$env:FEISHU_WEBHOOK_URL = ''

if ((node -p "process.versions.node.split('.')[0]") -ne '24') { throw 'Node 24 is required' }

pnpm -r --filter backend run build
pnpm --dir packages/backend exec node --test --test-concurrency=1 test/env-error-redaction.test.mjs test/config-validation-redaction.test.mjs test/deployment-env-redaction.test.mjs
pnpm type-check
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
```

可在专项通过后补充完整回归：

```powershell
$env:APP_DATA_ROOT = 'H:\ai-studybuddy-tmp\runs\phase3-t02c-pnpm-test-20260726-01'
$env:NODE_ENV = 'test'
$env:AI_PROVIDERS = ''
$env:AI_API_KEY = ''
$env:AI_BASE_URL = ''
$env:AI_MODEL = ''
$env:SMTP_HOST = ''
$env:SMTP_USER = ''
$env:SMTP_AUTH_CODE = ''
$env:SMTP_TO = ''
$env:FEISHU_WEBHOOK_URL = ''

pnpm test
```

## 6. 独立审查清单

实施后必须由独立审查者逐项核对：

- 差异中没有秘密值拼接、raw env 行回显、`process.env` dump、`$env:*` dump、`err.stack` 或 `err.message` 外部回显。
- 差异中没有把 `{ ...process.env }` 用作测试输出、日志输出或配置错误详情；如子进程测试必须继承环境，只能用于启动隔离进程，不能打印。
- `.env` 解析失败只输出固定错误码、键名、类别、行号；不输出文件路径、原始行或变量值。
- Provider/SMTP/Webhook 测试使用无效合成哨兵，且断言所有哨兵值不出现在 thrown error、stdout、stderr、日志摘要和公开 API 错误中。
- `APP_DATA_ROOT` 只作为隔离根输入，不出现在公开错误或检查详情中。
- 未调用真实 OCR、whisper.cpp、Provider、SMTP、Webhook 或网络服务。
- 文档没有把 T02C、T02、Phase 3、安全审计、生产上线或用户电脑验收提前标记完成。

## 7. 计划阶段审查结论

- **范围完整性：通过。** 计划覆盖 `.env` 非法行、运行模式、回环 host、Provider、SMTP、Webhook、数据根和脚本导入错误的脱敏边界。
- **与既有切片边界：通过。** 计划不重复 T02A 的 API 错误边界和生产 dev API 隔离，也不重复 T02B 的 OCR/whisper.cpp 子进程环境 allowlist。
- **测试可证明性：通过。** 计划要求用合成哨兵证明“不泄露值”，并覆盖 thrown error、stdout、stderr、日志摘要和公开 API 错误。
- **隐私边界：通过。** 计划不要求读取、打印或调用真实 Provider、SMTP、Webhook、OCR、whisper.cpp、正式数据或完整宿主环境。
- **状态结论：** 计划阶段审查通过；随后用户已单独批准实施。该计划阶段结论本身不等于 T02C 主线完成、T02、Phase 3、安全审计、生产上线或用户电脑验收完成。

## 8. 实施与独立审查结论

### 8.1 已实施内容

- `packages/backend/src/config/env.ts`：新增 `.env.local` 预校验，非法行、空 key、重复键只返回固定 `[CONFIG]` 错误码、键名与非值型行号；配置错误对象不携带 stack；`APP_DATA_ROOT` 创建/可写失败不拼接路径或底层异常；非法 `AI_PROVIDERS` 不回显原始 JSON、Provider URL 或 API Key。
- `scripts/lib/AIStudyBuddy.Deployment.psm1`：`Import-AIStudyBuddyEnvFile` 对非法 env 行和重复键返回固定摘要；`Assert-AIStudyBuddyLoopbackHost` 不回显非法 `BACKEND_HOST` 值。
- `scripts/check-installation.ps1`：配置加载、回环 host、数据根、前端静态根与 Python 运行时检查的摘要不再打印配置路径或变量值。
- `packages/backend/test/env-error-redaction.test.mjs`、`packages/backend/test/config-validation-redaction.test.mjs`：使用无效合成哨兵覆盖 `.env.local`、PowerShell env 导入、`APP_DATA_ROOT`、`NODE_ENV`/`BACKEND_HOST`、`AI_PROVIDERS`、Provider/SMTP/Webhook 校验与连接失败摘要的“不泄露值”证明。

### 8.2 复验证据

- 先新增负向测试并运行，确认旧实现可被测试捕获：T02C 专项初始红灯，PowerShell env 行、非法 host 和数据根错误存在回显/stack 风险。
- Windows 原生 Node 24 + 仓库外隔离根（文档证据不记录具体路径）：后端 build 通过；`test/env-error-redaction.test.mjs` 与 `test/config-validation-redaction.test.mjs` 共 7/7 通过。
- 仓库外隔离根（文档证据不记录具体路径）：相邻回归 `test/env-boundary.test.mjs`、`test/config-api.test.mjs`、`test/connection-tester.test.mjs`、`test/production-attack-surface-error-boundary.test.mjs`、`test/subprocess-environment-boundary.test.mjs`、`test/deployment-powershell-compatibility.test.mjs` 共 40/40 通过。

### 8.3 独立审查结论

- **allow/deny 契约核对：通过。** 错误输出仅允许固定错误码、固定提示、配置键名、类别与非值型行号；未引入 Provider URL、API Key、SMTP、Webhook、`APP_DATA_ROOT` 值、绝对路径、完整宿主环境、raw parser message 或 stack 的外部回显。
- **测试可证明性核对：通过。** 新增测试使用无效合成哨兵，并断言 thrown error、stdout、stderr、测试输出和公开 API JSON 响应中均不含哨兵值；测试没有 dump `process.env` 或完整配置对象。
- **边界核对：通过。** 未重复 T02A 的生产 dev API/统一 API 错误边界，未重复 T02B 的 OCR/whisper.cpp 子进程环境 allowlist；未调用真实 OCR、whisper.cpp、Provider、SMTP、Webhook 或网络服务。
- **状态核对：通过。** 实现提交 `3a0b6bf` 已安全 fast-forward 集成到主线，主线复验与文档状态提交均已推送 `origin/master`。不得宣称 T02、Phase 3、安全审计、生产上线或用户电脑验收完成。

### 8.4 主线复验与远端推送状态

- 在新的仓库外隔离数据根、Windows 原生 Node 24 与清空的外部服务配置下完成主线复验；未读取、打印、调用或验证真实 Provider、SMTP、Webhook、OCR 或 whisper.cpp 配置。
- 后端 build、T02C 专项 7/7、相邻 T02A/T02B 边界回归 40/40（共 47/47）、`pnpm type-check`、前端测试、文档治理和 `git diff --check` 均通过。
- 当前状态为“已推送 `origin/master`”；主线集成、主线复验与文档状态登记均已进入远端主线。

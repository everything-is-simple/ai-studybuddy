# PHASE3-T02B 子进程环境最小化实施计划

> **任务**：PHASE3-T02B：OCR 与 whisper.cpp 子进程环境继承边界
> **状态**：用户已于 2026-07-26 明确批准实施；任务分支实现、独立审查、本机 `master` fast-forward 集成与主线复验已完成，尚未推送 `origin/master`。
> **任务分支**：`codex/phase3-t02b-subprocess-environment-boundary`
> **基线**：`origin/master` `7f976a0`。

## 1. 目标与范围

将 OCR Python worker 和本机 whisper.cpp CLI 的 `spawn` 环境改为正向 allowlist，防止无关子进程继承 AI Provider、SMTP、Webhook、`APP_DATA_ROOT` 或完整宿主环境。OCR 非零退出和无效输出不得回显子进程 stdout/stderr。

本切片不改 API、DTO、Schema、Worker、前端、部署脚本或本机产品范围；不处理日志轮转、备份/ACL、Firewall、Docker/WSL、完整 S7、G2、S3 Worker、用户电脑验收或真实外部服务。

## 2. 环境契约

| 子进程 | 允许环境 |
| --- | --- |
| OCR | `SYSTEMROOT`、`WINDIR`（宿主存在时）、受控 `TEMP`/`TMP`、`OCR_CACHE_ROOT`、`XDG_CACHE_HOME`；仅 `PYTHON_PATH` 为非绝对命令时复制规范化 `PATH`、`PATHEXT`。 |
| whisper.cpp | `SYSTEMROOT`、`WINDIR`（宿主存在时）及请求目录的 `TEMP`/`TMP`。CLI 和模型仍只通过显式参数传递，不复制 `PATH`、`PATHEXT` 或 Python 变量。 |

- Windows 环境键按不区分大小写读取，向子进程统一输出大写键名；不产生 `Path`/`PATH` 双键。
- `PYTHONPATH`、`PYTHONHOME`、`APP_DATA_ROOT`、`NODE_ENV`、`AI_*`、`SMTP_*`、`FEISHU_WEBHOOK_URL` 及其他未允许宿主变量一律不传递。
- OCR 临时目录和缓存、whisper 请求临时目录继续只从 `paths.ts` 的 `APP_DATA_ROOT` 派生路径获得；子进程不读取完整数据根变量。

## 3. 实现与测试

1. `packages/backend/src/config/env.ts` 提供大小写安全的 allowlist 构造器：`getOcrWorkerEnvironment` 接收 `requiresPathLookup`；`getWhisperCppEnvironment` 只生成 OS 与请求临时目录变量。
2. `packages/backend/src/adapters/converter.ts` 按 `path.isAbsolute(PYTHON_PATH)` 决定是否允许查找路径，并以固定安全错误替代子进程 stdout/stderr 回显。
3. `packages/backend/src/adapters/aural/whispercpp-aural-converter.ts` 在 `spawn` 显式传入 allowlist；构造函数第二参数仅作为测试用 spawn 注入点，默认行为仍使用 Node `spawn`。
4. 新增 `packages/backend/test/subprocess-environment-boundary.test.mjs`，用绝对 Node 假 OCR worker 和注入的假 whisper spawn 验证：精确 spawn 环境、无 API Key/Provider URL/SMTP/Webhook/`APP_DATA_ROOT`/Python 宿主变量、无完整宿主哨兵，以及失败时不暴露 stderr。
5. Windows Node 24 专项测试不调用 Python OCR、whisper.cpp、Provider、SMTP、Webhook 或网络服务。Node 假 worker 由 Windows 运行时附加的系统键不作为父环境继承；传给 `spawn` 的环境对象仍以精确 allowlist 断言。

## 4. 验证与独立审查

每次运行使用新的仓库外 `APP_DATA_ROOT`，清空测试进程的外部服务配置，并按顺序执行：后端 build、专项 Node test、type-check、前端 build、全量 `pnpm test`、文档治理和 `git diff --check`。

独立审查必须确认：两个目标 `spawn` 都显式传环境；差异中不存在 `{ ...process.env }`、环境 dump、stderr/stdout 回显或真实秘密；allowlist 与 Windows 大小写兼容；测试不打印环境值，且只使用合成哨兵和隔离目录。

## 5. 独立审查结论

2026-07-26 独立审查结论：通过，限任务分支范围内有效。

- 范围核对：差异仅覆盖 OCR 与 whisper.cpp 子进程环境构造、OCR 子进程错误回显收敛、测试注入 seam、专项回归测试及文档登记；未创建未来 PRD，未改 HTTP/DTO/Schema/前端/数据库/Worker/部署脚本，未执行真实 OCR、whisper.cpp、Provider、SMTP、Webhook 或网络服务。
- Allowlist 核对：`getOcrWorkerEnvironment` 与 `getWhisperCppEnvironment` 均采用正向构造，不再使用 `{ ...process.env }`。Windows 父环境按大小写不敏感读取，输出统一大写键；OCR 仅在 `PYTHON_PATH` 非绝对命令时允许 `PATH`/`PATHEXT`，whisper.cpp 永不复制 `PATH`、`PATHEXT`、`PYTHONPATH` 或完整宿主环境。
- 数据根隔离核对：OCR 与 whisper.cpp 只接收由 `APP_DATA_ROOT` 派生出的受控 `TEMP`/`TMP`/缓存或请求临时目录，不向子进程传递 `APP_DATA_ROOT` 本身。
- 错误边界核对：OCR 非零退出、启动失败和 JSON 解析失败均返回固定安全错误，不拼接 stdout/stderr；whisper.cpp 继续丢弃 stderr 并返回既有固定错误。
- 测试核对：`packages/backend/test/subprocess-environment-boundary.test.mjs` 使用合成哨兵、绝对 Node 假 OCR worker 与注入式 whisper fake spawn，验证无 API Key、Provider URL、SMTP、Webhook、`APP_DATA_ROOT`、Python 宿主变量、宿主哨兵或完整宿主环境；失败断言只比较布尔值、键名和固定错误码，不打印环境值或秘密值。

验证记录（均使用 Windows 原生 Node 24，外部服务配置清空，`APP_DATA_ROOT` 指向 `H:\ai-studybuddy-tmp\runs\...` 仓库外隔离根）：

- `pnpm --dir packages/backend run build`：通过（`phase3-t02b-backend-build-20260726-03`）。
- 后端 49 个 `test/*.test.mjs` 按 8 批分拆运行：全部通过，累计覆盖 272 个后端测试；T02B 专项 5/5 通过（`phase3-t02b-backend-batch01` 至 `batch08`）。
- `pnpm --dir packages/frontend run test`：通过，26 个文件 / 139 个测试；仅既有 React Router future flag/路由测试警告（`phase3-t02b-frontend-test-20260726-01`）。
- `pnpm type-check`：通过（`phase3-t02b-type-check-20260726-02`）。
- `powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1`：通过。
- `git diff --check`：通过。
- 本机 `master` 主线复验：`eeb9cb1` 已 fast-forward 集成到 `H:\ai-studybuddy` 的 `master`；使用 `H:\ai-studybuddy-tmp\runs\phase3-t02b-master-verify-20260726-01` 与 `H:\ai-studybuddy-tmp\runs\phase3-t02b-master-pnpm-test-20260726-01` 清空外部服务配置后验证通过：后端 build、T02B/OCR 专项 7/7、`pnpm type-check`、前端 Vitest 26 files / 139 tests、文档治理、`git diff --check` 和完整 `pnpm test`（后端 272/272）均通过；前端 build 仅既有 KaTeX chunk warning。

结论：T02B 已完成任务分支实现、独立审查、本机 `master` 集成与主线复验；尚未推送 `origin/master`，不得宣称远端主线、T02、Phase 3、安全审计、生产上线或用户电脑验收已完成。

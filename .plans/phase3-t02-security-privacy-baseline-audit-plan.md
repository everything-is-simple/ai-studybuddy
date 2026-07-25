# PHASE3-T02 安全与隐私基线审计实施计划

> **任务**：PHASE3-T02：安全与隐私基线审计计划
> **状态**：计划已创建，等待用户明确批准；业务实现、安全修复和新增测试均未开始。
> **计划分支**：`codex/phase3-t02-security-privacy-baseline-audit-plan`
> **基线**：2026-07-25 的最新 `origin/master`（创建 worktree 时为 `a0ba36e`）。

## 1. 当前事实确认

1. S1–S6 简版、Phase 2 S5 T01–T06、POST-PHASE2、S7-MVP、Windows 原生 + Node 24 开发机部署基线已经进入 `origin/master`。
2. S7-MVP 只覆盖受控 PCM WAV、本机同步 `whisper.cpp`、可编辑文本和用户显式保存到 S2；不代表完整 S7、实时录音、说话人分离、外部 ASR 或 G2 主线完成。
3. 用户电脑安装运行尚未在目标机器验收，不得宣称“用户电脑可安装、可运行”。
4. Phase 3 当前只启动治理/计划阶段，尚未批准安全修复、业务实现或产品范围扩张。
5. 当前产品边界仍是本机单用户学习系统、回环地址访问、无公网入口、无家长登录和无家长 Web 面板。是否增加认证/鉴权必须先基于该威胁模型判断，不能机械套用公网多用户系统方案。
6. 本计划来自只读代码、脚本和文档审计；未读取真实 API Key、Provider URL、学生资料、课堂录音、正式数据库或正式日志，未运行 Provider、SMTP、飞书、ASR 网络试验，也未执行用户电脑安装。
7. **计划创建完成不等于 Phase 3 安全审计完成，更不等于安全修复、上线验收或用户机验收完成。**

## 2. 审计目标

面向上线前建立可验证的最小安全与隐私基线，覆盖：

- 本机/回环网络边界与可达攻击面；
- API 输入、统一响应、异常脱敏与学生可理解的中文失败反馈；
- 配置秘密、DPAPI 存储、环境文件、子进程环境和外部渠道配置边界；
- SQLite、上传、正文、备份、日志、临时文件、模型和运行目录边界；
- S6 聚合脱敏报告与 S7 本地音频/转写/S2 显式保存边界；
- Windows 原生 Node 24 的 bootstrap/check/start/health/stop/package/backup/restore 脚本安全边界；
- 能够阻断上线的风险分级、修复切片、回归证据和剩余风险签收。

## 3. 审计范围

### A. 配置与秘密

- `.env.example`、`deployment/.env.production.example`、`env.ts`、配置注册表、配置中心 API、DPAPI 当前用户加密文件和原子激活流程。
- AI Provider、SMTP、飞书、本地 ASR、OCR、本地路径和超时配置的读取、传递、错误输出与测试接口。
- 仓库和部署包的秘密扫描：私钥、token、Webhook、凭据文件、非示例 URL、学生真实数据和正式运行数据。
- Node/Python/whisper.cpp 子进程的环境变量最小化，禁止无目的继承完整父进程秘密集合。

### B. 数据与文件边界

- `APP_DATA_ROOT`、全局/学期 SQLite、uploads、normalized texts、parent report archive、backups、logs、tmp、models、config。
- 所有服务端文件路径的规范化、目录逃逸防护、允许读写类型和生命周期。
- 备份 manifest、恢复目标、recovery point、完整性检查、打包输出目录和递归删除保护。
- 业务源码不得硬编码本机盘符；前端不得直接读取 SQLite、本地文件目录、Provider 配置或秘密文件。

### C. API、浏览器与错误反馈

- API 统一 `{ success, data, error }`；畸形 JSON、multer、404、未知异常也必须保持 JSON 契约。
- 生产环境不得无条件暴露开发/诊断/上传下载删除/Provider smoke 路由。
- 领域错误和未知错误分层：外部只返回固定错误码与可理解中文信息，内部诊断不得包含栈、绝对路径、storage key、CLI 输出、Provider 原始响应或秘密。
- Origin/CORS、CSRF/XSS、本机无 Origin 请求、静态资源与 SPA fallback 的威胁模型检查。
- practice/mock exam 草稿等浏览器存储的最小字段、保留期、退出/提交清理和 XSS 影响。

### D. 日志与隐私

- 禁止记录 API Key、token、Webhook、Provider URL、学生资料原文、答案正文、课堂音频、完整 UUID、正式运行数据和外部服务原始响应。
- stdout/stderr、启动错误、Worker/Adapter 错误、投递失败摘要的脱敏、分级、轮转、保留期和清理策略。
- S6 只能投递聚合摘要；冻结快照使用结构化允许字段，不能只依赖关键词或 UUID 黑名单。
- S7 只处理用户明确确认的受控 WAV；临时文件在 `APP_DATA_ROOT` 下按请求隔离并可靠清理；转写仅在显式操作后保存到 S2。

### E. 部署与本机运行

- 后端核心配置与部署脚本双层强制回环监听，禁止仅依赖 wrapper。
- 生产启动显式设置生产环境，避免 Express 默认开发错误页面或堆栈行为。
- bootstrap/check/start/health/stop/package/backup/restore 不提升到不必要权限，不修改永久 Firewall profile、规则、组策略、注册表或安全策略。
- 部署包不得包含 `.git`、依赖缓存、秘密、数据库、日志、tmp、模型或测试证据；任何递归删除必须先验证目标属于明确受控输出根。
- 配置、数据、日志、备份目录继承/实际 ACL、当前用户可写范围和其他本机用户可读范围须形成验收证据。

## 4. 明确非范围

- 不在本计划阶段修代码、改 Schema、增 API、增 Worker、改前端或新增测试。
- 不执行真实 AI Provider、QQ SMTP、飞书、ASR 网络试验，不读取或保存真实配置值。
- 不启动 Docker/WSL，不修改 Firewall、组策略、注册表或永久安全策略。
- 不执行用户电脑安装，不宣称用户电脑已经可安装或可运行。
- 不处理完整 S7、G2/外部 ASR 主线、实时录音、说话人分离或 S3 Worker。
- 不扩展为公网、多用户、家长登录或家长 Web 面板。
- 不用 `git reset --hard`、`git clean`、覆盖 checkout 或未批准删除处理任何脏状态。

## 5. 风险分级标准

| 等级 | 定义 | 处置门禁 |
| ---- | ---- | -------- |
| P0 | 会泄露秘密、学生真实资料或正式运行数据，或会直接破坏本机安全/数据边界 | 立即停止上线；单独建立应急任务，先隔离和保全证据，再修复与复验 |
| P1 | 上线前必须修复的攻击面、错误反馈、路径、权限、部署或日志风险 | 不得带风险进入上线候选；必须有自动化回归与 Windows 原生部署复验 |
| P2 | 可在明确剩余风险并获批准后上线后排期的治理问题 | 记录责任人、缓解措施、触发条件和截止点；不得静默遗留 |
| P3 | 文档、一致性或可维护性建议 | 纳入维护队列，不能误写为安全缺陷已修复 |

## 6. 本次只读审计发现

### 6.1 当前未确认 P0

- 启发式仓库扫描未发现明显真实私钥或 Bearer token；示例环境文件的秘密字段为空。
- 该结论不等于正式秘密扫描通过。后续实施必须使用明确规则的 secret scanner，并对命中项只记录文件、规则和脱敏指纹，不输出值。

### 6.2 P1 候选：上线前必须处理

1. **生产攻击面未隔离**：`packages/backend/src/app.ts` 无条件挂载 `/api/dev`、`/api/dev/storage`、`/api/dev/converter`、`/api/dev/ai`。这些路由包含数据库/存储检查、文件上传下载删除、转换器和 AI smoke；生产包使用同一应用入口，当前未见生产禁用条件。
2. **未知异常缺少统一 JSON 脱敏边界**：应用有 API 404，但没有最终 Express error middleware。畸形 JSON、multer `next(error)` 等可能绕过统一 `{ success, data, error }`，并受 Express 运行环境影响返回 HTML 或开发诊断信息。
3. **开发 API 直接回传底层错误**：多个 dev 路由把 `error.message`/`String(error)` 返回客户端，可能包含绝对路径、storage key、CLI/转换器或 Provider 底层信息。
4. **生产环境未显式固定**：`start-production.ps1` 未设置 `NODE_ENV=production`，生产环境模板也未声明该变量。即使补全全局错误处理中间件，也应显式固定生产行为。
5. **回环限制只在部署 wrapper 强制**：PowerShell 启动流程会拒绝非 `127.0.0.1`，但 `env.ts`/后端核心入口只读取 `BACKEND_HOST`，直接启动后端可绕开脚本保护。
6. **子进程继承完整父环境**：OCR 环境以 `{ ...process.env }` 构造；whisper.cpp `spawn` 未提供最小环境，默认同样继承父进程。AI、SMTP、飞书等秘密可能被无关本地子进程继承。
7. **环境文件格式错误会回显整行**：`Import-AIStudyBuddyEnvFile` 的非法格式异常包含原始整行；误写的秘密可能进入终端或启动日志。
8. **OCR 内部错误包含子进程输出**：OCR 非零退出和 JSON 解析错误会拼接 stderr 或 stdout 片段。即使当前主要被业务层包裹，也必须统一限定内部日志与外部错误的字段和长度。
9. **部署打包递归删除缺少目标保护**：`build-deployment-package.ps1` 对调用方提供的任意 `OutputRoot` 执行递归删除，未先验证目标属于受控打包根；这属于本机数据破坏边界风险。
10. **日志上线边界未闭环**：生产脚本把 stdout/stderr 写入固定文件，尚未见轮转、最大大小、保留期和安全清理；启动诊断还会输出路径。上线前至少要完成秘密/原文/路径分级与最小保留规则。

### 6.3 P2 候选：需记录剩余风险与排期

1. practice/mock exam 使用 `sessionStorage` 保存学生答案、部分会话/结果 DTO；需明确最小字段、提交/退出清理、保留期和 XSS 后果。S7 转写文本当前未发现写入浏览器持久存储。
2. S6 已通过 `toFrozenBlock` 收敛为聚合字段并进行 HTML escaping，但最终 `assertSnapshotIsSafe` 只检查完整 UUID；后续应以严格 schema/允许字段和数据分类测试补强，而不是依赖单一正则黑名单。
3. DPAPI 当前用户加密和原子激活已存在，但 config/data/log/backups 主要依赖 `%LOCALAPPDATA%` 继承 ACL；需在目标 Windows 环境形成只读 ACL 检查证据。
4. 数据备份只选择全局数据库与 semesters 数据并排除 config/tmp/backups，属于正向控制；但 manifest 包含源数据根路径，跨机器分享备份时可能泄露本机目录信息，应评估是否必要并脱敏。
5. 本机 Origin 策略只允许回环 HTTP Origin，但无 Origin 的本机请求仍可进入 API。需要按“单用户本机应用、同机其他进程不受浏览器同源策略约束”的威胁模型决定是否增加本地会话令牌或其他轻量保护，不能直接套用公网认证设计。

### 6.4 P3 候选：文档与可维护性

1. 少量服务直接从 `APP_DATA_ROOT` 拼接路径，未完全经 `paths.ts` 统一入口；当前未确认路径逃逸，但应统一治理以减少未来差异。
2. `docs/01`、`docs/09` 的个别 Phase 3/S7 状态措辞与 `docs/04` 最新主线事实轻微漂移，应单独做最小文档对齐，不在安全修复中扩大范围。

### 6.5 已确认的正向控制

- 配置中心不提供读取完整秘密的 API；现有 DPAPI 当前用户加密、原子激活和固定脱敏错误码应保留。
- API Origin 配置拒绝通配符、凭据化 URL、非 HTTP、非回环主机和无端口来源。
- 前端未发现直接读取 SQLite、本地数据目录或 Provider/SMTP/飞书秘密配置。
- 未发现 `dangerouslySetInnerHTML`、`rehype-raw` 等明显不受控 HTML 注入入口；现有 Markdown/Markmap 安全约束应纳入回归。
- S6 当前以聚合指标构造报告、对 HTML 进行 escaping，并拒绝冻结快照中的完整 UUID。
- S7 当前验证 WAV 格式/大小，按请求创建 `APP_DATA_ROOT` 内临时目录并在 `finally` 清理；whisper.cpp stderr 不返回前端，错误信息为固定中文；保存到 S2 需要显式操作。
- Windows 生产脚本已强制 `127.0.0.1` 并检查实际监听地址，未新增 Firewall、组策略、注册表或永久安全策略；家长报告计划任务使用当前用户和 Limited 权限。
- 主要业务 API 已普遍使用领域错误和固定中文未知错误；后续重点是补齐全局异常、畸形请求和学生核心流程的系统化回归矩阵，而不是把所有现有反馈判为不安全。

## 7. 后续实施切片建议

每个切片都必须另建/细化实施任务、先写失败测试、获用户明确批准后再编码。发现 P0 时中止以下普通队列。

### Slice 0：P0 应急门禁（条件触发）

- 只要正式 secret scan、运行数据抽查或路径检查确认 P0，立即停止上线候选。
- 先隔离暴露面、撤销/轮换秘密、保全脱敏证据，再建立独立修复与影响范围验证任务。

### Slice 1：生产攻击面与统一错误边界（首个建议实施切片）

**候选文件**：`packages/backend/src/app.ts`、dev 路由装配、错误中间件、生产启动环境、相关 API 集成测试。

- 生产模式不注册 dev 路由；开发模式必须显式开启且保持回环。
- 增加最终 JSON error middleware，覆盖畸形 JSON、multer、未知异常和静态/API 边界。
- 外部错误固定错误码与中文消息；内部日志只记录脱敏分类和关联 ID。
- 在后端配置层拒绝非 loopback host；启动脚本显式设置 `NODE_ENV=production`。
- 验证生产包中 dev API 为 404/禁用，错误响应无栈、绝对路径、秘密或底层输出。

### Slice 2：秘密传递与子进程最小权限

**候选文件**：`env.ts`、OCR/ASR Adapter、部署 env parser、配置/Adapter 测试。

- 为 OCR、whisper.cpp 和其他外部进程建立环境 allowlist，只传运行所需键。
- 环境文件解析错误只报告行号与安全错误码，不回显原始行。
- OCR/ASR/Provider 内部错误分离为安全外部错误与限长脱敏诊断。
- 建立仓库/部署包 secret scan，并验证不会读取或打印命中值。

### Slice 3：部署脚本、目录、ACL 与日志

**候选文件**：package/bootstrap/check/start/health/stop/backup/restore 脚本、部署规范与专项测试。

- 所有递归删除/覆盖先解析绝对路径并验证位于明确受控根；拒绝卷根、用户目录、仓库根、安装根和数据根。
- 校验 config/data/logs/backups/tmp/models 的 ACL、用途、备份/打包排除和生命周期。
- 定义日志等级、禁止字段、轮转、最大大小、保留期和安全删除；避免把绝对路径作为常规输出。
- 使用仓库外隔离目录完成 Windows 原生 Node 24 部署回归，不执行用户电脑验收。

### Slice 4：学生核心流程失败反馈矩阵

- 覆盖 S1 课表/任务、S2 资料/笔记、S3 练习、S4 错题、S5 模考/速背/冲刺、S7 本地转写与保存到 S2。
- 每条核心路径至少验证：输入错误、资源不存在、未配置、超时/下游失败、未知异常和重试建议。
- 前端只展示固定中文、可操作信息；不展示栈、路径、UUID、storage key、Provider 原始错误或学生资料正文。

### Slice 5：P2/P3 治理

- 规范浏览器草稿的最小字段和清理时机。
- 将 S6 快照安全约束升级为 schema/允许字段与数据分类测试。
- 收敛 `paths.ts` 使用、备份 manifest 路径信息和文档状态漂移。
- 记录剩余风险、责任边界和上线后排期，不与 P1 修复混为一次大改。

## 8. 实施验收标准

安全基线实施只有同时满足以下条件，才可报告“Phase 3-T02 安全与隐私基线审计及批准范围修复完成”；单独创建本计划不得使用该表述：

1. P0 为 0；若曾发现 P0，已完成隔离、轮换/清理、影响范围验证和独立复验。
2. 全部 P1 已修复并有自动化回归；生产模式不暴露 dev API，未知异常统一返回脱敏 JSON。
3. 后端核心与部署脚本均拒绝非回环监听，生产环境显式固定。
4. 子进程只接收 allowlist 环境；错误、日志和 env parser 不回显秘密、资料、完整 UUID、绝对路径或底层输出。
5. 递归删除、恢复和打包路径均有受控根保护；备份/部署包不包含 config 秘密、日志、tmp、模型、正式数据或测试证据。
6. S6 保持聚合脱敏，S7 保持本机受控 WAV、临时清理和显式保存到 S2。
7. 学生核心流程失败反馈矩阵通过，中文信息可理解且不泄露内部细节。
8. Windows 原生 Node 24 开发机部署回归通过；用户电脑验收仍作为独立门禁如实保留。
9. `docs/04`、测试计划、部署指南与实际证据一致；分支完成不能写成 master/origin 完成。

## 9. 后续验证命令

具体实施时，所有会写运行数据的命令必须先设置新的仓库外隔离 `APP_DATA_ROOT`。最低验证集：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
pnpm type-check
pnpm -r --filter backend run build
pnpm -r --filter @ai-studybuddy/frontend run build
pnpm test
```

按切片增加：

- 生产 dev API 禁用、畸形 JSON、multer、未知异常、Origin 与无泄露错误集成测试；
- 子进程环境 allowlist、日志脱敏和 secret scanner 测试；
- 打包/恢复路径逃逸与危险删除拒绝测试；
- Windows 原生 bootstrap/check/start/health/stop/package/backup/restore 隔离 smoke；
- 学生核心流程失败反馈浏览器验收。

本轮纯计划任务只运行文档治理、`git diff --check` 和 Git 状态检查，不运行会写数据的业务测试或真实外部服务试验。

## 10. 独立自审结论

- 范围与非范围分离：通过。计划没有授权安全修复、用户机安装、完整 S7、G2、Worker、Docker/WSL 或网络试验。
- 风险分级：通过。当前未确认 P0；P1/P2/P3 均给出证据边界和后续处置，不把候选风险写成已修复事实。
- 隐私边界：通过。计划不包含真实秘密值、Provider URL、学生资料、录音、正式数据库/日志内容或完整 UUID。
- 上线事实：通过。保留“开发机基线已验证、用户电脑未验收”的明确区分。
- 状态表述：通过。**计划创建完成仅表示实施方案待批，不表示 Phase 3 安全审计、安全修复或上线验收完成。**
- 建议审批顺序：批准后先执行 Slice 1；如正式 secret scan 发现 P0，则自动切换 Slice 0 并停止普通上线流程。

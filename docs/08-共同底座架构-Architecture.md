# AI StudyBuddy 共同底座架构 Architecture

**版本**：v1.14
**日期**：2026-07-17
**状态**：Phase 0.7/0.8 已完成；Phase 1-T02 已补齐 AI Provider Router 的实例级健康熔断、冷却恢复与脱敏日志；Phase 1-T03A/T03B/T03C/T03D 已完成 S3 练习 Schema、生成/提交批改 API 与前端闭环；Phase 1-T04/T04A/T04B 已完成 S4 PRD、错题归档与错题改错前端；Phase 1-T05 已完成回流规则；Phase 1-T06 已创建 S6 家长观察 PRD，T06A 已生成脱敏规则报告，T06B 已实现 QQ SMTP/飞书渠道投递、冻结快照、失败隔离、去重重试与一次性计划任务 runner；Phase 1-T07 已扩展 S1 时间线查询并在考试工作台展示当前课程近期活动；下一门禁为 T08 本机配置中心与连接验收的独立计划、审查和用户明确批准，T08 尚未实现
**原则**：孩子本机优先、按需运行、数据本地、父母异步接收脱敏报告；只定义当前产品需要的共同底座。

---

## 一、默认产品路径

```text
孩子在 Windows 本机浏览器使用 Express localhost
  → 日历确定学期教学日期，上传课程表并确认识别预览
  → 全局索引库定位当前 / FOLLOW_UP 学期业务库
  → 每学期 SQLite 保存课程实例、考试尝试、任务、事件和报告证据
  → 本地文件目录保存资料（只存 storage_key）
  → SQLite jobs 串行调 RapidOCR / AI；AI 不可用则保留待质检
  → Windows 任务计划在 22:30 独立运行 report.js
  → QQ SMTP 邮件 + 飞书卡片主动发送给父母
```

系统不做家用主机、隧道、公网入口、远程登录、家长 Web 面板或 Docker/WSL2 常驻。Express 仅监听 `127.0.0.1`；父母不是系统登录用户。

## 二、最小组件与目录边界

| 能力       | 当前默认组件                                                                   | 必须遵守的边界                                                                                |
| ---------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 本地 Web   | Express                                                                        | 只监听 `127.0.0.1`；孩子从本机浏览器使用                                                      |
| 数据库     | `GlobalCatalogDatabase` + `SemesterDatabase`（均为 SQLite + `better-sqlite3`） | 全局库只存索引与配置；每学期一库，WAL、单 Node 写进程、关闭后备份                             |
| 文件       | Node `fs` + `StorageAdapter`                                                   | 业务数据只存 `storage_key`，按学期/课程实例隔离，拒绝路径逃逸                                 |
| 持久化任务 | SQLite `jobs` + 单进程 Worker                                                  | 串行领取、有限重试、过期 running 恢复；任务归属到学期库                                       |
| OCR        | RapidOCR Python 子进程                                                         | stdin/参数只传文件路径；stdout 仅 JSON；用完退出；失败可转入分级 fallback                     |
| AI         | `AiProviderRouter` + `OpenAiProvider` + 后续 `QualityGateService`              | 按 priority 首个成功返回；连续失败 5 次冷却 10 分钟，冷却期间跳过并保持 fallback                 |
| 报告       | `ReportService`                                                                | 基于确定性证据聚合 INFO/SIGNAL/TREND；不读取资料正文、答案或聊天内容                          |
| 邮件       | `nodemailer` + QQ SMTP                                                         | HTML 正式报告；密钥仅在 `.env.local`                                                          |
| 飞书       | 自定义机器人 Webhook                                                           | 完整脱敏报告卡片；不暴露完整 URL                                                              |
| 调度       | Windows Task Scheduler                                                         | 独立 `report.js`；不启动 OCR 或学习 Web 服务                                                  |

主系统位于 `I:\ai-studybuddy`；最小验证位于外部 `I:\ai-studybuddy-composer\windows-native`。后者不加入 workspace，不能被 `packages/` import。数据根目录通过 `APP_DATA_ROOT` 配置，开发机建议 `I:\ai-studybuddy-data`，成品可使用 `%LOCALAPPDATA%\AIStudyBuddy`。

Phase 0.5 的 PostgreSQL/pgvector、MinIO、Redis/BullMQ 和 Docker/WSL2 结论仅保留为历史能力；它们不属于当前单机成品默认依赖。

### 2.1 AI Provider Router 已实现边界（0.8-T05 + Phase 1-T02）

- 配置优先读取 `AI_PROVIDERS` JSON 数组；每项包含 `name`、`baseUrl`、`apiKey`、`model`、`priority`，按 `priority` 升序尝试。
- `AI_PROVIDERS` 为空时，才使用 `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL` 的 legacy 单 Provider 兼容配置；两种配置均不可用时返回 `AI_NOT_CONFIGURED`。
- `OpenAiProvider` 只承载 OpenAI-compatible chat completion 调用与统一 `AiResponse` 转换；Router 负责失败记录、fallback 标记与全部失败的 `AI_ALL_PROVIDERS_FAILED`。
- `POST /api/dev/ai/generate` 仅用于开发验证，成功返回 `ApiSuccess<AiResponse>`；未配置返回 503，全部 Provider 失败返回 502。正式业务 API 后续通过 Service/Job 调用 Router，不直接依赖具体 Provider。
- AI 日志只记录 `taskType`、Provider、model、token、耗时、fallback 与失败摘要；不得记录 API Key、输入全文、输出全文或学生隐私正文。
- 每个 `AiProviderRouter` 实例以 Provider 实例为键维护 `consecutiveFailures` 与 `cooldownUntil`；不同 Provider 和不同 Router 不共享健康状态，也不新增数据库或环境变量。
- 同一 Provider 连续失败第 5 次后进入固定 10 分钟冷却；冷却期间不调用该 Provider，以 `AI_PROVIDER_COOLDOWN` 进入尝试摘要，并继续按既有优先级尝试后续 Provider。
- 冷却到期后的首次调用是恢复探测：成功清零并恢复正常优先级，失败立即开启新的 10 分钟冷却。
- 本次仍有真实调用但全部失败时保持 `AI_ALL_PROVIDERS_FAILED`；全部 Provider 均被冷却跳过且没有外部调用时返回 `AI_ALL_PROVIDERS_COOLING_DOWN`，只包含 Provider 名称和最早恢复时间。
- 熔断事件固定为 `AI_PROVIDER_CIRCUIT_OPENED` / `AI_PROVIDER_CIRCUIT_CLOSED`，字段白名单只允许 Provider 名称和冷却时间，不接收原始 Error、Key、URL、输入/输出正文或完整 UUID。

## 三、数据、任务与报告

### 3.1 存储拓扑与最小数据模型

```text
APP_DATA_ROOT/
  studybuddy.db                         # 全局索引与配置，不承载学期业务明细
  semesters/<semester-id>/semester.db   # 一个学期一个业务 SQLite
  semesters/<semester-id>/files/...     # 原始资料、导出等，通过 storage_key 引用
  tmp/<semester-id>/<course-id>/<job-id>/ # 可随时清空的处理缓存
  backups/...                           # 关闭或归档前后的可恢复备份
```

| 位置 / 对象             | 用途                                                                              | 关键规则                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `studybuddy.db`         | 全局设置、孩子档案、报告目标、学期目录、数据库版本、备份/恢复记录、少量跨学期摘要 | 小而稳定；不写入资料、笔记或单学期高频事件                                                        |
| `semesters`（全局索引） | 学期名称、教学开始/结束日期、状态、业务库相对路径                                 | 状态：`active / teaching_ended / follow_up / archived`；允许一个 active 与若干 follow_up 同时存在 |
| `semester.db`           | 本学期课程实例、课表、考试尝试、任务、资料索引、知识模块、事件、jobs、报告证据    | 课程通过 `course_instance_id` 隔离；不同学期不共享事务或文件空间                                  |
| `course_instances`      | 某学期的一次具体修读                                                              | 重修新建实例，`retake_of_course_instance_id` 指向原实例；补考不新建课程                           |
| `assessment_attempts`   | 正常考试、补考或其他一次考试尝试                                                  | 保存日期、来源、识别置信度、孩子确认状态和变更历史；只有 `confirmed` 能触发倒计时/提醒            |
| `knowledge_modules`     | 可考知识模块                                                                      | 必须回链资料和来源证据；连接任务、练习、错题后续能力                                              |
| `study_tasks`           | 学习任务                                                                          | 可关联考试尝试/知识模块；有截止、预计/实际时长及闭合状态                                          |
| `study_events`          | 时间线和报告证据                                                                  | 记录事件摘要、来源、证据引用、确认、质量门和特例元数据；不存隐私全文                              |
| `materials`             | 文件索引                                                                          | 只保存 `storage_key`，不保存绝对路径，不把附件作为 SQLite BLOB                                    |
| `jobs`                  | 持久化后台任务                                                                    | `pending/running/completed/failed` 和重试；可建立 `pending_quality_check` 业务状态                |
| `report_deliveries`     | 报告渠道去重                                                                      | 唯一键 `report_key + channel`，按渠道独立重试                                                     |

Phase 0.8 只按 S1/S2 闭环创建必要共同对象。Phase 1-T03A 已在 S3 门禁满足后创建 `questions`、`practice_sessions`、`practice_answers`；Phase 1-T04A 已在 S4 门禁满足后创建 `mistakes`、`mistake_evidence`、`weak_points`。`mock_attempts` 等 S5-S7 详细业务表仍要等各子系统触发并完成轻量 PRD 后才创建。

### 3.2 共同对象流与职责

```text
Semester → CourseInstance → AssessmentAttempt / Material → KnowledgeModule → StudyTask → StudyEvent
KnowledgeModule → Question → PracticeSession / PracticeAnswer → Mistake → WeakPoint → 下一轮 StudyTask
AssessmentAttempt + StudyTask + StudyEvent → ParentReport（脱敏聚合）
```

- `AssessmentAttempt` 是孩子本机的学习组织对象，不是家长 Web 面板、远程登录入口或外部日历同步功能；来源、置信度、确认和变更必须可追溯。
- 补考只在原 `course_instance` 下新增考试尝试；重修只在新学期新增课程实例并链接原实例。课程表不能被“补考”概念污染，除非学校确有重复的固定补课时间。
- `KnowledgeModule` 必须能回链到资料和证据；AI 笔记正文不能直接充当知识模块。
- `StudyEvent` 必须区分机器候选与孩子确认：至少包括 `source`、`evidence_ref`、`source_confidence`、`child_confirmation`、`quality_gate`、`exception_status`、`parent_visibility`。AI 不能把推断原因写成事实。
- 报告服务只能消费考试临近状态、任务/事件、练习/错题的脱敏聚合值与证据窗口；不读取资料、笔记、答案或错题正文。

### 3.3 Job 状态与 AI 质量门

```text
pending → running → completed
pending → running → pending  （可重试）
pending → running → failed   （达到 max_attempts）

学习项：doing → pending_quality_check → done
质量结论：required_fix | suggestion | uncertain | passed | overridden
```

Worker 启动时将超时的 `running` Job 恢复为 `pending`。单进程串行执行 OCR、AI 与报告 Job，避免孩子 16GB 机器的内存竞争。

- `required_fix`：仅用于客观可核验的关键错误、缺失答案或关键条件错误；修正前该学习项不能以“质量通过”完成；
- `suggestion`：改善建议，不阻塞完成；
- `uncertain`：OCR 模糊、开放题、多解题等情形，要求孩子核对，AI 不作最终裁决；
- `overridden`：孩子已核对并覆盖；保留原 AI 结论、证据、覆盖原因和时间；
- Provider 全部不可用：创建或保留 `pending_quality_check`，允许孩子继续其他学习，恢复后再处理。

### 3.4 报告、合并、去重与异常升级

- 每天 22:30 生成 `report:<yyyy-mm-dd>`；周日增加周报区块，月末增加月报区块；确认考试前 7、3、1 天增加提醒区块；同日只发送一个合并批次；
- 日报是稳定、短小、非评价性的 **INFO**，描述当日准备、完成、待质检或求助等事实；
- 周报是 **SIGNAL**：仅在与“早准备、及时完成、AI 保质量”相悖的模式重复出现时，输出证据、个人基线、孩子确认的特例和置信度；
- 月报是 **TREND**：使用更长观察窗，只有样本足够且特例已排除后才给出趋势判断或行动建议；
- AI 只能提出异常候选与可核对证据；孩子确认的合理特例保留在报告事实中，但不计入负面趋势；未解释、重复且明显偏离个人基线的模式才可升级；
- `report_deliveries` 以 `report_key + channel` 去重；邮件成功、飞书失败时只重试飞书；正常重复执行、到期租约恢复和重试复用同一冻结快照，已标记 `sent` 的渠道不再重复投递；同一渠道对同一批次跨 runner、进程和重启累计最多自动尝试三次，达到上限后保留脱敏留档等待人工处置；
- 外部 SMTP/飞书投递为至少一次语义，不承诺跨外部系统 exactly-once：若外部已成功而本机尚未来得及写入 `sent` 即进程中断，恢复后可能重复投递相同的脱敏快照；
- Windows 关机或休眠错过时，在下次登录尽快补发最近错过周期；
- 双渠道均失败时，保存本地 HTML 报告和投递错误摘要，供维护者手工重发；
- 报告只含脱敏课程、任务状态、学习时长、趋势和确认考试提醒；不含资料原文、笔记正文、答案或聊天内容。

### 3.5 学期初始化、归档和恢复

学期初始化是“用户看来一次确认”的原子化流程，而不是跨数据库和文件系统的伪 ACID：

1. 在 `tmp/<semester-id>/onboarding-staging` 准备目录和课程表识别预览；
2. 孩子确认后，在全局索引库创建学期目录记录，并在新的 `semester.db` 事务内写入课程实例、课表与初始化事件；
3. 提交 SQLite 事务后，以原子重命名将 staging 目录变为正式学期目录，并在全局索引事务中标记 ready；
4. 任一步失败时执行补偿清理：未 ready 的索引记录、staging 目录和半成品数据库均不能在首页出现；系统保留诊断日志但不泄露资料内容。

教学结束只把状态改为 `teaching_ended`；待成绩、补考、迟交或申诉时进入 `follow_up`。所有事项完成后归档并默认只读；受控更正必须写审计事件。每次关闭、归档和受控更正前后，执行 SQLite 完整性检查与可恢复备份。单一 `semester.db` 损坏时停止该学期写入、校验并从该学期最近备份恢复，不影响其他学期。

## 四、Adapter 边界

Phase 0.8 正式实现以下 Adapter：`GlobalCatalogDatabase`、`SemesterDatabaseFactory`、`StorageAdapter`、`SemesterOnboardingService`、`JobWorker`、`PdfConverter`、`OcrConverter`、`TextConverter`、`AiProviderRouter`、`QualityGateService`、`ReportService`、`EmailSender`、`FeishuSender`。

业务代码不得直接依赖 Python 命令、绝对路径、SMTP 授权码或 Webhook URL，也不得 import `I:\ai-studybuddy-composer` 的样例。Converter 的统一输出至少包含 `ok`、`sourceType`、`text`、`warnings` 和 `error`；报告发送必须返回按渠道划分的结果，便于只重试失败渠道。

分级 fallback 的最终人工出口必须明确：PDF 文本提取 → PDF.js/页面渲染 → OCR → 视觉 Provider → 孩子手工粘贴或修正；RapidOCR → 图像预处理重试 → PaddleOCR/视觉 Provider → 孩子手工校正；AI Provider 主用 → 备选 → `pending_quality_check` → 孩子核对；报告双渠道失败 → 本地 HTML 等待手工重发。

## 五、Phase 0.7 验证状态与门槛

开发机记录：Windows 10 19045、Node 25.4.0、Python 3.10.19、约 28.92GB 可见内存。

**Phase 0.7 开发机验收已完成（2026-07-11）**。已取得全部功能性证据：SQLite WAL/事务/备份、本地文件越界保护、SQLite Job 重试恢复、RapidOCR 按需子进程、规则报告与 AI 降级、固定周期合并去重、QQ SMTP 真实送达（163 父母测试邮箱收到）、飞书 Webhook 真实送达（父母飞书群收到）、Windows Task Scheduler 临时任务真实创建/触发/清理并写入 SQLite 发送记录。

HP 实机兼容复测（Windows 11、Ryzen 5 5625U、Node 22 LTS、16GB）在设备可用后执行，目的为兼容性确认，不阻塞 Phase 0.8 产品接入。

## 六、安全与运行门槛

`.env.local`、`.venv`、`node_modules`、真实资料、输出和日志不进主仓库 Git。日志不得输出 API Key、SMTP 授权码、完整 Feishu Webhook 或学生隐私全文。

### 6.1 本机配置中心（后续 Phase 1-T08 候选）

- 配置中心服务于首次可用和日常维护，不要求后端因缺少 AI、SMTP 或飞书凭据而无法启动。
- 普通设置与秘密分离：普通设置进入全局配置；API Key、SMTP 授权码、飞书 Webhook URL 由后端保存到 Windows 当前用户可解密的加密存储。
- 浏览器只提交一次性秘密并读取 `configured`、掩码提示、最后测试时间和脱敏状态；秘密不得进入 `localStorage`、前端日志、API 响应、报告正文或 SQLite 明文表。
- 配置保存采用“内存测试成功后原子激活”；运行中的 Adapter 读取已激活的后端配置快照，不由业务代码直接读取 `process.env`。
- AI 使用最小请求测试；SMTP 同时支持连接验证和显式测试邮件；飞书发送固定测试卡片。测试载荷不得包含学生资料、笔记、题目、答案或正式报告。
- 配置状态按 AI、SMTP、飞书独立维护；一个渠道失败不得阻断其他渠道。AI 未验证时保留规则功能，渠道未验证时保留本机报告生成和归档。
- `.env.local` 保留为开发、迁移和故障恢复入口；正式配置中心不能把它作为浏览器可读写的明文后端文件。

HP 实机兼容复测目标（待机会执行，不阻塞 Phase 0.8）：Docker Desktop 与 WSL2 未运行；学习服务可用内存至少 6GB；OCR、AI、邮件或报告峰值时至少 3GB；无持续分页增长；OCR 后 Python 和报告后 Node 都退出；重复同周期不重复发送。

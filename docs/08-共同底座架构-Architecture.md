# AI StudyBuddy 共同底座架构 Architecture

**版本**：v1.4
**日期**：2026-07-10
**状态**：Phase 0.7 验证进行中；Phase 0.8 开工前架构基线
**原则**：孩子本机优先、按需运行、数据本地、父母异步接收脱敏报告；只定义当前产品需要的共同底座。

---

## 一、默认产品路径

```text
孩子在 Windows 本机浏览器使用 Express localhost
  → 创建课程 / 考试目标 / 知识模块 / 任务
  → 本地文件目录保存资料（只存 storage_key）
  → SQLite jobs 串行调 RapidOCR / AI
  → SQLite 保存业务数据、任务和 report_deliveries
  → Windows 任务计划在 22:30 独立运行 report.js
  → QQ SMTP 邮件 + 飞书卡片主动发送给父母
```

系统不做家用主机、隧道、公网入口、远程登录、家长 Web 面板或 Docker/WSL2 常驻。Express 仅监听 `127.0.0.1`；父母不是系统登录用户。

## 二、最小组件与目录边界

| 能力 | 当前默认组件 | 必须遵守的边界 |
|---|---|---|
| 本地 Web | Express | 只监听 `127.0.0.1`；孩子从本机浏览器使用 |
| 数据库 | SQLite + `better-sqlite3` | WAL、单 Node 写进程、关闭后备份 |
| 文件 | Node `fs` + `StorageAdapter` | 业务数据只存 `storage_key`，拒绝路径逃逸 |
| 持久化任务 | SQLite `jobs` + 单进程 Worker | 串行领取、有限重试、过期 running 恢复 |
| OCR | RapidOCR Python 子进程 | stdin/参数只传文件路径；stdout 仅 JSON；用完退出 |
| AI | `NoteAiProvider` | 用于笔记和可选报告润色；报告 AI 失败必须降级 |
| 报告 | `ReportService` | SQLite 确定性统计；不读取资料正文、答案或聊天内容 |
| 邮件 | `nodemailer` + QQ SMTP | HTML 正式报告；密钥仅在 `.env.local` |
| 飞书 | 自定义机器人 Webhook | 完整脱敏报告卡片；不暴露完整 URL |
| 调度 | Windows Task Scheduler | 独立 `report.js`；不启动 OCR 或学习 Web 服务 |

主系统位于 `I:\ai-studybuddy`；最小验证位于外部 `I:\ai-studybuddy-composer\windows-native`。后者不加入 workspace，不能被 `packages/` import。数据根目录通过 `APP_DATA_ROOT` 配置，开发机建议 `I:\ai-studybuddy-data`，成品可使用 `%LOCALAPPDATA%\AIStudyBuddy`。

Phase 0.5 的 PostgreSQL/pgvector、MinIO、Redis/BullMQ 和 Docker/WSL2 结论仅保留为历史能力；它们不属于当前单机成品默认依赖。

## 三、数据、任务与报告

### 3.1 最小数据模型

| 对象 | 用途 | 关键规则 |
|---|---|---|
| `courses` | 课程 | 名称等稳定课程信息；不再把一个考试日期塞入课程 |
| `exams` | 考试目标 | `course_id`、名称、`exam_at`、目标、每日可学习时间、范围摘要；驱动计划和 7/3/1 天提醒 |
| `knowledge_modules` | 可考知识模块 | `course_id`、标题、重要度、难度、考察内容、来源资料/证据、学习状态；连接资料、任务、练习和错题 |
| `study_tasks` | 学习任务 | 可关联 `exam_id`、`knowledge_module_id`；标题、状态、截止时间、预计/实际时长 |
| `study_events` | 时间线与统计 | 只记录事件摘要；供 S6 聚合 |
| `materials` | 文件索引 | 只保存 `storage_key`，不保存绝对路径 |
| `jobs` | 持久化后台任务 | `pending/running/completed/failed`、重试与错误摘要 |
| `report_deliveries` | 报告渠道去重 | 唯一键 `report_key + channel` |

Phase 0.8 只按当前 S1/S2 闭环创建 `exams`、`knowledge_modules` 等必要对象；不提前创建 S3–S7 的 `questions`、`practice_sessions`、`practice_answers`、`mistakes`、`weak_points`、`mock_attempts` 等业务表。

### 3.2 共同对象流与职责

```text
Course → Exam / Material → KnowledgeModule → StudyTask → StudyEvent
KnowledgeModule → Question → PracticeSession / PracticeAnswer → Mistake → WeakPoint → 下一轮 StudyTask
Exam + StudyTask + StudyEvent → ParentReport（脱敏聚合）
```

- `Exam` 是孩子本机的学习组织对象，不是家长 Web 面板、远程登录入口或外部日历同步功能。
- `KnowledgeModule` 必须能回链到资料和证据；AI 笔记正文不能直接充当知识模块。
- `Question` 到 `WeakPoint` 的对象只在 S3/S4 开工并完成轻量 PRD 后创建；Phase 0.8 仅保留 `KnowledgeModule` 的关联接口，防止未来复制不一致字段。
- 报告服务只能消费考试临近状态、任务/事件、练习/错题的聚合数值；不读取资料、笔记、答案或错题正文。

### 3.3 Job 状态

```text
pending → running → completed
pending → running → pending  （可重试）
pending → running → failed   （达到 max_attempts）
```

Worker 启动时将超时的 `running` Job 恢复为 `pending`。单进程串行执行 OCR、AI 与报告 Job，避免孩子 16GB 机器的内存竞争。

### 3.4 报告、合并与去重

- 每天 22:30 生成 `report:<yyyy-mm-dd>`；
- 周日增加周报区块，月末增加月报区块；考试前 7、3、1 天增加提醒区块；同日只发送一个合并批次；
- `report_deliveries` 以 `report_key + channel` 去重；邮件成功、飞书失败时只重试飞书；
- Windows 关机或休眠错过时，在下次登录尽快补发；成功渠道不重复发送；
- 报告只含课程名、任务标题、完成/逾期、学习时长、趋势和考前提醒；不含资料原文、笔记正文、答案或聊天内容。

## 四、Adapter 边界

Phase 0.8 正式实现以下 Adapter：`SqliteDatabase`、`StorageAdapter`、`JobWorker`、`PdfConverter`、`OcrConverter`、`TextConverter`、`NoteAiProvider`、`ReportService`、`EmailSender`、`FeishuSender`。

业务代码不得直接依赖 Python 命令、绝对路径、SMTP 授权码或 Webhook URL。Converter 的统一输出至少包含 `ok`、`sourceType`、`text`、`warnings` 和 `error`；报告发送必须返回按渠道划分的结果，便于只重试失败渠道。

## 五、Phase 0.7 验证状态与门槛

开发机记录：Windows 10 19045、Node 25.4.0、Python 3.10.19、约 28.92GB 可见内存。这只是兼容性证据，不能替代 Node 22 LTS 和孩子 HP Pavilion Aero（Windows 11、Ryzen 5 5625U、16GB）的最终验收；HP 设备当前不在身边，实机复测暂缓。

已取得开发机证据：SQLite WAL/事务/备份、本地文件越界保护、SQLite Job 重试恢复、RapidOCR 按需子进程、规则报告与 AI 降级、固定周期合并去重、QQ SMTP 真实送达、飞书 Webhook 真实送达、Windows Task Scheduler 临时任务真实创建/触发/清理并写入 SQLite 发送记录。

尚未通过：孩子 HP 上的 Node 22 LTS、16GB 内存门槛、进程退出与重复周期去重复测。HP 实机复测等设备在身边后再执行。未完成前 Phase 0.7 不得标记完成，Phase 0.8 不得开始产品接入。

## 六、安全与运行门槛

`.env.local`、`.venv`、`node_modules`、真实资料、输出和日志不进主仓库 Git。日志不得输出 API Key、SMTP 授权码、完整 Feishu Webhook 或学生隐私全文。

HP 最终验收要求：Docker Desktop 与 WSL2 未运行；学习服务运行时可用内存至少 6GB；OCR、AI、邮件或报告峰值时至少 3GB；无持续分页增长；OCR 后 Python 和报告后 Node 都退出。

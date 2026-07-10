# AI StudyBuddy 共同底座架构 Architecture

**版本**：v1.3
**日期**：2026-07-10
**状态**：Phase 0.7 验证中；Phase 0.8 开工前基线
**原则**：孩子本机优先、按需运行、数据本地、父母异步接收脱敏报告；只写当前要用的底座。

---

## 1. 当前默认路径

```text
孩子在 Windows 本机浏览器使用 Express localhost
  → 创建课程 / 任务 / 考试日期
  → 上传 PDF / 图片 / 文本到本地资料目录
  → SQLite Job Worker 调 RapidOCR / AI
  → SQLite 保存业务数据、任务和报告发送记录
  → Windows 任务计划在 22:30 运行独立 report.js
  → QQ 邮件 + 飞书完整报告卡片发送给父母
```

不做：家用主机、隧道、公网入口、家长远程登录、Docker/WSL2 常驻、家长 Web 看板。

## 2. 最小组件关系

| 能力 | 默认组件 | 接入边界 |
|---|---|---|
| 本地 Web | Express | 只监听 `127.0.0.1`；孩子浏览器访问 localhost |
| 数据库 | SQLite + `better-sqlite3` | WAL、单 Node 写进程、关闭后文件备份 |
| 文件 | Node `fs` + `storage_key` | `StorageAdapter` 不暴露绝对路径 |
| 任务 | SQLite `jobs` + 单进程 Worker | 串行领取、有限重试、重启恢复 |
| PDF/OCR | pdf-parse、RapidOCR Python 子进程 | 统一 `ConverterResult`；OCR 按需退出 |
| AI | `NoteAiProvider` | 默认中转 GPT/Claude；失败可返回错误或报告降级 |
| 报告 | 规则统计 + 可选 AI 润色 | AI 失败也发送规则报告 |
| 邮件 | `nodemailer` + QQ SMTP | HTML 正式报告、可选附件 |
| 飞书 | 自定义机器人 Webhook | 完整报告卡片、无需公网入口 |
| 调度 | Windows Task Scheduler | 独立 `report.js`，错过后尽快运行 |

Phase 0.5 的 PostgreSQL、MinIO、Redis/BullMQ smoke test 结论保留为历史能力，不作为当前单机成品默认依赖。

## 3. 最小数据模型

| 对象 | 用途 | 关键字段 |
|---|---|---|
| `users` | 最小学生身份 | `id`、`name`、`role`、时间戳 |
| `courses` | 课程和考试节点 | `id`、`student_id`、`name`、`exam_at` |
| `study_tasks` | 学习任务 | `id`、`course_id`、`title`、`status`、`deadline` |
| `study_events` | 学习时间线/报告统计 | `id`、`task_id`、`event_type`、`payload_json`、`created_at` |
| `materials` | 本地资料索引 | `id`、`task_id`、`storage_key`、`status` |
| `normalized_texts` | 统一纯文本 | `id`、`material_id`、`text` |
| `structured_notes` | AI 笔记 | `id`、`task_id`、`markdown`、`model` |
| `mind_maps` | 导图数据 | `id`、`note_id`、`data` |
| `jobs` | 持久化任务 | `id`、`job_type`、`status`、`payload_json`、`attempts`、`max_attempts`、时间戳、`error_summary` |
| `report_deliveries` | 报告渠道去重 | `report_key`、`channel`、`status`、`sent_at`；唯一键为 `report_key + channel` |

不提前创建 S3/S4/S5/S6/S7 的业务表；考试日期只在课程/任务正式输入触发时落表。

## 4. Job 与报告规则

Job 状态：`pending → running → completed`；可重试失败回到 `pending`；达到上限为 `failed`。过期 `running` Job 在 Worker 启动时恢复为 `pending`。

报告由 SQLite 确定性统计课程名、任务标题、完成/逾期、学习时长、趋势和考前提醒。AI 只可选润色，失败不得阻止报告发送。

- 日报：每天 22:30；
- 周报：周日 22:30；
- 月报：每月最后一天 22:30；
- 考前提醒：考试前 7/3/1 天 22:30；
- 同日重合时，邮件和飞书各发送一条合并报告；
- 电脑关机/休眠错过时，下次 Windows 登录尽快补发；成功渠道不重复发送。

报告不包含资料原文、笔记正文、答案或聊天内容。

## 5. Adapter 边界

```ts
type ConverterResult = {
  ok: boolean
  sourceType: "pdf" | "image" | "text"
  text?: string
  warnings?: string[]
  error?: string
}
```

Phase 0.8 正式需要：`SqliteDatabase`、`StorageAdapter`、`JobWorker`、`PdfConverter`、`OcrConverter`、`TextConverter`、`NoteAiProvider`、`ReportService`、`EmailSender`、`FeishuSender`。业务代码不得直接依赖 Python 命令、SMTP 细节或 Webhook URL。

## 6. Phase 0.7 / Phase 0.8 前置清单

### 6.1 Phase 0.7

1. 在 `I:\ai-studybuddy-composer\windows-native\` 独立验证 Windows 原生组件；
2. 每项填写能力卡，记录版本、命令、输入输出、耗时、内存、失败边界；
3. QQ SMTP、飞书 Webhook、Windows 任务计划和孩子 HP 16GB 实机未验证前，不标记完成；
4. 不修改 `packages/` 主系统代码。

### 6.1.1 开发机验证记录（2026-07-10）

- 开发机：Windows 10 专业版 19045、Node 25.4.0、Python 3.10.19、约 28.92GB 可见内存；这是兼容性基线，不替代 Node 22 LTS 与孩子 HP 16GB 验收。
- 已离线通过：SQLite WAL/事务/备份、本地文件越界保护、SQLite Job 重试恢复、RapidOCR 按需子进程、规则报告/AI 降级、固定周期的日报周报月报与考前提醒合并、渠道去重。
- 已真实通过：QQ SMTP 发送到父母 163 测试邮箱；飞书 Webhook 推送到父母飞书群。
- 仍为阻塞：任务计划实际创建/触发/清理/登录补发（当前会话拒绝创建任务）、HP 16GB 内存门槛。
- 因此 Phase 0.7 仍为“验证中”，不得进入 Phase 0.8 正式接入。
### 6.2 Phase 0.8

1. Phase 0.7 全部通过；
2. 用 SQLite migration/schema 创建最小表；
3. 封装本地 `StorageAdapter` 和 SQLite `JobWorker`；
4. 接入 PDF/OCR/AI 和最小报告接口；
5. 孩子通过 localhost 使用，父母只接收脱敏报告；
6. 端到端演示并验证临时目录清理不影响长期数据。

## 7. 环境变量最小清单

```env
APP_DATA_ROOT=
BACKEND_PORT=3000
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_AUTH_CODE=
SMTP_TO=
FEISHU_WEBHOOK_URL=
```

`.env.local` 不提交。日志不得记录 API Key、SMTP 授权码、完整 Webhook、学生隐私全文或完整答案。

## 8. 非目标

- 不在 Phase 0.7/0.8 使用 Docker Desktop 或 WSL2 作为成品运行依赖；
- 不提供公网访问、隧道、域名、反向代理或家长登录；
- 不在 Phase 0.7 长期安装 Windows 任务计划；
- 不在 Phase 0.8 提前开发 S3/S4/S5/S6/S7 业务表；
- 不用 AI 替代学习状态、统计、去重或任务调度规则。

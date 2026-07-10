# AI StudyBuddy 测试验收计划 Test Plan

**版本**：v1.3
**日期**：2026-07-10
**用途**：定义 Phase 0.5 历史组件结论、Phase 0.7 Windows 原生验证和 Phase 0.8 端到端验收。

---

## 1. 测试分层

| 层级 | 位置 | 目标 |
|---|---|---|
| Phase 0.5 历史 smoke test | 旧 composer 能力卡/文档记录 | 保留已验证组件事实，不作为当前默认单机栈 |
| Phase 0.7 独立 smoke test | `composer/windows-native/` | 验证 Windows 原生替代底座，不改主系统 |
| Phase 0.8 Adapter/E2E | `packages/` | 正式接入后验证真实学习路径 |
| HP 实机验收 | 孩子 HP Windows 11 | 验证 16GB 支持门槛 |

## 2. Phase 0.5 历史组件结论

PDF、RapidOCR、Markmap、Markdown/KaTeX、BullMQ/Redis、MinIO、PostgreSQL/pgvector、Relay GPT/Claude 已在 2026-07-09 独立验证。PostgreSQL、MinIO、Redis/BullMQ 不进入当前 Windows 单机成品默认栈，但历史能力卡保留。

## 3. Phase 0.7 Windows 原生 smoke test

| 编号 | 组件 | 最小输入 | 通过标准 | 结果记录 |
|---|---|---|---|---|
| 0.7-T01 | 环境基线 | Windows、Node、Python、内存状态 | Node 22 LTS；Docker/WSL2 未运行；版本记录完整 | 开发机记录：Windows 10 19045、Node 25.4.0、Python 3.10.19、约 28.92GB；Node 22/HP 待测 |
| 0.7-T02 | SQLite | `better-sqlite3` 最小 schema | WAL、CRUD、唯一约束、事务、备份恢复通过 | ✅ 开发机离线通过 |
| 0.7-T03 | 本地文件 | `storage_key` 与非隐私文件 | 写读删、越界拒绝、临时清理不删正式资料 | ✅ 开发机离线通过 |
| 0.7-T04 | SQLite Job Worker | 失败一次的 Job、过期 running Job | 串行、重试、失败终止、重启恢复通过 | ✅ 开发机离线通过 |
| 0.7-T05 | RapidOCR 子进程 | 一张非隐私图片 | JSON 输出；成功、缺文件、非零退出、超时处理；Python 退出 | ✅ 开发机离线通过；HP 峰值待测 |
| 0.7-T06 | 报告核心 | 固定事件/任务/考试日期 | 规则统计；AI 失败仍生成脱敏报告；日报周报月报合并 | ✅ 开发机离线通过；固定 2026-05-31 22:30 |
| 0.7-T07 | QQ SMTP | `.env.local` 授权码与父母收件邮箱 | UTF-8 HTML 和可选附件送达；密钥不入日志 | ✅ 真实通过：QQ SMTP accepted，163 父母测试邮箱已收到 |
| 0.7-T08 | 飞书 Webhook | `.env.local` Webhook | 完整报告卡片送达；失败不阻止邮件渠道 | ✅ 真实通过：Feishu webhook accepted，父母飞书群已收到 |
| 0.7-T09 | Windows 任务计划 | 临时任务 `AIStudyBuddy-Phase07-Smoke` | `StartWhenAvailable`、日志、退出码、清理、补发逻辑通过 | ⏸️ BLOCKED_EXTERNAL：当前会话拒绝创建任务；XML 单测通过 |
| 0.7-T10 | 整合与 HP 实机 | 固定 `2026-05-31 22:30` | 课程/任务→OCR→AI→SQLite/文件→报告→渠道去重；16GB 门槛通过 | ⏳ 离线整合/合并/去重通过；真实渠道、调度与 HP 待测 |

外部凭据缺失时，结果只能写 `BLOCKED_EXTERNAL`，不可写“通过”。

## 4. Adapter 最小验收

| Adapter | 输入 | 输出 | 通过标准 |
|---|---|---|---|
| `SqliteDatabase` | schema/migration | SQLite 文件 | WAL、事务、备份恢复 |
| `StorageAdapter` | 逻辑 `storage_key` | 文件流/元数据 | 无绝对路径和目录逃逸 |
| `JobWorker` | `jobs` 表 | 状态迁移 | 串行、重试、恢复 |
| `OcrConverter` | 文件路径/storage key | `ConverterResult` | `ok=true` 且 text 非空 |
| `NoteAiProvider` | 统一纯文本 | 结构化笔记对象 | AI 失败可诊断 |
| `ReportService` | 统计周期 | 脱敏报告 | AI 失败仍返回规则报告 |
| `EmailSender`/`FeishuSender` | 报告对象 | 渠道结果 | 单渠道失败不影响另一渠道 |

## 5. 报告与去重验收

- 日报、周报、月报和考前提醒均在 22:30 生成；
- 周日/月末/考前重合时，同一 `report:<yyyy-mm-dd>` 合并为一条报告；
- `report_deliveries` 以 `report_key + channel` 去重；
- 邮件成功、飞书失败时，仅重试飞书；
- 下次 Windows 登录补发错过周期；
- 不发送资料原文、笔记正文、答案或聊天内容。

## 6. HP 16GB 验收

孩子 HP Pavilion Aero、Windows 11、Ryzen 5 5625U、16GB 板载内存为最终支持目标。

- Docker Desktop 和 WSL2 未运行；
- 学习服务运行时系统可用内存至少 6GB；
- OCR、AI、邮件或报告峰值时系统可用内存至少 3GB；
- 无明显界面卡顿或持续分页文件增长；
- OCR 后 Python 退出；报告后 Node 退出；重复周期不重复发送。

## 7. Phase 0.8 E2E 验收

```text
创建课程/任务/考试日期
  → 上传 PDF/图片/文本到本地文件目录
  → SQLite Job Worker 转为统一纯文本
  → 中转 GPT/Claude 生成结构化笔记 + 重点 + 导图
  → 前端展示 Markdown / KaTeX / Markmap
  → 写入 StudyEvent
  → 22:30 生成脱敏家长报告
```

通过标准：至少一种资料完整跑通；笔记、重点和导图可见；`study_events` 有“资料已整理”；清理 `APP_DATA_ROOT\tmp` 不影响长期资料和笔记；报告渠道按配置发送或明确降级。

## 8. 文档与目录治理检查

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-docs-governance.ps1
git diff --check
```

`composer/windows-native/` 只放独立验证样例；`packages/` 只放通过验证后正式接入的主系统代码；真实数据、密钥、日志和 output 不进 git。

## 9. 暂不测试

- SenseVoice / FunASR 音频转写；
- FFmpeg 视频处理；
- Readability 网页解析；
- 练习生成和批改；
- 错题本；
- 期末真题解析和变题；
- 家长 Web 登录或远程看板；
- 公网隧道、域名和远程访问。

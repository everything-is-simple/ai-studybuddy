# AI StudyBuddy 测试验收计划

**版本**：v1.4
**日期**：2026-07-10
**状态**：Phase 0.5 历史证据保留；Phase 0.7 正在收口
**用途**：定义组件验证、真实渠道、Windows 调度与 HP 16GB 最终验收的证据标准。

---

## 一、测试分层与边界

| 层级 | 位置 | 目的 | 是否等于产品接入 |
|---|---|---|---|
| Phase 0.5 历史 smoke test | `I:\ai-studybuddy-composer` 历史目录 | 保留 PDF/OCR/渲染/AI/重组件能力事实 | 否 |
| Phase 0.7 独立 smoke test | `I:\ai-studybuddy-composer\windows-native` | 验证 Windows 原生轻量底座 | 否 |
| Phase 0.8 正式测试 | `I:\ai-studybuddy\packages` | 验证正式 Adapter、API 与页面 | 是 |

Phase 0.7 的 `.env.local`、`.venv`、`node_modules`、output、真实凭据、真实资料均不进入主仓库。缺少外部凭据或实机时只能写 `BLOCKED_EXTERNAL` / `待实机验收`，不得写“通过”。

## 二、Phase 0.5 历史组件结论

PDF、RapidOCR、Markmap、Markdown/KaTeX、BullMQ/Redis、MinIO、PostgreSQL/pgvector、Relay GPT/Claude 已于 2026-07-09 在独立目录验证。PostgreSQL、MinIO、Redis/BullMQ 与 Docker/WSL2 不进入当前 Windows 单机成品默认栈；它们只在未来架构重新决策后才可使用。

## 三、Phase 0.7 验收矩阵

| 编号 | 验收对象 | 通过标准 | 当前证据与状态 |
|---|---|---|---|
| 0.7-T01 | 环境基线 | Node 22 LTS、Windows、Python、内存、Docker/WSL2 状态均留档 | ⚠️ 开发机已留档：Windows 10 19045、Node 25.4.0、Python 3.10.19、约 28.92GB；Node 22 LTS 与 HP 待测 |
| 0.7-T02 | SQLite | `better-sqlite3`、WAL、CRUD、唯一约束、事务、关闭后备份恢复 | ✅ 开发机离线通过 |
| 0.7-T03 | 本地文件 | 逻辑 `storage_key`、写读删、路径逃逸拒绝、tmp 清理保护 materials | ✅ 开发机离线通过 |
| 0.7-T04 | SQLite Job Worker | 单进程串行、有限重试、上限失败、stale running 恢复、重启不丢 Job | ✅ 开发机离线通过 |
| 0.7-T05 | RapidOCR 子进程 | JSON stdout、成功/缺文件/非零退出/超时、Python 退出 | ✅ 开发机离线通过；HP 峰值与退出复测待做 |
| 0.7-T06 | 报告核心 | 规则统计、AI 失败降级、脱敏、合并与渠道去重 | ✅ 开发机离线通过；固定 `2026-05-31 22:30 Asia/Shanghai` 覆盖日报、周报、月报和考前 7 天 |
| 0.7-T07 | QQ SMTP | UTF-8 中文 HTML、可选附件、日志不泄露授权码、父母邮箱实收 | ✅ 真实通过：QQ SMTP accepted，163 父母测试邮箱已收到 |
| 0.7-T08 | 飞书 Webhook | 完整合并报告卡片、失败不阻断邮件、Webhook 不泄露、父母飞书群实收 | ✅ 真实通过：飞书 Webhook accepted，父母飞书群已收到 |
| 0.7-T09 | Windows Task Scheduler | 临时 `AIStudyBuddy-Phase07-Smoke`：XML `StartWhenAvailable`、创建、手动触发、日志、退出码、清理、补发 | ⏸️ `BLOCKED_EXTERNAL`：当前会话拒绝创建任务；XML 单测通过，但不是调度通过 |
| 0.7-T10 | 整合与 HP 实机 | 课程/任务→本地文件→OCR→AI→SQLite→报告→双渠道去重；16GB 门槛 | ⏳ 开发机离线整合、合并和去重通过；调度与 HP 实机未验收 |

## 四、报告隐私、合并与重试

- 日报、周报、月报与考试前 7/3/1 天提醒均使用 22:30；周日或月末重合时，邮件和飞书各只发送一条合并报告。
- 一个周期使用 `report:<yyyy-mm-dd>`；`report_deliveries` 使用 `report_key + channel` 唯一键。
- 邮件成功、飞书失败时，只允许重试飞书；反之亦然。
- 电脑关机或休眠错过时，下次 Windows 登录尽快补发；补发成功后不再重复。
- 报告不得发送资料原文、笔记正文、答案或聊天内容；日志不得写入授权码或完整 Webhook。

## 五、Windows 任务计划与 HP 16GB 最终门槛

在孩子 HP Pavilion Aero（Windows 11、Ryzen 5 5625U、16GB）上，以 Node 22 LTS 执行：

```powershell
cd I:\ai-studybuddy-composer\windows-native
npm ci
npm run test:all
npm run measure:memory
```

必须同时满足：Docker Desktop 和 WSL2 未运行；学习服务可用内存至少 6GB；OCR、AI、邮件或报告峰值可用内存至少 3GB；无明显卡顿或持续分页增长；OCR 后 Python 退出；报告后 Node 退出；重复同周期不重复发送。

## 六、Phase 0.8 正式 E2E 验收

只有 Phase 0.7 所有门槛通过后，才在主仓库验证：

```text
创建课程/任务/考试日期
  → 上传 PDF/图片/文本到 APP_DATA_ROOT
  → SQLite Job Worker 转为统一纯文本
  → AI 生成结构化笔记、重点、导图
  → 前端展示 Markdown / KaTeX / Markmap
  → 写入 StudyEvent
  → 22:30 生成脱敏家长报告
```

验收时还要证明：`APP_DATA_ROOT\tmp` 清理不影响长期资料和笔记；正式 Adapter 不直接依赖试炼场脚本；真实数据和密钥不在 Git 中。

## 七、文档治理检查

每轮证据回填后运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-docs-governance.ps1
git diff --check
```

Phase 0.7 完成后，再把最终选型结论和实测数据同步回 `docs/04-*`、`docs/08-*` 与本目录的能力卡。当前未完成的调度和 HP 验收不得用文档措辞掩盖。

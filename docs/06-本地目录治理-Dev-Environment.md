# AI StudyBuddy 本地目录与验证资产治理

**版本**：v1.5
**状态**：已确认
**日期**：2026-07-18
**用途**：定义主系统、外部组件试炼场、运行数据、日志、临时文件和备份的唯一边界。本文件是 Windows 单机目录治理的单一事实来源（SoT）。

---

## 一、总原则

产品默认运行在孩子的 Windows 11 电脑：Express 仅监听 `127.0.0.1`，SQLite 和学习资料保存在本机，OCR/AI/报告按需运行；父母只通过 QQ 邮件和飞书接收脱敏摘要。Docker/WSL2、家用主机、隧道、公网入口与家长远程登录均不属于当前单机成品。

目录必须按职责隔离：**源码不存真实数据，试炼场不变成主系统，运行数据不进入 Git，备份不反向污染当前 SoT。**

## 二、七个本机目录

| 路径                         | 唯一职责             | 可以放                                                | 禁止放                                                 |
| ---------------------------- | -------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| `I:\ai-studybuddy`           | 主系统 Git 仓库      | `docs/`、`packages/`、脚本、正式测试、正式 Adapter    | `.env.local`、真实学习资料、长期日志、试炼场依赖       |
| `I:\ai-studybuddy-composer`  | 外部组件试炼场       | 最小样例、非隐私 fixtures、能力卡、局部依赖、测试日志 | 正式产品代码、真实学习资料、主仓库 workspace 配置      |
| `I:\ai-studybuddy-data`      | 运行数据根目录建议值 | SQLite、`materials/`、`exports/`、受控备份            | 源码、Git 元数据、密钥明文                             |
| `I:\ai-studybuddy-day-study` | 人工学习工作区       | 用户自己创建或整理的资料副本                          | 系统唯一数据源、应用数据库                             |
| `I:\ai-studybuddy-logs`      | 运行日志汇总         | 脱敏诊断、任务状态、错误摘要                          | API Key、SMTP 授权码、完整 Webhook、资料原文、完整答案 |
| `I:\ai-studybuddy-tmp`       | 可再生临时空间       | OCR 切片、导出中间件、临时测试结果                    | SQLite 正式库、`materials/`、唯一备份                  |
| `I:\ai-studybuddy-backup`    | 只读历史备份         | 阶段 ZIP、旧稿归档、恢复说明                          | 当前 SoT 文档的直接编辑副本                            |

正式产品通过 `APP_DATA_ROOT` 指定运行数据根目录。当前开发机建议 `APP_DATA_ROOT=I:\ai-studybuddy-data`；成品安装时可改为 `%LOCALAPPDATA%\AIStudyBuddy`。业务代码不得写死盘符。

## 三、外部组件试炼场

`I:\ai-studybuddy-composer\windows-native` 是 Phase 0.7 的独立 Node/Python 验证目录，使用自己的 `package.json`、`.venv` 和 `.env.local`，不加入 `I:\ai-studybuddy\pnpm-workspace.yaml`。

每个组件样例至少包含：

```text
smoke-test/       可重复执行脚本
output/           可再生结果，必须忽略
COMPONENT-CARD.md 版本、命令、输入输出、耗时、内存、失败边界
```

严格禁止：

- 主系统 `packages/` import、执行或直接复制试炼场样例；
- 把 `.env.local`、`.venv/`、`node_modules/`、真实凭据、真实学习资料或 output 放回主仓库；
- 用“试炼场曾经跑过”替代产品代码的正式测试。

唯一接入路径：`试炼场 smoke test → 能力卡 → 04 任务状态 → 09 验收结果 → 08 Adapter 边界 → Phase 0.8 在 packages 重新实现`。

## 四、运行数据结构与清理

```text
APP_DATA_ROOT\
  studybuddy.db
  config\
    ai.active.enc / ai.prev.enc
    smtp.active.enc / smtp.prev.enc
    feishu.active.enc / feishu.prev.enc
    state.json
  semesters\<semester-id>\
    semester.db
    files\<course-id>\<generated-name>
    tmp\
    parent-reports\
  tmp\
  backups\
```

- 数据表只保存逻辑 `storage_key`，不保存绝对文件路径。
- SQLite 关闭后才能复制到 `data\backups`；恢复前保留原库的只读副本。
- `tmp` 和 `I:\ai-studybuddy-tmp` 可以清理，但清理脚本必须拒绝跨目录删除，且绝不删除 `materials`、`data` 或备份。
- 邮件附件和导出放在 `exports`；发送记录由 SQLite 的 `report_deliveries` 去重。
- `config/*.enc` 只能由创建它的 Windows 当前用户解密；`state.json` 只存状态和验证时间，不存密钥、完整 URL 或邮箱授权码。
- 测试和浏览器验收必须把 `APP_DATA_ROOT` 指向 `I:\ai-studybuddy-tmp\runs\<task-id>` 等隔离目录，不得读写正式运行目录。

## 五、密钥、日志与备份

`.env.example` 仅列变量名；`.env.local` 永不提交。日志不得记录 `AI_API_KEY`、`SMTP_AUTH_CODE`、完整 `FEISHU_WEBHOOK_URL`、资料原文、笔记正文、答案或聊天内容。

每个里程碑完成后：先对 `I:\ai-studybuddy` 做 Git 提交，再把源码与文档的阶段快照放到 `I:\ai-studybuddy-backup`；真实学习数据由家长确认后单独备份。备份只用于恢复，不得直接恢复为 `docs/` 的当前设计依据。

## 六、Phase 0.8 接入门槛

Phase 0.7 只验证，不修改主系统。SQLite、本地文件、SQLite Job Worker、RapidOCR、报告 Adapter 只有在能力卡、`docs/09-*` 实测结果、`docs/08-*` 边界和文档治理检查都齐全后，才可以在 Phase 0.8 重新实现。HP 实机兼容复测（Node 22 LTS、16GB）在设备可用后执行，不阻塞 Phase 0.8。

# AI StudyBuddy 本地目录与组件装配开发规范

**版本**：v1.3
**状态**：已确认
**日期**：2026-07-10
**用途**：定义仓库内组件试炼场、Windows 单机运行数据、日志、临时文件和备份规则。本文件是本地开发环境与目录治理的单一事实来源（SoT）。

---

## 一、运行形态

当前默认产品运行在孩子 Windows 电脑：学习服务按需启动，报告脚本由 Windows 任务计划触发，父母只接收邮件和飞书报告。Docker/WSL2、家用主机、隧道和公网入口不属于单机成品默认形态。

- 当前正式支持目标：Windows 11、Ryzen 5 5625U、16GB 内存、512GB SSD；
- 新设备推荐：32GB 内存；
- OCR、AI、报告 Worker 按需启动后退出；
- 真实数据、SMTP 授权码、Webhook 和 API Key 不进 git。

## 二、目录职责

| 路径/变量 | 职责 | 可放内容 | 不可放内容 |
|---|---|---|---|
| `I:\ai-studybuddy` | 主系统源码与文档 | `packages/`、`docs/`、正式 Adapter、Phase 0.8 代码 | 真实数据、密钥、长期日志 |
| `I:\ai-studybuddy\composer\windows-native` | Phase 0.7 组件试炼场 | 最小样例、非隐私 fixtures、smoke test、能力卡 | 主系统业务代码、真实学习资料 |
| `APP_DATA_ROOT` | 单机运行数据根目录 | SQLite、资料、导出、日志、临时文件 | 源码、git 配置 |
| `APP_DATA_ROOT\data` | 数据库目录 | `studybuddy.sqlite`、备份文件 | 原始资料 |
| `APP_DATA_ROOT\materials` | 正式学习资料 | `storage_key` 对应文件 | 临时 OCR 切片 |
| `APP_DATA_ROOT\tmp` | 可清理临时目录 | OCR/导出临时文件 | 长期数据 |
| `APP_DATA_ROOT\exports` | 报告附件和导出 | HTML/PDF 摘要 | API Key |
| `APP_DATA_ROOT\logs` | 运行日志 | 脱敏诊断、任务状态 | 密钥、资料原文、完整答案 |

推荐默认值：`APP_DATA_ROOT=%LOCALAPPDATA%\AIStudyBuddy`。代码只能读取环境变量或安装器配置，不能写死盘符。

## 三、组件试炼场规则

`composer/windows-native/` 使用独立 `package.json` 和 `npm install`，不加入根 `pnpm-workspace.yaml`。每个编号目录必须有：

```text
smoke-test/       可重复执行脚本
output/           可再生结果，加入 gitignore
COMPONENT-CARD.md 能力边界与结果
```

组件从试炼场进入主系统前必须满足：安装可重复、输入输出明确、失败边界明确、内存基线已记录、真实密钥不进仓库、能力卡已回填。

## 四、环境变量规范

`.env.example` 只保留变量名：

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

`.env.local` 永不提交。日志不得输出 `AI_API_KEY`、`SMTP_AUTH_CODE`、完整 `FEISHU_WEBHOOK_URL`、资料原文或完整答案。

## 五、备份与清理

- SQLite 关闭后复制到 `APP_DATA_ROOT\data\backups`；
- `tmp` 可清空，清理前不得删除 `materials` 和 SQLite；
- 每个里程碑完成后打包源码与文档；
- 真实学习数据备份由家长确认后写入外接盘或受控目录。

## 六、主系统接入门槛

Phase 0.7 只验证。Phase 0.8 接入 SQLite、本地文件、SQLite Job Worker 和报告 Adapter 前，必须已有通过的能力卡、`docs/09-*` 验收结果和文档治理检查结果。

# AI StudyBuddy 测试验收计划 Test Plan

**版本**：v1.2
**日期**：2026-07-09
**状态**：Phase 0.5 已完成；继续覆盖 Phase 0.8 最小验收
**原则**：先证明组件能独立跑通，再接入主系统。

---

## 1. 测试分层

```text
组件 smoke test
  → Adapter 输入输出测试
  → Phase 0.8 E2E 验收
  → 文档/目录治理检查
```

当前不覆盖 S3 练习、S4 错题、S5 真题、S6 家长、S7 ASR。

---

## 2. Phase 0.5 组件 smoke test

所有 MVP 主路径组件已在 `G:\ai-studybuddy-composer` 独立跑通。通过后才能封装 Adapter。

| 组件 | 最小输入 | 期望输出 | 通过标准 | 结果记录 |
|---|---|---|---|---|
| PostgreSQL + pgvector | 启动数据库并执行建表 SQL | 可连接、可写入、可查询、可向量检索 | ✅ 2026-07-09 验证通过：PostgreSQL 16.14 + pgvector 0.8.5；CRUD、向量搜索、IVFFlat 索引通过 | composer/db/pgvector-test |
| PDF.js / pdf-parse | 1 个文字型 PDF | 可读纯文本 | 能提取主要正文，非空，无明显乱码 | composer/pdf（✅ 2026-07-09 pdf-parse 2.4.5 验证通过：7 页、5155 字符、2422 个中文字符） |
| RapidOCR / PaddleOCR | 1 张试卷/课件图片 | OCR 文本 | 能识别主要题干/标题，允许少量错字；RapidOCR 为当前主路径，PaddleOCR 仅作备选对比 | composer/ocr（✅ RapidOCR 2026-07-09 批量验证通过：22 张、平均 1.94s/页、中文字符 3009；PaddleOCR 待对比但不阻塞 Phase 0.8） |
| react-markdown + KaTeX | 含标题、列表、公式的 Markdown | 页面正确渲染 | 公式和 Markdown 均可显示 | composer/markdown（✅ 2026-07-09 Chrome 浏览器验证通过：KaTeX 加载、5 个公式、中文、代码块均正常） |
| Markmap | 层级 Markdown | 思维导图 | 节点层级正确，可展开 | composer/mindmap（✅ 2026-07-08 Node smoke test 通过，39 节点 / 深度 5；2026-07-09 Chrome 浏览器验证通过） |
| MinIO | 上传 PDF/图片 | object key + 可下载文件 + presigned URL | ✅ 2026-07-09 验证通过：上传、下载一致、临时 URL、删除、控制台登录均成功 | composer/storage/minio-test |
| BullMQ + Redis | 1 个测试 job | job 执行结果 | 成功执行，失败可重试 | composer/queue/bullmq-test（✅ 2026-07-09 验证通过：第一次失败、第二次重试成功、最终 completed） |
| Relay GPT/Claude Provider | 一段课程文本 | 结构化 JSON/Markdown | ✅ 2026-07-09 验证通过：Pixel API / gpt-5.5 / Responses API；11.9s，总 tokens 988，Markdown、中文、思维导图 JSON 均通过 | composer/ai-provider/gpt-test |

---

## 3. Adapter 最小验收

Adapter 不验证组件内部实现，只验证本项目统一输入输出。

| Adapter | 输入 | 输出 | 通过标准 |
|---|---|---|---|
| `PdfConverter` | PDF 文件路径/object key | `ConverterResult` | `ok=true` 且 `text` 非空 |
| `OcrConverter` | 图片文件路径/object key | `ConverterResult` | `ok=true` 且 `text` 非空 |
| `TextConverter` | Markdown/纯文本 | `ConverterResult` | 原文可入库，无需 LLM |
| `NoteAiProvider` | 统一纯文本 | 结构化笔记对象 | 含 `markdown`、`highlights`、`mindMap` |

统一失败要求：

- 不能吞异常；
- 必须返回 `ok=false` 和 `error`；
- 警告放入 `warnings`；
- 不在日志中记录 API Key、学生隐私全文、完整答案。

---

## 4. Phase 0.6 隧道穿透 smoke test

Phase 0.6 只验证试用阶段外网入口可行性，不创建部署运维指南，不暴露真实学习数据。

| 项目 | 最小输入 | 期望输出 | 通过标准 | 结果记录 |
|---|---|---|---|---|
| 候选方案对比 | Cloudflare Tunnel、Tailscale Funnel/Serve、frp、ngrok 等候选 | Phase 0.8 默认方案 + 备选方案 | 记录免费额度、域名要求、国内可达性、Windows 支持、HTTPS、访问控制、开机恢复和风险 | 待回填 |
| 本地 Web 服务 | 不含隐私的健康检查页 | `localhost` 和局域网可访问 | 页面不展示学生资料、API Key、token、内部路径 | 待回填 |
| 外网访问 | 隧道公网 URL | 手机蜂窝网络或非同局域网可访问 | 页面可打开，记录首次连接耗时和稳定性 | 待回填 |
| 安全边界 | 端口与访问控制检查 | 只暴露 Web 入口 | MinIO Console、PostgreSQL、Redis、Docker Desktop、调试端口不可公网访问；入口必须登录或临时鉴权 | 待回填 |
| 重启恢复 | 重启 Web 服务 / 隧道进程 / Windows | 可按记录步骤恢复访问 | 恢复步骤可复现，token 不入库、不入日志、不提交 git | 待回填 |

Phase 0.6 失败不推翻 Phase 0.5 组件 smoke test 结论，但会阻塞真实异地试用。若 Phase 0.8 只做本机演示，可以先用局域网或 `localhost` 完成业务 E2E；进入外网演示前必须补齐本节。

---

## 5. Phase 0.8 E2E 验收

目标路径：

```text
创建课程
  → 创建课次/学习任务
  → 上传 PDF/图片/文本
  → 转为统一纯文本
  → 中转 GPT/Claude 生成结构化笔记 + 重点 + 思维导图
  → 前端展示 Markdown / KaTeX / Markmap
  → 写入 StudyEvent
```

通过标准：

- 能创建 1 门课程；
- 能创建 1 个学习任务；
- 至少一种资料格式能完整跑通，优先 PDF；
- 能看到结构化笔记；
- 能看到重点列表；
- 能看到思维导图；
- `study_events` 中出现“资料已整理”事件；
- 清空 `G:\ai-studybuddy-tmp` 后，系统仍可重新执行该流程。

---

## 6. 文档与目录治理检查

每次文档或组件接入前后都运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-docs-governance.ps1
git diff --check
```

目录验收：

| 目录 | 验收标准 |
|---|---|
| `G:\ai-studybuddy-composer` | 只放组件下载、调试、smoke test |
| `G:\ai-studybuddy` | 只放主系统源码、文档、验证后的 Adapter |
| `G:\ai-studybuddy-tmp` | 可清空，不影响长期数据 |
| `G:\ai-studybuddy-logs` | 不保存密钥和隐私全文 |
| `G:\ai-studybuddy-data` | 存数据库/Redis 持久化数据 |
| `G:\ai-studybuddy-day-study` | 存 MinIO/学习资料对象存储 |

---

## 7. 暂不测试

当前阶段不测试：

- SenseVoice / FunASR 音频转写；
- FFmpeg 视频处理；
- Readability 网页解析；
- 练习生成和批改；
- 错题本；
- 家长面板；
- 期末真题解析和变题。

这些能力等对应子系统触发后，再扩展本测试计划。

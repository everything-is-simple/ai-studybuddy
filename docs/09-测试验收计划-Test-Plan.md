# AI StudyBuddy 测试验收计划

**版本**：v1.8
**日期**：2026-07-14
**状态**：Phase 0.5 历史证据保留；Phase 0.7 开发机验收完成，HP 实机兼容复测待机会执行；已补充 Phase 0.8 T04A composer 试炼场、正式 E2E 验收要求与 T09 未通过的真实验收结论
**用途**：定义组件验证、真实渠道、Windows 调度、Phase 0.8 业务闭环与 HP 16GB 兼容复测的证据标准。

---

## 一、测试分层与边界

| 层级                      | 位置                                       | 目的                                | 是否等于产品接入 |
| ------------------------- | ------------------------------------------ | ----------------------------------- | ---------------- |
| Phase 0.5 历史 smoke test | `I:\ai-studybuddy-composer` 历史目录       | 保留 PDF/OCR/渲染/AI/重组件能力事实 | 否               |
| Phase 0.7 独立 smoke test | `I:\ai-studybuddy-composer\windows-native` | 验证 Windows 原生轻量底座           | 否               |
| Phase 0.8 正式测试        | `I:\ai-studybuddy\packages`                | 验证正式 Adapter、API 与页面        | 是               |

Phase 0.7 的 `.env.local`、`.venv`、`node_modules`、output、真实凭据、真实资料均不进入主仓库。缺少外部凭据或实机时只能写 `BLOCKED_EXTERNAL` / `待实机验收`，不得写“通过”。

## 二、Phase 0.5 历史组件结论

PDF、RapidOCR、Markmap、Markdown/KaTeX、BullMQ/Redis、MinIO、PostgreSQL/pgvector、Relay GPT/Claude 已于 2026-07-09 在独立目录验证。PostgreSQL、MinIO、Redis/BullMQ 与 Docker/WSL2 不进入当前 Windows 单机成品默认栈；它们只在未来架构重新决策后才可使用。

## 三、Phase 0.7 验收矩阵

| 编号    | 验收对象               | 通过标准                                                                                                    | 当前证据与状态                                                                                                                   |
| ------- | ---------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 0.7-T01 | 环境基线               | Node 22 LTS、Windows、Python、内存、Docker/WSL2 状态均留档                                                  | ⚠️ 开发机已留档：Windows 10 19045、Node 25.4.0、Python 3.10.19、约 28.92GB；Node 22 LTS 与 HP 暂缓复测（设备不在身边）           |
| 0.7-T02 | SQLite                 | `better-sqlite3`、WAL、CRUD、唯一约束、事务、关闭后备份恢复                                                 | ✅ 开发机离线通过                                                                                                                |
| 0.7-T03 | 本地文件               | 逻辑 `storage_key`、写读删、路径逃逸拒绝、tmp 清理保护 materials                                            | ✅ 开发机离线通过                                                                                                                |
| 0.7-T04 | SQLite Job Worker      | 单进程串行、有限重试、上限失败、stale running 恢复、重启不丢 Job                                            | ✅ 开发机离线通过                                                                                                                |
| 0.7-T05 | RapidOCR 子进程        | JSON stdout、成功/缺文件/非零退出/超时、Python 退出                                                         | ✅ 开发机离线通过；HP 峰值与退出复测暂缓                                                                                         |
| 0.7-T06 | 报告核心               | 规则统计、AI 失败降级、脱敏、合并与渠道去重                                                                 | ✅ 开发机离线通过；固定 `2026-05-31 22:30 Asia/Shanghai` 覆盖日报、周报、月报和考前 7 天                                         |
| 0.7-T07 | QQ SMTP                | UTF-8 中文 HTML、可选附件、日志不泄露授权码、父母邮箱实收                                                   | ✅ 真实通过：QQ SMTP accepted，163 父母测试邮箱已收到                                                                            |
| 0.8-T05 | AI Provider Router     | 单 Provider 成功、priority fallback、全部失败、超时 fallback、未配置、OpenAI 响应解析；Dev API 返回标准信封 | ✅ 主仓库自动化通过：`ai-router.test.mjs` 6/6；全量 `pnpm test` 77/77                                                            |
| 0.7-T08 | 飞书 Webhook           | 完整合并报告卡片、失败不阻断邮件、Webhook 不泄露、父母飞书群实收                                            | ✅ 真实通过：飞书 Webhook accepted，父母飞书群已收到                                                                             |
| 0.7-T09 | Windows Task Scheduler | 临时 `AIStudyBuddy-Phase07-Smoke`：XML `StartWhenAvailable`、创建、手动触发、日志、退出码、清理、补发       | ✅ 管理员 PowerShell 真实通过：XML 单测通过；临时任务创建/触发/清理；`report-runner.js` 写入 `report:2026-05-31` SQLite 发送记录 |
| 0.7-T10 | 整合与 HP 实机         | 课程/任务→本地文件→OCR→AI→SQLite→报告→双渠道去重；16GB 门槛                                                 | ⏳ 开发机离线整合、合并、去重、QQ SMTP、飞书和 Windows 调度均通过；HP 实机因设备不在身边暂缓                                     |

## 四、报告隐私、合并与重试

- 日报、周报、月报与考试前 7/3/1 天提醒均使用 22:30；周日或月末重合时，邮件和飞书各只发送一条合并报告。
- 一个周期使用 `report:<yyyy-mm-dd>`；`report_deliveries` 使用 `report_key + channel` 唯一键。
- 邮件成功、飞书失败时，只允许重试飞书；反之亦然。
- 电脑关机或休眠错过时，下次 Windows 登录尽快补发；补发成功后不再重复。
- 报告不得发送资料原文、笔记正文、答案或聊天内容；日志不得写入授权码或完整 Webhook。

## 五、HP 实机兼容复测（非阻塞，待机会执行）

孩子 HP Pavilion Aero（Windows 11、Ryzen 5 5625U、16GB）当前不在身边。**该项已从 Phase 0.7 完成门槛移出**，改为可选兼容复测：设备可用后，以 Node 22 LTS 执行，目的为确认兼容性，不影响 Phase 0.8 进度。

```powershell
cd I:\ai-studybuddy-composer\windows-native
npm ci
npm run test:all
npm run measure:memory
```

必须同时满足：Docker Desktop 和 WSL2 未运行；学习服务可用内存至少 6GB；OCR、AI、邮件或报告峰值可用内存至少 3GB；无明显卡顿或持续分页增长；OCR 后 Python 退出；报告后 Node 退出；重复同周期不重复发送。

## 六、Phase 0.8 composer 试炼场验收（T04A）

在 `I:\ai-studybuddy-composer\converter\` 完成 DOCX、URL、本地 HTML、PPTX 的独立调通，形成能力卡与可重复 smoke test。T04A 不属于主系统正式验收，但为 T04B 在 `I:\ai-studybuddy\packages` 重新装配 Adapter 提供接口、安全、错误与验收证据。

| 格式 | 位置                       | 关键证据                                                                                                                               | 状态 |
| ---- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| DOCX | `converter\docx-test`      | mammoth 1.12.0；中文正文、视觉占位、空文档错误；`npm test` 4/4 通过                                                                    | ✅   |
| URL  | `converter\url-fetch-test` | undici 7.28.0；SSRF 全阻断、连接层回环 DNS 拒绝、5 MB/3 跳/10 秒限制、错误 body 取消与 Agent 关闭；真实 URL 首次成功；`npm test` 25/25 | ✅   |
| HTML | `converter\url-fetch-test` | jsdom + Readability；script/style 剥除、中文正文、fallback 路径                                                                        | ✅   |
| PPTX | `converter\pptx-test`      | jszip 3.10.1；数字页序、图片 OCR 提示、纯图片成功、损坏容器失败、命名/十进制/十六进制 XML entity 解码                                  | ✅   |

T04A 硬门槛：

- DOCX 中文正文、空文档错误、图片/图表占位均通过。
- URL 所有安全测试通过：协议/SSRF 拒绝、连接层回环 DNS 拒绝、5 MB/3 跳/10 秒限制、错误 body 取消和 Agent 关闭；至少一条真实 URL 成功（`zh.wikipedia.org` 首次抓取成功，重复访问触发 429 后返回人工出口）。
- HTML 中文正文可取，`script/style` 剥除。
- PPTX 页序、图片 OCR 提示、纯图片成功、损坏容器错误、命名/十进制/十六进制 XML entity 解码均通过。

## 七、Phase 0.8 正式 E2E 验收

Phase 0.7 开发机验收已完成，Phase 0.8 可以开始。以下项目是**正式实现后的待验收清单，不代表当前已通过**：

```text
选择学期教学日期 + 上传课程表图片
  → OCR/AI 识别预览与孩子确认
  → 原子化创建学期、课程实例、课表、目录和每学期 SQLite
  → 持续录入/确认考试日期
  → 每日首页完成证据驱动闭环
  → 资料/练习事件进入质量门与 StudyEvent
  → 22:30 生成脱敏 INFO，并在周/月观察窗形成 SIGNAL/TREND
```

验收时还要证明：`APP_DATA_ROOT\tmp` 清理不影响长期资料和笔记；正式 Adapter 不直接依赖试炼场脚本；真实数据和密钥不在 Git 中。

### 7.1 Phase 0.8 T09：隔离真实 E2E（2026-07-14）

| 验收项 | 实际证据 | 结论 |
| --- | --- | --- |
| 隔离与隐私 | 两个 run 使用独立 `APP_DATA_ROOT`、合成文本 PDF；仓库外 evidence 仅保存短哈希、状态、计数、耗时与裁剪截图。 | ✅ 通过 |
| 基线 | 隔离 worktree 中 `pnpm type-check`、后端 build、`pnpm test` 通过；后端 97/97、前端 12/12。 | ✅ 通过（Markmap chunk 大小警告非阻塞） |
| 文本 PDF 转换 | 两个 run 的 `material_convert` 均 1 次完成，终态前可读 normalized text。 | ✅ 通过 |
| 真实 Provider 笔记生成 | 已配置 Provider 的 run 中 3 次调用均成功返回（`pixel-k12` / `gpt-5.5`；token 701/784/831；约 15.4/20.0/16.2 秒），但 `JSON.parse(response.content)` 失败，`note_generate` 用尽 3 次且没有落库笔记。错误仅留 `JSON_PARSE` 与短哈希。 | ❌ 未通过；不得用历史 smoke test 替代 |
| 无 Provider 降级 | 显式无 Provider run 的 `note_generate` 3 次、约 14 秒后进入 `pending_quality_check`；页面显示“需要人工补文”，刷新不白屏。 | ✅ 通过 |
| 考试与 priorityBucket | 浏览器考试表单未能提交；同一未来 deadline 的 API 对照为 overdue=0、confirmed=1、pending=2。任务列表仍按 deadline 而非 bucket 排序。 | ⚠️ 仅后端派生逻辑通过，不是浏览器闭环或排序验收 |
| 手动补文 | `pending_quality_check` 下 `replace-text` 返回 `INVALID_STATUS`，符合当前后端仅允许 `conversion_failed` 补文的规则；页面没有可用手动补文入口。 | ❌ T10 候选恢复 UX/状态契约缺口 |
| 笔记/KaTeX/Markmap/模块/模块任务 | 没有成功笔记，因而无法验证。 | ⏳ 依赖真实 Provider 成功后重跑 |
| tmp 安全清理读回 | 已核对允许范围；因无完成笔记，未删除任何 tmp，避免形成无效通过结论。OCR 仍使用系统临时目录，尚无 `APP_DATA_ROOT\tmp` 清理实现或读回自动化证据。 | ⏳ 依赖成功笔记与清理实现后重跑 |

无 Provider run 的三次 note Job 尝试跨约 14 秒，符合 5 秒退避；本次运行**未观察到**重入，但当前 `setInterval` 不等待 `runOnce()`，不能将此写成 Worker 已证明串行。前端轮询在页面隐藏时不停止、状态变化不重置退避，亦未作为通过项。T09 不勾选完成；先以最小脱敏复现修复真实 Provider 响应的 JSON 解析契约，再重跑成功路径。仅当成功路径产生笔记后，才可执行 tmp 清理读回，并考虑后续 T10/T11。

## 八、Phase 0.8 设计回填验收矩阵

| 编号    | 场景                 | 必须证明的行为                                                                                                                      | 通过证据                                                                   |
| ------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 0.8-E01 | 学期初始化原子性     | “日期 → 课程表 → 预览 → 确认”成功时同时产生学期索引、`semester.db`、课程实例、课表和目录；任一步失败时不留下可见半成品              | 自动化集成测试覆盖成功与每个故障点；文件树、全局索引与业务库断言一致       |
| 0.8-E02 | 分学期隔离与恢复     | 不同学期使用不同业务库/目录/缓存；单个学期库的损坏、校验和恢复不影响其他学期                                                        | 创建两个学期的测试、故意损坏一个副本、`integrity_check` 和最近备份恢复记录 |
| 0.8-E03 | 学期生命周期         | `active → teaching_ended → follow_up → archived` 合法；归档默认只读，受控更正有审计；当前学期与旧 follow_up 的待办可聚合            | 状态迁移测试、首页聚合截图或 E2E 断言、审计事件断言                        |
| 0.8-E04 | 补考与重修           | 补考只新增原课程实例下的考试尝试；重修在新学期建新课程实例并链接原实例；临时补考课表仅在明确存在固定补课时写入                      | API/数据库断言：补考不增加课程实例；重修关联正确；历史资料复用为显式选择   |
| 0.8-E05 | 考试日期确认门       | 来源、识别置信度、孩子确认和变更历史均保存；未确认或变更待重确认日期不得驱动倒计时与 7/3/1 提醒                                     | pending/confirmed/superseded 状态的集成测试和报告预览断言                  |
| 0.8-E06 | 每日证据闭环         | 首页呈现明日准备、到期、待质检、错题复习和下一步；孩子可完成、修正或继续处理，不必接受 AI 排程                                      | 前端 E2E：任务/质量/事件状态迁移；StudyEvent 含证据引用                    |
| 0.8-E07 | AI 质量门与覆盖      | `required_fix`、`suggestion`、`uncertain`、`pending_quality_check`、`overridden` 的展示与规则正确；覆盖保留原结论、证据、原因和时间 | 单元/集成测试、审计记录断言；开放题不能被 AI 单方面判死                    |
| 0.8-E08 | AI/OCR/报告 fallback | PDF/OCR/AI/报告分别按文档规定降级；Provider 故障不锁死学习；双渠道失败保留本地 HTML                                                 | 注入失败的自动化测试、Job 重试/待质检记录、离线 HTML 与渠道错误摘要        |
| 0.8-E09 | 异常与报告尺度       | AI 仅生成异常候选及证据；孩子确认的合理特例不进入负面趋势；日报 INFO 非评价，周报 SIGNAL 只报重复模式，月报 TREND 需足够样本        | 固定时间窗测试数据、报告快照、基线/特例/置信度断言                         |
| 0.8-E10 | 隐私与报告发送       | 报告和日志不含资料正文、笔记正文、答案、API Key、SMTP 授权码或完整 Webhook；渠道按 `report_key + channel` 去重/单独重试             | 邮件/飞书 payload 快照、日志扫描、渠道失败重试测试                         |

### 8.1 已完成的 T05 Router 验收证据

- `packages/backend/test/ai-router.test.mjs` 覆盖单 Provider 成功、首 Provider 失败后的 fallback、全部 Provider 失败、超时后的 fallback、未配置与 OpenAI-compatible 响应解析。
- timeout mock 必须监听 `fetch` 第二参数中的 `AbortSignal`；忽略 abort 会让 SDK timeout 测试永久等待，不能作为有效的 fallback 验收。
- 已复跑 `pnpm type-check`、`pnpm build`、`pnpm test`：全量 77/77 通过；文档治理与 `git diff --check` 同步通过。
- 后端 API 测试以互不重叠的随机端口区间启动子进程，健康检查预算为 10 秒；`packages/backend` 的 `pnpm test` 固定 `node --test --test-concurrency=1`，避免多个 Express 子进程并行启动时由 CPU/端口竞争导致的偶发健康检查失败。

## 九、文档治理检查

每轮证据回填后运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-docs-governance.ps1
git diff --check
```

Phase 0.7 的最终选型结论与实测数据已经同步回 `docs/04-*`、`docs/08-*` 与能力卡。Phase 0.8 T04A composer 试炼场证据与 T05 正式 AI Router 验收已同步回 `docs/04-*`、`docs/05-*`、`docs/08-*`、能力卡与本节。Phase 0.8 每完成一项正式 Adapter/API/页面验收，再把实际命令、结果和证据路径回填本计划；当前未完成的 HP 兼容复测与 Phase 0.8 E2E 不得用文档措辞掩盖。

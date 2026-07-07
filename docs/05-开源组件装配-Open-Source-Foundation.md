# AI StudyBuddy 开源组件装配 SoT

**状态**：已确认
**日期**：2026-07-07
**用途**：定义本项目如何优先使用成熟开源组件，如何在 `G:\ai-studybuddy-composer` 先调通，再封装 Adapter 接入主系统。

## 一、核心原则：先分解，再组合

AI StudyBuddy 的系统能力来自成熟组件的组合，而不是从零造轮子。

> 系统开发不是先写完整业务，再找组件；而是先把成熟开源组件一个个调通，再通过 Adapter 组合成系统能力。

开发顺序：

```text
成熟开源组件下载
  → composer 独立调试
  → smoke test 验证
  → 组件能力卡沉淀
  → 主系统 Adapter 封装
  → 接入 FormatConverter / Renderer / Worker / Provider
  → 学习闭环联调
```

硬规则：

- 不满足“开源、成熟、可下载、可本地调通、许可证可接受”的系统组件，不进入 MVP。
- AI Provider 不是开源组件，但也必须先在 composer 中用最小样例调通。
- 不得因为某功能重要就自己造轮子。
- 产品流程可以参考优秀开源项目；技术栈不强行搬运。
- `G:\ai-studybuddy-composer` 是组件试炼场；`G:\ai-studybuddy` 只接收验证后的 Adapter 和业务编排。

## 二、组件能力卡模板

每个候选组件必须形成能力卡。

| 字段 | 要求 |
|---|---|
| 组件名 | 例如 PaddleOCR、SenseVoice、Markmap |
| GitHub / 官网地址 | 必须可追溯 |
| License | 必须确认许可证 |
| 成熟度判断 | Stars、维护状态、社区使用度、文档质量 |
| 安装方式 | npm / pip / Docker / 二进制 |
| 输入 | 文件、文本、URL、音频、图片等 |
| 输出 | 纯文本、JSON、HTML、Markdown、音频轨等 |
| Composer 目录 | 该组件在 `G:\ai-studybuddy-composer` 下的位置 |
| Adapter 名称 | 主系统封装层名称 |
| smoke test | 最小可运行测试 |
| MVP 状态 | 必接 / 后接 / 只参考 |

## 三、成熟开源组件下载清单

| 系统能力 | 成熟开源组件 | Composer 调试目录 | 接入方式 | MVP 优先级 |
|---|---|---|---|---|
| 产品闭环参考 | [KaoBuddy](https://github.com/jin-zi-xuan/kaobuddy-pwa) | `composer\reference\kaobuddy` | 参考资料导入、学习计划、模拟考、AI批改、错题本流程；不搬技术栈 | 必参考 |
| 刷题/错题参考 | [MiaowTest](https://github.com/qijun1900/MiaowTest) | `composer\reference\miaowtest` | 参考题库、练习记录、错题统计；不搬数据库/框架 | 必参考 |
| 轻量 MVP 参考 | [考试粥助手](https://github.com/zjuhechao/exam-porridge-assistant) | `composer\reference\exam-porridge` | 参考资料上传、AI笔记、练习、错题追踪 | 必参考 |
| PDF 文本提取 | [PDF.js](https://github.com/mozilla/pdf.js) / [pdf-parse](https://www.npmjs.com/package/pdf-parse) | `composer\pdf` | PDF → 文本，封装 `PdfConverter` | MVP 必接 |
| 图片 / 试卷 OCR | [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) + PP-OCRv6 | `composer\ocr\PaddleOCR` | 图片 → 文本，封装 `OcrConverter` | MVP 必接 |
| 音频转文字 | [SenseVoice](https://github.com/FunAudioLLM/SenseVoice) | `composer\asr\SenseVoice` | 音频 → 文本，封装 `AudioConverter` | Phase 1.5 |
| ASR 备选 | [FunASR](https://github.com/modelscope/FunASR) | `composer\asr\FunASR` | 更完整 ASR pipeline | Phase 1.5 |
| 视频处理 | [FFmpeg](https://ffmpeg.org/) | `composer\video\ffmpeg-test` | 视频 → 音轨 → ASR | 后接 |
| 网页正文提取 | [Mozilla Readability](https://github.com/mozilla/readability) + jsdom | `composer\webpage\readability-test` | URL → 正文文本 | P1/P2 |
| 思维导图渲染 | [Markmap](https://github.com/markmap/markmap) | `composer\mindmap\markmap-test` | Markdown/层级结构 → 思维导图 | MVP 必接 |
| 数学公式渲染 | [KaTeX](https://github.com/KaTeX/KaTeX) | `composer\markdown\katex-test` | Markdown 公式展示 | MVP 必接 |
| Markdown 渲染 | [react-markdown](https://github.com/remarkjs/react-markdown) | `composer\markdown\react-markdown-test` | 结构化笔记展示 | MVP 必接 |
| 异步任务队列 | [BullMQ](https://github.com/taskforcesh/bullmq) + Redis | `composer\queue\bullmq-test` | 格式转换 / AI Job 异步执行 | MVP 必接 |
| 对象存储 | [MinIO](https://github.com/minio/minio) | `composer\storage\minio-test` | 原始素材、PDF、图片、音频存储 | MVP 必接 |
| 数据库 / 向量 | [PostgreSQL](https://www.postgresql.org/) + [pgvector](https://github.com/pgvector/pgvector) | `composer\db\pgvector-test` | 业务数据 + 后续知识检索 | MVP 必接 |
| 默认文本 AI | DeepSeek | `composer\ai-provider\deepseek-test` | 文本理解、笔记整理、普通解析 | MVP 必接 |
| 文本 AI 备选 | Qwen | `composer\ai-provider\qwen-test` | 文本任务备选；Qwen-VL 只作多模态兜底 | P1 |
| 复杂图片兜底 | Kimi / Qwen-VL | `composer\ai-provider\vision-fallback-test` | OCR/版面失败时兜底 | P2 |
| 最难推理兜底 | GPT | `composer\ai-provider\gpt-test` | 最难数学、证明、跨学科推理 | P2/高级兜底 |

说明：DeepSeek / Qwen / Kimi / GPT 是可替换 AI Provider，不属于“成熟开源组件下载清单”的开源组件范畴；它们出现在本表中，只表示也要先做最小接入验证。

## 四、产品流程参考边界

### 4.1 KaoBuddy

参考：资料导入、知识点拆分、学习计划、模拟考、AI 批改、错题本闭环。

不搬：PWA / FastAPI 技术栈、原数据库结构、原 UI 细节。

### 4.2 MiaowTest

参考：题库组织、练习记录、错题统计、刷题体验。

不搬：原框架、原数据模型、与本项目家长面板冲突的产品逻辑。

### 4.3 考试粥助手

参考：轻量学习闭环、最小资料上传、AI 笔记和练习的 MVP 思路。

## 五、两层架构边界

### 5.1 格式转换层：成熟开源组件，不走 LLM

| 输入 | 组件 | 输出 |
|---|---|---|
| PDF | PDF.js / pdf-parse | 纯文本 |
| 图片 / 试卷 | PaddleOCR + PP-OCRv6 | OCR 文本 |
| 音频 | SenseVoice / FunASR | 转写文本 |
| 视频 | FFmpeg → ASR | 转写文本 |
| 网页链接 | Mozilla Readability + jsdom | 正文文本 |
| Markdown / 纯文本 | TextConverter | 原文入库 |

### 5.2 LLM 理解层：只吃纯文本

| 任务 | 默认 Provider | 兜底策略 |
|---|---|---|
| 结构化笔记 + 重点 + 思维导图数据 | DeepSeek | Qwen 备选；GPT 处理难内容 |
| 教学解析步骤 / 解题路径 | DeepSeek / Qwen | GPT 处理最难数学、证明、跨学科推理 |
| 出题 / 变题 | DeepSeek / Qwen | GPT 处理难题 |
| 主观题评分 / 错因分类 | DeepSeek / Qwen | GPT 处理争议样例 |
| OCR/版面失败兜底 | Kimi / Qwen-VL | 仅在开源 OCR 失败后使用 |

### 5.3 规则引擎层：不走 LLM

- 选择题 / 填空题精确批改；
- 艾宾浩斯排程；
- 超时任务检测；
- 考前提醒；
- 工作量累计；
- 家长时间线聚合。

## 六、接入验收标准

一个组件正式进入主系统前必须满足：

1. `COMPOSER_ROOT` 独立调通；
2. 形成组件能力卡；
3. 有最小 smoke test（见下方标准表）；
4. Adapter 输出结构稳定；
5. 日志写入 `LOG_ROOT`；
6. 临时文件写入 `TMP_ROOT`；
7. 运行数据不污染主 repo；
8. 许可证和部署方式可接受。

## 七、Smoke Test 标准表

以下是每个 MVP 必接组件的 smoke test 具体要求。"通过"不是模糊感觉，而是可验证的检查项。

| 组件 | Smoke Test 操作 | 通过标准 | 失败处理 |
|---|---|---|---|
| **pdf-parse / PDF.js** | 解析 1 个含中文的真实 PDF（至少 3 页） | 文本完整提取、无乱码、中文字符正确、页码能区分 | 换备选组件或检查编码 |
| **PaddleOCR + PP-OCRv6** | 识别 1 张含中文文字的试卷图片 | 汉字/数字识别率 > 90%；表格结构基本保留；不丢整行 | 调整模型版本或预处理 |
| **Markmap** | 渲染 1 份 3 级层级的 Markdown 文本 | 浏览器可正常展示导图；节点可展开/收起；不报错 | 检查 Markdown 格式或 Markmap 版本 |
| **react-markdown + KaTeX** | 渲染含行内公式 `$E=mc^2$` 和块级公式的 Markdown | 公式美观渲染、不显示原始 LaTeX 源码、无 JS 报错 | 检查 KaTeX 插件配置 |
| **BullMQ + Redis** | 创建队列 → 入队 1 个 Job → 消费 → 模拟失败 → 重试 | Job 经历 waiting→active→completed 全生命周期；失败 Job 重试成功 | 检查 Redis 连接和队列配置 |
| **MinIO** | 上传 1 个文件 → 下载 → 生成临时 URL → URL 可访问 | 上传/下载内容一致；临时 URL 在有效期内可访问、过期后不可访问 | 检查 Bucket 策略和端口 |
| **PostgreSQL + pgvector** | 建表 → 插入 → 查询 → 创建向量列 → 向量相似度搜索 | CRUD 正常；pgvector 扩展加载成功；向量搜索返回结果 | 检查扩展安装和 SQL 语法 |
| **DeepSeek API** | 发送 1 段 500 字中文纯文本，要求返回结构化笔记 | API 调通；返回 Markdown 格式可解析；latency < 30s；token 消耗合理 | 检查 API Key 和网络；记录错误码 |
| **Qwen API**（P1 备选） | 同 DeepSeek smoke test | 同上 | 同上 |

### Smoke Test 执行规范

1. **测试文件位置**：每个组件的 smoke test 脚本放在 `composer\<组件目录>\smoke-test\` 下；
2. **测试数据**：使用真实的中文样本（教材截取或公开试卷），不用英文 lorem ipsum；
3. **结果记录**：通过后在能力卡中标注日期和版本；
4. **失败不阻塞其他组件**：某组件失败时，其他组件可继续，但该组件不得进入主系统；
5. **二次验证**：组件升级版本后，必须重新跑 smoke test。

### Smoke Test 状态追踪

| 组件 | 状态 | 通过日期 | 版本 | 备注 |
|---|---|---|---|---|
| pdf-parse | ⏳ 待测 | — | — | — |
| PaddleOCR | ⏳ 待测 | — | — | — |
| Markmap | ⏳ 待测 | — | — | — |
| react-markdown + KaTeX | ⏳ 待测 | — | — | — |
| BullMQ + Redis | ⏳ 待测 | — | — | — |
| MinIO | ⏳ 待测 | — | — | — |
| PostgreSQL + pgvector | ⏳ 待测 | — | — | — |
| DeepSeek API | ⏳ 待测 | — | — | — |
| Qwen API | ⏳ 待测 | — | — | — |

# AI StudyBuddy 开源底座决策

**状态**：最终决定
**日期**：2026-07-06
**用途**：记录本项目使用开源项目作为系统底座的边界、参考顺序和搬运规则。本文是“开源底座选型”的单一事实来源（SoT）。

---

## 一、最终决定

本项目不 fork 一个大型现成系统作为总底座，而是保留 AI StudyBuddy 自有主架构：

- 移动端：React Native + Expo
- 后端：Node.js + Fastify
- 数据库：PostgreSQL + pgvector
- 队列：Redis + BullMQ
- 文件：MinIO / S3
- AI 能力：可配置 Provider + 自部署 ASR/OCR

开源项目采用“模块搬运 + 产品流程参考”策略：学习成熟项目的闭环、数据结构、交互和 Prompt 思路，但不继承与本项目冲突的技术栈。

---

## 二、参考项目优先级

| 优先级 | 项目 | 用途 | 搬运方式 |
|---|---|---|---|
| 1 | [KaoBuddy](https://github.com/jin-zi-xuan/kaobuddy-pwa) | 主学习闭环参考：资料导入、知识点拆分、学习计划、模拟考、AI 批改、错题本 | 搬产品流程、页面思路、Prompt 思路；不搬 PWA/FastAPI 技术栈 |
| 2 | [MiaowTest](https://github.com/qijun1900/MiaowTest) | 刷题、错题、练习统计、管理端/题库结构参考 | 搬题库/练习/错题/统计模型；不搬 Uni-app/MongoDB 技术栈 |
| 3 | [考试粥助手](https://github.com/zjuhechao/exam-porridge-assistant) | 轻量 MVP 参考：资料上传、笔记、练习、错题追踪、BYOK | 搬最小闭环体验和本地化思路 |
| 4 | [RAGFlow](https://github.com/infiniflow/ragflow) / [Dify](https://github.com/langgenius/dify) | 文档解析、RAG、AI Workflow、Prompt 调试、模型管理 | 只做 AI 工作流/知识库参考，不做业务主后端 |
| 5 | [SenseVoice](https://github.com/FunAudioLLM/SenseVoice) / [FunASR](https://github.com/modelscope/FunASR) / [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) | 课堂录音转写、作业/真题/手写 OCR | 作为独立能力服务接入，通过 Worker 调用 |
| 6 | [Anki](https://github.com/ankitects/anki) | 间隔复习思想参考 | 只参考记忆调度思想，不搬 UI 或复杂同步体系 |
| 7 | [pdf-parse](https://www.npmjs.com/package/pdf-parse) / [PyMuPDF](https://github.com/pymupdf/PyMuPDF) | PDF 课件/教材文本提取 | 进程内调用，无需独立服务 |
| 8 | [ffmpeg](https://ffmpeg.org/) | 视频音轨提取，提取后走 ASR | Docker 容器内调用 |
| 9 | [Readability](https://github.com/mozilla/readability) | 网页链接正文提取 | 进程内调用，无需独立服务 |

---

## 三、不采用的底座

| 项目类型 | 结论 | 原因 |
|---|---|---|
| Moodle | 不采用 | 偏学校/教师管理，PHP 体系重，和家庭自救型产品不匹配 |
| Open edX | 不采用 | 平台过重，部署和二开成本高，偏课程平台而非个人学习闭环 |
| Open WebUI 类聊天平台 | 不作为底座 | 适合 AI 聊天/知识库，不负责课程、任务、错题、家长时间线 |
| 单一开源仓库整仓 fork | 不采用 | 会被原项目架构绑架，后续维护成本高 |

---

## 四、搬运边界

### 4.1 可以搬

- 用户流程：资料 → 知识点 → 计划 → 做题 → 批改 → 错题 → 复习 → 模拟考
- 页面布局：资料页、做题页、批改结果页、错题本页、复习队列页
- 数据模型思想：题库、提交、批改结果、错题、复习轮次、知识点统计
- Prompt 思路：笔记整理、出题、批改、解析、错因分类、变题
- 工程经验：异步任务、模型配置、文档解析、上传处理

### 4.2 不可以直接搬

- 与本项目主架构冲突的框架、数据库、认证体系
- 未确认许可证兼容性的源码
- 大段复制后没有来源说明的代码
- 直接暴露题目答案、分数、错题详情给家长端的交互
- 让 AI 直接输出不可控的内部推理过程；产品只展示面向学生的“教学解析步骤”

### 4.3 许可证规则

引用开源项目时必须先确认 License。若复制代码片段，必须在代码注释或文档中记录：来源 URL、许可证、原作者、修改说明。优先采用“参考设计后重写”的方式。

---

## 五、错题本主闭环

错题本不是附属功能，而是所有写题场景的统一沉淀层。

### 5.1 入库来源

- 平时练习错题
- 老师作业错题
- 历年真题解析中的不会题/错题
- 变题模拟卷错题
- 学生手动加入的错题

### 5.2 AI 批改后自动生成

- 原题
- 学生答案
- 标准答案或评分要点
- 面向学生的教学解析步骤：读题、审题、划重点、找条件、知识点关联、错误路径剪枝、最终解法
- 错因分类：知识点不熟、审题错误、计算错误、理解偏差、不会做
- 下一次复习时间

### 5.3 复习节奏

| 轮次 | 时间 | 方式 |
|---|---|---|
| 第 1 轮 | 1 天后 | 原题重做 |
| 第 2 轮 | 2 天后 | 原题重做 |
| 第 3 轮 | 4 天后 | AI 变题 |
| 第 4 轮 | 7 天后 | AI 变题 |
| 第 5 轮 | 15 天后 | 高难变题 |
| 第 6 轮 | 30 天后 | 综合检测 |

连续 3 次做对后标记为“已掌握”；复习中再次做错则重置到第 1 轮。考前 2 个月内，未掌握错题进入优先复习队列。

### 5.4 家长端边界

家长端只看任务完成状态、完成时间、错题复习数量、逾期数量和掌握趋势；不看题目内容、答案、分数和具体错因。

---

## 六、两层架构边界（格式转换 vs LLM 理解）

> 详细架构见 ARCHITECTURE.md 2.4。本节只记录开源工具在两层中的定位。

| 层 | 职责 | 本项目使用的开源工具 | 是否需 LLM |
|----|------|-------------------|----------|
| 格式转换层 | 各种格式→纯文本 | SenseVoice、FunASR、PaddleOCR、pdf-parse、PyMuPDF、ffmpeg、Readability | **不需要** |
| LLM 理解层 | 纯文本→结构化输出 | DeepSeek 系列（纯文本模型） | **需要**，只有 7 个调用点 |
| 规则引擎层 | 批改/排程/检测 | 自写规则引擎（字符串匹配、日期计算） | **不需要** |

**MVP 优先级**：PDF + 纯文本 + 图片 OCR 先行（无需部署 ASR 服务即可跑通核心链路），音频 ASR 紧随其后，视频最后。

---

## 七、对现有设计文档的约束

- `PRD.md`：记录开源底座最终决策、产品范围和错题闭环。
- `ARCHITECTURE.md`：保留当前技术栈，增加开源项目到模块的映射关系。
- `backend-guidelines.md`：后端只通过 Adapter/Service 接入外部能力，不能直接混入外部项目架构。
- `frontend-guidelines.md`：可参考 KaoBuddy/MiaowTest 页面，但必须遵守本项目家长温柔可见原则。
- `dev-rules.md`：新增开源搬运纪律和许可证记录要求。
- `test-plan.md`：增加搬运边界、错题闭环、家长隐私边界的验收用例。
- `todo-list.md`：后续任务按“先复刻学习闭环，再完善真题/家长可见”的顺序执行。

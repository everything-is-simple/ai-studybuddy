# AI StudyBuddy 新任务清单：七子系统逐个完成

**版本**：v1.0-rebuild
**日期**：2026-07-07
**原则**：先共同底座，再七个场景子系统逐个完成。旧草稿任务清单已归档到 `G:\ai-studybuddy-backup\system-design-docs-draft_*.zip`。

---


## 文档门禁：新增规范文档的正确时机

> 开发动作触发文档，而不是提前创建空文档。AI 必须先读 `00-文档索引-Index.md`，确认触发条件满足后，才能创建 08-12 号预留文档。

| 即将开始的动作 | 必须先存在/创建的文档 | 说明 |
|---|---|---|
| 设计共同数据模型、队列、对象存储、AI Provider、Adapter | `08-共同底座架构-Architecture.md` | 没有共同底座设计，不开始跨子系统实现 |
| 调通第一个开源组件 smoke test | `09-测试验收计划-Test-Plan.md` | 先定义怎么验收，再调组件 |
| 写第一个后端服务 / Adapter / API / Worker | `10-后端开发规范-Backend-Guidelines.md` | 先统一路径、日志、Adapter 输出约定 |
| 写第一个正式前端页面 | `11-前端开发规范-Frontend-Guidelines.md` | 先统一页面、组件、状态和渲染规范 |
| 多 AI / 多分支 / 多人协作 | `12-开发规范-Dev-Rules.md` | 先统一协作、提交、归档、备份规则 |

门禁流程：

```text
收到任务 → 读 00 索引 → 查目标文档是否存在 → 查触发条件 → 不满足则不创建 → 满足则创建 → 更新 00 索引 → 运行治理检查 → 提交
```

---

## Phase 0：文档重建与草稿归档

- [x] 将旧草稿设计文档 zip 归档到 `G:\ai-studybuddy-backup`
- [x] 标记归档为 `系统设计文档-draft`
- [x] 重建总 PRD：`docs/01-总PRD-产品需求-Product-Requirements.md`
- [x] 命名七个子系统：`docs/02-七子系统地图-Scenario-Systems.md`
- [x] 回答文档策略问题：`docs/07-文档策略-Design-Docs-Strategy.md`
- [x] 编写第一个子系统 PRD：`docs/subsystems/03-S1学习节奏子系统PRD-StudyRhythm.md`

---

## Phase 0.5：共同底座与开源组件试炼场

> 所有成熟开源组件先在 `G:\ai-studybuddy-composer` 单独调通，smoke test 通过后再进主系统。
> 开始调第一个组件前，按文档门禁应先创建 `09-测试验收计划-Test-Plan.md`；开始写 Adapter/API/Worker 前，应先创建 `10-后端开发规范-Backend-Guidelines.md`。

### 0.5A 第一批：支撑 S1 + S2 + Phase 0.8

- [ ] 创建 composer 子目录：pdf / ocr / markdown / mindmap / storage / queue / ai-provider / db
- [ ] PostgreSQL + pgvector：本地连接、迁移目录、最小表 smoke test
- [ ] PDF.js / pdf-parse：PDF → 文本 smoke test
- [ ] PaddleOCR + PP-OCRv6：图片/试卷 → 文本 smoke test
- [ ] react-markdown + KaTeX：笔记/公式展示 smoke test
- [ ] Markmap：Markdown → 思维导图 smoke test
- [ ] MinIO：上传/下载 PDF、图片 smoke test
- [ ] BullMQ + Redis：异步 job、失败重试 smoke test
- [ ] DeepSeek Provider：纯文本 → 结构化 JSON smoke test

### 0.5B 第二批：支撑 S3 + S4

- [ ] 客观题规则批改：选择题/填空题最小规则测试
- [ ] 错题复习排程：间隔复习日期计算测试
- [ ] Qwen Provider：文本备选最小样例
- [ ] GPT Provider：难题兜底最小样例

### 0.5C 工程治理

- [ ] 备份 zip 脚本：写入阶段、commit、风险、恢复方式
- [ ] tmp 清理脚本：清空后系统可继续运行
- [ ] logs 规范：不记录 API Key、学生隐私全文、完整答案

暂不进入 Phase 0.5 主线：SenseVoice、FunASR、FFmpeg、Readability。它们等 S7 或对应子系统开工前再调。

---

## Phase 0.8：第一个能看到东西的最小里程碑

目标：不要等完整 MVP 才有反馈，先跑通“创建课程 → 上传 PDF/图片/文本 → 看到结构化笔记和思维导图”。

范围只包含 S1 基础 + S2 核心：

- [ ] 创建最小用户/学生上下文
- [ ] 创建课程 Course
- [ ] 创建课次/学习任务 StudyTask
- [ ] 上传 PDF / 图片 / 文本到 MinIO
- [ ] FormatConverter 输出统一纯文本
- [ ] DeepSeek 生成结构化笔记 + 重点 + 思维导图数据
- [ ] 前端展示 Markdown / 公式 / 思维导图
- [ ] 写入 StudyEvent：资料已整理

明确不做：练习、错题、家长面板、音频 ASR、期末真题。

---

## Phase 1：MVP 最小学习闭环

目标：先完成 S1 + S2 + S3 + S4 + S6 简版。

### S1 学习节奏 StudyRhythm

渐进式 Schema：S1 只先建 `users`、`courses`、`study_tasks`、`study_events` 四类最小数据结构；后续子系统开工时再追加自己的表，不一次性设计 20+ 张表。

- [ ] 课程 Course 数据结构
- [ ] 学习任务 StudyTask 数据结构
- [ ] 学习事件 StudyEvent 数据结构
- [ ] 今日任务页面
- [ ] 课程列表/课程详情页面
- [ ] 任务创建/完成/逾期状态
- [ ] BullMQ 定时逾期扫描
- [ ] 家长进度摘要接口

### S2 资料笔记 NoteBuilder

- [ ] 文件上传到 MinIO
- [ ] FormatConverter Router
- [ ] PdfConverter：PDF → 文本
- [ ] OcrConverter：图片 → 文本
- [ ] TextConverter：Markdown/纯文本直入
- [ ] NormalizedText 入库
- [ ] DeepSeek 生成结构化笔记 + 重点 + 思维导图数据
- [ ] react-markdown + KaTeX + Markmap 展示
- [ ] 资料整理完成后写入 S1 StudyEvent

### S3 限时练习 PracticeRunner

- [ ] 练习生成：基于 S2 笔记生成选择/填空/简答题
- [ ] 限时答题页面
- [ ] 客观题规则批改
- [ ] 主观题 LLM 辅助评分
- [ ] 练习完成后写入 S1 StudyEvent
- [ ] 错题写入 S4

### S4 错题改错 ErrorFixer

- [ ] 错题数据结构
- [ ] 错因分类
- [ ] 错题列表和详情页
- [ ] 间隔复习排程
- [ ] 原题重做
- [ ] 错题复习后写入 S1 StudyEvent

### S6 家长观察 ParentWindow 简版

- [ ] 家长绑定学生
- [ ] 家长时间线页面
- [ ] 今日/本周完成数量
- [ ] 逾期数量
- [ ] 隐私边界：不显示原始资料、题目答案、完整解析

---

## Phase 1.5：S7 课堂采集 ClassCapture

- [ ] SenseVoice：音频 → 文本 smoke test
- [ ] FunASR 备选 pipeline smoke test
- [ ] AudioConverter Adapter
- [ ] 课堂录音上传
- [ ] 转写文本进入 S2 NoteBuilder
- [ ] 原始音频保留/清理策略

---

## Phase 2：S5 期末冲刺 ExamCrammer

- [ ] 真题上传：PDF/图片/文本
- [ ] 真题题目结构化
- [ ] 教学解析步骤 / 解题路径生成
- [ ] 限时模拟考试
- [ ] 变题组卷
- [ ] 模拟错题进入 S4
- [ ] 备考任务写入 S1

---

## Phase 3：组合与打磨

- [ ] 七子系统导航整合
- [ ] 统一权限与家长隐私策略
- [ ] AI Provider 成本控制
- [ ] 数据备份/恢复演练
- [ ] 真实家庭学习数据试运行

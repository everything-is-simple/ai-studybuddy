# AI StudyBuddy 新任务清单：七子系统逐个完成

**版本**：v1.0-rebuild
**日期**：2026-07-07
**原则**：先共同底座，再七个场景子系统逐个完成。旧草稿任务清单已归档到 `G:\ai-studybuddy-backup\system-design-docs-draft_*.zip`。

---

## Phase 0：文档重建与草稿归档

- [x] 将旧草稿设计文档 zip 归档到 `G:\ai-studybuddy-backup`
- [x] 标记归档为 `系统设计文档-draft`
- [x] 重建总 PRD：`docs/PRD.md`
- [x] 命名七个子系统：`docs/scenario-systems.md`
- [x] 回答文档策略问题：`docs/design-docs-strategy.md`
- [x] 编写第一个子系统 PRD：`docs/subsystems/S1-study-rhythm-PRD.md`

---

## Phase 0.5：共同底座与开源组件试炼场

> 所有成熟开源组件先在 `G:\ai-studybuddy-composer` 单独调通，smoke test 通过后再进主系统。

- [ ] 创建 composer 子目录：pdf / ocr / markdown / mindmap / storage / queue / ai-provider
- [ ] PDF.js / pdf-parse：PDF → 文本 smoke test
- [ ] PaddleOCR + PP-OCRv6：图片/试卷 → 文本 smoke test
- [ ] react-markdown + KaTeX：笔记/公式展示 smoke test
- [ ] Markmap：Markdown → 思维导图 smoke test
- [ ] MinIO：上传/下载 PDF、图片 smoke test
- [ ] BullMQ + Redis：异步 job、失败重试 smoke test
- [ ] DeepSeek Provider：纯文本 → 结构化 JSON smoke test
- [ ] Qwen Provider：文本备选最小样例
- [ ] GPT Provider：难题兜底最小样例
- [ ] 备份 zip 脚本：写入阶段、commit、风险、恢复方式
- [ ] tmp 清理脚本：清空后系统可继续运行
- [ ] logs 规范：不记录 API Key、学生隐私全文、完整答案

---

## Phase 1：MVP 最小学习闭环

目标：先完成 S1 + S2 + S3 + S4 + S6 简版。

### S1 学习节奏 StudyRhythm

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

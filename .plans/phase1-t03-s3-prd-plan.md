# Phase 1-T03：S3 限时练习子系统 PRD 编写计划

**状态**：已批准，已完成纯文档交付（尚未开始任何 S3 业务实现）
**日期**：2026-07-15
**任务归属**：纯文档，不写业务代码

## 1. 目标

按文档门禁规则创建 `docs/subsystems/04-S3-限时练习子系统PRD-PracticeRunner.md`，为后续 T03A/T03B/T03C/T03D 代码实现建立设计基线。

## 2. 门禁确认

- S3 触发条件："S2 MVP 完成后"——S2 NoteBuilder MVP 已通过 T07/T09/T10 验收 ✅
- docs/00 索引已标记 S3 为"触发条件已满足，等待 Phase 1-T03 计划批准后创建" ✅
- 本任务只创建 PRD 文档 + 更新索引，不写代码、不建表、不改 API

## 3. PRD 内容大纲

按七子系统地图§6 的模板结构：

1. **Executive Summary**：问题陈述、解决方案、验收标准
2. **User Experience & Functionality**：角色、用户故事、非目标
3. **User Flow**：练习创建 → 限时作答 → 提交 → 批改 → 结果查看 → 错题标记
4. **Inputs / Outputs**：知识模块/笔记作为输入，练习记录/错题证据作为输出
5. **Open-source Components**：规则引擎、SQLite、Job Worker、AI
6. **AI System Requirements**：题目生成 prompt、主观题评分（后续）
7. **Data Objects**：`questions`、`practice_sessions`、`practice_answers` 表设计
8. **Pages / API**：API 端点与前端页面草案
9. **Acceptance Criteria**：可执行的验收标准
10. **Non-Goals / Roadmap**

## 4. 关键设计决策（PRD 中要明确的）

### 4.1 练习与知识模块的关系
- 每道题必须关联至少一个 `knowledge_module_id`
- 练习从知识模块发起：学生选择一组模块 → AI 生成对应题目
- 题目保留 `source_evidence` 回链原始资料

### 4.2 题目类型边界
- MVP 只做：单选题、多选题、填空题（客观题，规则批改）
- 后续：简答题、计算题（主观题，AI 批改）
- 不做：编程题、论述题、实验题

### 4.3 限时机制
- 练习 session 有可选 `time_limit_seconds`
- 超时后可继续提交但标记 `overtime: true`
- 不做强制倒计时锁屏

### 4.4 批改规则
- 单选题：精确匹配
- 多选题：全选对得满分，漏选/错选不得分（MVP 不做半分）
- 填空题：去空格、统一大小写后精确匹配；可配置多个正确答案

### 4.5 题目生成 AI 策略
- 使用与 S2 相同的 `AiProviderRouter`
- 输入：知识模块标题 + content_summary + source_evidence + 难度
- 输出：JSON 格式的题目数组
- AI 不可用时：不创建练习，明确提示"需要 AI 生成题目"
- prompt 版本管理：`s3-practice-v1.0`

### 4.6 与 S4 错题的边界
- S3 只负责：记录每题作答是否正确、用时
- S3 不负责：错题归档、薄弱点归纳、复习排程
- S3 输出一个 `practice_answer.is_correct = false` 的事实，S4 消费该事实

### 4.7 StudyEvent 写入
- 练习完成后写入 `practice_completed` 事件到 S1 时间线
- 包含：练习 ID、题目数、正确率、用时

## 5. 涉及文件

| 文件 | 动作 |
| --- | --- |
| `docs/subsystems/04-S3-限时练习子系统PRD-PracticeRunner.md` | 新建 |
| `docs/00-文档索引-Index.md` | 更新 S3 行状态为"已创建" |
| `docs/04-开发任务清单-Todo-List.md` | 将 T03 PRD 标为完成 |

## 6. 不做什么

- 不写任何业务代码、不建表、不改 API
- 不创建 S4/S5/S6/S7 PRD
- 不修改 S1/S2 现有代码或 PRD（除非发现明确事实错误）
- 不在 PRD 中设计主观题批改细节（留给 S3-v1.1）
- 不设计跨考试练习推荐（留给 T11 工作台集成后）

## 7. 验证步骤

1. PRD 内容与 S1/S2 PRD 格式一致
2. 数据对象与 `docs/02` 共同业务对象表一致（`Question`/`PracticeSession`/`PracticeAnswer`）
3. `docs/00` 索引更新
4. `scripts/check-docs-governance.ps1` 通过
5. `git diff --check` 通过

## 8. 执行记录

- 2026-07-15：用户在 Plan Mode 明确批准本计划后创建 S3 PRD；新增 `docs/subsystems/04-S3-限时练习子系统PRD-PracticeRunner.md`，并同步更新 `docs/00` 与 `docs/04`。
- 本任务未创建表、迁移、API、前端页面或任何 S3 运行数据；后续 T03A–T03D 必须各自计划并获批。

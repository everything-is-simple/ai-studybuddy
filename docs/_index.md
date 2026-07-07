# AI StudyBuddy 文档索引

> **用途**：将此文件粘贴到另一个项目的 AI 对话中，AI 即可按路径找到所有设计文档。
> **项目根目录**：`g:\ai-studybuddy`
> **文档目录**：`g:\ai-studybuddy\docs`
> **最后更新**：2026-07-07

---

## 文档清单（路径 + 说明）

| # | 文件路径 | 文件名 | 内容说明 |
|---|---------|--------|---------|
| 1 | `g:\ai-studybuddy\docs\PRD.md` | PRD.md | **产品需求文档** — 用户角色、用户流程图、AI 边界、P0/P1/P2 优先级、技术栈选型、AI Key 混合策略、数据保留策略 |
| 2 | `g:\ai-studybuddy\docs\ARCHITECTURE.md` | ARCHITECTURE.md | **技术架构文档** — 系统总览、组件流程图、运行目录职责、数据库表、API、Pipeline、AI Provider 配置、推送通知表 |
| 3 | `g:\ai-studybuddy\docs\dev-rules.md` | dev-rules.md | **开发规范** — TypeScript 规范、命名约定、AI 行为约束、Git 规范、API/DB/前后端代码规范、环境变量、分页字段统一为 page_size(snake_case) |
| 4 | `g:\ai-studybuddy\docs\frontend-guidelines.md` | frontend-guidelines.md | **前端开发指南** — 设计原则、导航结构、7 个核心页面线框图、离线策略、性能预算、状态管理、依赖清单(思维导图: WebView+Markmap) |
| 5 | `g:\ai-studybuddy\docs\backend-guidelines.md` | backend-guidelines.md | **后端开发指南** — Fastify/Drizzle/Redis 决策、Auth 设计、API 设计、DB 策略、AI 集成（两层架构：6.1格式转换+6.2 Provider）、Worker 并发控制(6.3)、AI 预算控制(6.5)、推送通知设计(6.6)、安全设计 |
| 6 | `g:\ai-studybuddy\docs\test-plan.md` | test-plan.md | **测试计划** — 测试金字塔、单元/集成/E2E 测试用例、各 Phase 验收标准、CI 质量门禁 |
| 7 | `g:\ai-studybuddy\docs\todo-list.md` | todo-list.md | **任务清单** — Phase 0.5 开源组件调试装配 + Phase 1 多格式资料导入闭环，含描述/输入/输出/验收标准/风险点 |
| 8 | `g:\ai-studybuddy\docs\tutorial-one-sentence-ai-app.md` | tutorial-one-sentence-ai-app.md | **开发过程指导** — 5 阶段开发法(需求对话→PRD→10 文档→任务拆解→AI 执行与验证) |
| 9 | `g:\ai-studybuddy\docs\lessons.md` | lessons.md | **踩坑记录** — 开发过程中的经验教训(待填充) |
| 10 | `g:\ai-studybuddy\docs\buglist.md` | buglist.md | **Bug 追踪** — 已知 Bug 和修复记录(待填充) |
| 11 | `g:\ai-studybuddy\docs\open-source-foundation.md` | open-source-foundation.md | **开源组件装配 SoT** — 组件先行、能力卡、成熟组件清单、AI Provider 边界、接入验收标准 |
| 12 | `g:\ai-studybuddy\docs\dev-environment.md` | dev-environment.md | **本地目录与组件装配规范** — 目录治理、环境变量、composer 调试、备份、日志、tmp、data/day-study 隔离 |

---

## 文档阅读顺序建议

```
PRD.md                    ← 先看产品是什么、做什么
  ↓
ARCHITECTURE.md           ← 再看技术怎么实现
  ↓
dev-rules.md              ← 开发前必须知道的规范
  ↓
frontend-guidelines.md    ← 前端开发时参考
backend-guidelines.md     ← 后端开发时参考
  ↓
test-plan.md              ← 测试时参考
dev-environment.md          ← 明确本地目录、组件装配和备份/日志/tmp/data 规则
open-source-foundation.md  ← 明确开源组件装配 SoT 与搬运边界
  ↓
todo-list.md              ← 按任务顺序开发
  ↓
lessons.md / buglist.md   ← 开发过程中持续记录
```

---

## 快速粘贴版（给另一个项目的 AI）

```
项目：AI StudyBuddy（大学生学习记录与家校共享平台）
技术栈：React Native(Expo) + Node.js/Fastify + PostgreSQL+pgvector + Redis+BullMQ + MinIO
文档根目录：g:\ai-studybuddy\docs

文档列表：
g:\ai-studybuddy\docs\PRD.md                        — 产品需求文档
g:\ai-studybuddy\docs\ARCHITECTURE.md               — 技术架构(模块/DB/API/Pipeline)
g:\ai-studybuddy\docs\dev-rules.md                  — 开发规范(命名/Git/代码约束)
g:\ai-studybuddy\docs\frontend-guidelines.md        — 前端指南(线框图/依赖/交互)
g:\ai-studybuddy\docs\backend-guidelines.md         — 后端指南(Auth/队列/预算/推送)
g:\ai-studybuddy\docs\test-plan.md                  — 测试计划(用例/验收标准)
g:\ai-studybuddy\docs\todo-list.md                  — 任务清单(Phase0开源底座 + Phase1 18任务)
g:\ai-studybuddy\docs\open-source-foundation.md     — 开源底座决策(搬运边界/参考项目)
g:\ai-studybuddy\docs\tutorial-one-sentence-ai-app.md — 开发过程指导(5阶段法)
g:\ai-studybuddy\docs\lessons.md                    — 踩坑记录
g:\ai-studybuddy\docs\buglist.md                    — Bug追踪
```

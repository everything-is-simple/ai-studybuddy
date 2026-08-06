# Phase 1-T04B：S4 错题改错前端闭环实施计划

**版本**：v0.1（待批准）
**日期**：2026-07-16
**任务分支（获批后创建）**：`claude/phase1-t04b-s4-errorfixer-frontend`
**状态**：计划已创建并完成独立自审，等待用户明确批准；批准前不实现任何代码

---

## 1. 目标与完成边界

按 `docs/04` Phase 1-T04B 与 S4 PRD（`docs/subsystems/03-S4-错题改错子系统PRD-ErrorFixer.md`）第 8/10 节，实现：

1. 浏览器可查看错题（列表 + 筛选 + 详情）；
2. 浏览器可从错题发起重做并看到批改结果；
3. 浏览器可在证据可见的前提下标记/恢复掌握状态；
4. 薄弱点可见并能回链到相关错题与知识模块；
5. 集成进已确认考试工作台"查漏补缺"区。

**非目标（本计划明确不做）**：

- 不做 T05 回流规则（错题/薄弱点不反向修改 KnowledgeModule.studyStatus、不影响 StudyTask priorityBucket）；
- 不做 S5 / S6 / S7 任何内容；家长端不读取任何错题正文；
- 不做 AI 错因建议、同类题/变题生成（PRD 列为可选/后续能力）；
- 不做 S3 Worker、不做真实外部 Provider smoke；
- 不修改 S3 既有出题、作答、批改语义；`practice_answers` 仍为只读事实。

---

## 2. 已确认事实（以当前 master 代码为准，2026-07-16 核查）

- migration v5 已建 `mistakes` / `mistake_evidence` / `weak_points`，含唯一索引与 8 个一致性触发器（`packages/backend/src/db/sql/migration-semester-v5.ts`）。
- `ErrorFixerService.archiveIncorrectPracticeAnswers` 已在 S3 submit 事务内幂等归档错题（`practice-runner-service.ts:802`）。
- `mistakes.status` 已支持 `pending_review | needs_review | mastered`，`mastered` 再错会自动回 `needs_review`（服务已实现）。
- shared 已有 `MistakeRecord` / `MistakeEvidenceRecord` / `WeakPointRecord`（标注"非公开 API DTO"）。
- **没有任何 S4 API**：`packages/backend/src/api/` 下无 error-fixer 路由；前端无从消费。
- 前端已有页面/路由模式：`/exams/:examId` 工作台、`/exams/:examId/practice`、`/practice-sessions/:sessionId(/result)`；工作台已有"练习"区卡片模式可复用。

## 2a. 核查发现的 T04A 遗漏（需用户裁决）

对照 PRD T04B 范围"错题列表、详情、错因确认、原题重做和工作台入口"，当前 Schema 有两处缺口：

| 缺口              | 事实                                                                                                    | 影响                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| G1 错因确认无存储 | `mistakes` 表没有错因类别/备注/确认时间字段                                                             | PRD 用户故事"确认错因"无法持久化                                |
| G2 重做证据无类型 | `mistake_evidence.evidence_type` CHECK 只允许 `'practice_error'`；无重做 session 标记、无复制题溯源字段 | "原题重做产生独立、可追溯的批改证据"（PRD 验收第 5 条）无法入库 |

**两个方案，请批准时二选一：**

- **方案 A（推荐）**：本计划包含最小 migration v6（一并批准）：
  1. `mistakes` 增加 `error_cause_category TEXT NULL CHECK(... IN ('concept_unclear','misread','formula_error','step_missing','time_pressure','other'))`、`error_cause_note TEXT NULL`（≤500 字）、`error_cause_confirmed_at TEXT NULL`；
  2. `mistake_evidence.evidence_type` CHECK 扩展为 `('practice_error','redo_correct','redo_incorrect')`（SQLite 重建表迁移，保留数据）；
  3. `practice_sessions` 增加 `session_kind TEXT NOT NULL DEFAULT 'practice' CHECK(IN ('practice','mistake_redo'))` 与 `origin_mistake_id TEXT NULL REFERENCES mistakes(id)`；`questions` 增加 `origin_question_id TEXT NULL`（复制题溯源）。
     理由：PRD 第 5 节明确"MVP 先保证原题重做可用"，第 9 节验收要求重做证据可追溯；不补 Schema 则 T04B 无法达到 PRD MVP 验收。
- **方案 B（保守拆分）**：本轮只做列表/详情/薄弱点/掌握标记 + 工作台入口（现有 Schema 可支撑）；错因确认与原题重做拆为 T04B-2，另立 Schema 计划。代价：docs/04 的 T04B 行"错题重做流程"本轮不能勾选，需拆行登记。

以下第 3–6 节按方案 A 编写；若批准方案 B，则划去 G1/G2 相关条目，其余不变。

---

## 3. 后端范围（前端只消费 API，不直接读 SQLite）

新增 `packages/backend/src/api/error-fixer.ts` + `packages/backend/src/services/error-fixer-query-service.ts`（读取/操作与既有归档服务分离），挂载到 `/api`：

| 端点                                             | 责任               | 关键规则                                                                                                                                                                                                                     |
| ------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/mistakes`                              | 错题列表           | 必填 `semesterId`+`courseInstanceId`；可选 `knowledgeModuleId`、`status` 筛选；默认 `pending_review`/`needs_review` 优先、`latest_error_at DESC`；分页同 knowledge-modules 模式                                              |
| `GET /api/mistakes/:id`                          | 错题详情           | 返回原题（题干/选项/**正确答案/解析**——已批改事实允许展示）、学生原作答、错误次数、状态、错因、证据列表（含每条来源 practice_answer 时间与结果）                                                                             |
| `PATCH /api/mistakes/:id/error-cause`            | 错因确认（G1）     | 类别白名单 + 可选备注；记录确认时间；`pending_review` 确认后进入 `needs_review`                                                                                                                                              |
| `POST /api/mistakes/:id/redo`                    | 发起原题重做（G2） | 事务内创建 `session_kind='mistake_redo'` 的单题 session，复制原题（`origin_question_id` 溯源，不调 AI）；返回作答前 DTO（隐藏答案）                                                                                          |
| `POST /api/practice-sessions/:id/submit`（复用） | 重做提交批改       | 复用现有规则批改；`mistake_redo` 场次不走 `archiveIncorrectPracticeAnswers`（防止复制题生成新 mistake），改写 `redo_correct`/`redo_incorrect` 证据：重做正确→掌握证据；重做错误→`error_count` 不变、保持/回到 `needs_review` |
| `PATCH /api/mistakes/:id/status`                 | 掌握标记           | 仅允许 `needs_review→mastered`（须存在至少 1 条 `redo_correct` 证据或显式 `confirm:true` 学生确认）与 `mastered→needs_review` 手动重开；非法流转返回中文 `MISTAKE_STATUS_INVALID`                                            |
| `GET /api/weak-points`                           | 薄弱点列表         | 必填 `semesterId`+`courseInstanceId`；返回状态、证据计数、关联模块标题、最近时间；可展开证据来源（mistake 短链）                                                                                                             |

约束：全部走标准 `ApiSuccess/ApiError` 信封；学期隔离与既有 API 相同（`semesterId` 校验 + 跨学期 404）；错误消息一律中文；日志不记录题干、答案与完整 UUID。StudyEvent：重做完成写 `mistake_reviewed` 摘要事件（`evidence_ref=mistake:<id>`，不含正文），与 docs/04 T07 预告的事件名一致。

---

## 4. 前端范围

### 4.1 API 封装

`packages/frontend/src/api/error-fixer-api.ts`：上表 7 个端点的类型化封装，复用 `api-client.ts` 信封与错误处理。

### 4.2 页面与路由（复用现有 App.tsx Routes 模式）

| 路由                      | 页面                             | 责任                                                                                                                                                                                                                               |
| ------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/exams/:examId/mistakes` | 错题列表页                       | 按状态/知识模块筛选；待复盘与需复习分区置顶；每项显示题型、模块、错误次数、最近错误时间；空状态文案"当前没有待处理的错题，去练习区做一组题吧"                                                                                      |
| `/mistakes/:mistakeId`    | 错题详情/改错页                  | 原题+我的答案+正确答案+解析（KaTeX 渲染复用现有 markdown 组件）；错因确认表单（类别单选+备注）；证据时间线；"原题重做"按钮 → 创建 redo session 后跳 `/practice-sessions/:sessionId`（复用 S3 作答页，隐藏答案）；掌握标记/重开操作 |
| 工作台 `查漏补缺` 区      | `exam-workbench-page.tsx` 新卡片 | 显示待复盘/需复习计数 + 薄弱点前 3 条 + "进入错题本"入口（仿"练习"区卡片模式）                                                                                                                                                     |
| S3 结果页入口             | `practice-result-page.tsx` 增量  | 有错题时显示"N 道错题已进入错题本"提示与链接；不改变现有结果展示                                                                                                                                                                   |

薄弱点展示：并入错题列表页顶部区块（模块名、证据数、最近时间、点击过滤该模块错题），不单开路由，控制范围。

### 4.3 状态与交互规则

- 重做作答页复用 `practice-session-page.tsx`（redo session 即标准 session，作答前 DTO 天然隐藏答案）；结果页对 `mistake_redo` 场次显示"返回错题详情"导航。
- 所有加载/失败/空状态均有中文提示；操作失败在当前卡片附近内联展示错误，不弹全局遮罩。
- 学期上下文沿用现有 semesterId 机制；URL 直接刷新可恢复（与 T11/T03D 同规则）。

---

## 5. 实施步骤（获批后）

1. 从最新 `master` 建分支 `claude/phase1-t04b-s4-errorfixer-frontend`；
2. （方案 A）migration v6 + 迁移升级测试（fresh v6 / v5→v6 保数据）；
3. 后端查询/操作服务 + API 路由 + 集成测试 `packages/backend/test/error-fixer-api.test.mjs`（不 mock DB）；
4. redo 提交与归档旁路的回归测试（重做错误不新建 mistake、不重复计数）；
5. 前端 API 封装 + 列表/详情页 + 工作台/结果页入口 + 组件测试；
6. e2e：`e2e/error-fixer.spec.ts`（Playwright，隔离 `APP_DATA_ROOT`）覆盖：做错题→列表出现→确认错因→原题重做（先错一次→仍需复习；再对一次→标记掌握）→刷新读回→薄弱点展示；
7. 更新 `docs/04`（勾选 T04B 已验证子项+收尾证据）、必要时 `docs/00`；
8. 全量验证 → 合并 master → master 复验 → push origin/master。

## 6. 验证计划

| 命令                                                                                       | 要求                                                         |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `pnpm type-check`                                                                          | 零错误                                                       |
| `pnpm -r --filter backend run build`、`pnpm -r --filter @ai-studybuddy/frontend run build` | 通过                                                         |
| `pnpm test`                                                                                | 全量通过（后端现 142 基线 + 新增；前端 37 基线 + 新增）      |
| `APP_DATA_ROOT=I:\ai-studybuddy-tmp\runs\phase1-t04b-e2e npx playwright test`              | 既有 3 条 + 新增 error-fixer spec 全过                       |
| `scripts/check-docs-governance.ps1`、`git diff --check`                                    | 通过                                                         |
| 浏览器人工验收                                                                             | 空状态、成功路径、重做失败路径、刷新保持、证据目录仓库外留存 |

## 7. 交付说明必含

当前分支 / 任务分支名 / 提交哈希 / 是否合入 master / 是否推送 origin/master / docs/04 更新位置 / 验证命令与结果 / 未实现边界（T05 回流、AI 错因建议、同类题变题、S5-S7）。

---

## 8. 独立自审

| 检查点                           | 结论                                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 是否只做 T04B 计划、未提前写代码 | ✅ 本轮仅产出本计划文件                                                                                              |
| 是否擅自修改 Schema              | ✅ 未修改；G1/G2 为核查证实的 T04A 遗漏，已按"另行说明+用户裁决"处理（方案 A/B 二选一）                              |
| 是否触碰未来模块                 | ✅ T05/S5/S6/S7 均列入非目标；`mistake_reviewed` 事件仅按 S1 既有 StudyEvent 通道写摘要                              |
| 是否与 S4 PRD 一致               | ✅ 状态机（待复盘→需复习→已掌握→再错重开）、答案提交前隐藏、多证据薄弱点、掌握需证据、隐私边界均对齐 PRD 第 3/6/9 节 |
| 与 S3 入口关系是否清楚           | ✅ 只读 `practice_answers` 事实；redo 复用 S3 session/submit 通道但以 `session_kind` 隔离归档旁路，不改 S3 语义      |
| 学期隔离                         | ✅ 全部 API 必填 semesterId，跨学期 404，测试覆盖                                                                    |
| 中文错误提示                     | ✅ API 错误码+中文消息；前端内联展示                                                                                 |
| 测试/治理/diff 检查              | ✅ 第 5/6 节已含                                                                                                     |
| 风险点                           | redo 旁路若漏判 `session_kind` 会重复建错题——已列专项回归测试；SQLite CHECK 扩展需重建表迁移——已列 v5→v6 保数据测试  |

## 9. 批准记录

- 2026-07-16：计划创建并自审完毕，等待用户明确批准（含方案 A/B 选择）。批准前不进入实现。
- 2026-07-16：用户批准**收窄版方案 A**，边界如下：
  1. migration v6 只补 T04B 必需字段/约束：mistakes 错因最小字段；mistake_evidence 扩展 `redo_correct`/`redo_incorrect`；`mistake_redo` session 类型与溯源字段只服务 S4 原题重做，不引入 T05 回流；
  2. 必须补 S4 后端 API（前端不得直读 SQLite）；
  3. 不实现 T05 回流规则；不触碰 S5/S6/S7；不做真实外部 Provider smoke；不提交真实 Key/Provider URL/正式数据；
  4. docs/04 记录为 T04B 前端闭环中的"Schema/API 补洞"，不回改 T04A 完成事实；
  5. 实现前先补充自审确认未扩大范围。

## 10. 批准后补充自审（收窄版方案 A 范围核对）

| 核对项                      | 结论                                                                                                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v6 字段是否全部为 T04B 必需 | ✅ 错因三字段（类别/备注/确认时间）服务"错因确认"界面；证据类型扩展服务"重做证据入库"；`session_kind`+`origin_mistake_id`+`origin_question_id` 仅用于 redo 溯源与归档旁路判定。无任何字段服务 T05 优先级回流、S6 报告或 S5 冲刺 |
| 是否有多余端点              | ✅ 7 组端点均一一对应 PRD 第 8 节产品界面；无导出、无统计聚合（S6 范围）、无排程（T05 范围）                                                                                                                                    |
| redo 是否改变 S3 语义       | ✅ 复用 create/submit 通道；普通 practice 场次行为完全不变；`mistake_redo` 场次仅旁路 archiveIncorrectPracticeAnswers 改写 redo 证据                                                                                            |
| StudyEvent 是否越权         | ✅ 仅新增 `mistake_reviewed` 摘要事件走 S1 既有通道（docs/04 T07 已预告该事件名），不实现 T07 的过滤/展示                                                                                                                       |
| 前端是否直读数据            | ✅ 全部经 error-fixer-api.ts → 后端 API                                                                                                                                                                                         |
| 文档更新是否符合边界 7      | ✅ docs/04 只在 Phase 1-T04B 行登记完成与"含 T04A 遗漏的 Schema/API 补洞（migration v6）"字样；T04A 行及其收尾证据不改动                                                                                                        |

结论：范围与收窄版批准一致，未扩大。开始实现。

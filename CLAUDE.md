# CLAUDE.md

**Version**: v1.12
**Updated**: 2026-07-25

This file is the Claude Code entry point for the current main repository (`H:\ai-studybuddy` on this development machine; use `<repo-root>` for cross-machine rules). The complete tool-neutral collaboration rules live in `docs/12-开发规范-Dev-Rules.md`.

## 当前状态

AI StudyBuddy 是中文优先的个人学习助手，采用“共同底座 + 七个场景子系统（S1–S7）”。当前事实：

- Phase 0.8 已完成，S1 基础与 S2 核心已在主仓库实现并通过 T09 隔离复验。
- S1–S6（除 S7）相关 PRD 已按门禁建立；Phase 1 学习闭环、学生端产品化、配置中心和维护任务均已完成主线复验并推送 `origin/master`。Phase 2-T01–T06 也已完成主线复验并推送：包含 S5 模拟考、确定性只读临考速背、确定性即时只读冲刺计划和考试工作台冲刺区；T04/T05/T06 不新增持久化 `CramPlan`、StudyEvent、Worker 或真实 AI 调用。POST-PHASE2 全系统验证、完整 E2E、文档对齐与主线复验均已完成并推送 `origin/master`；开发机 Windows 原生 + Node 24 基线已验证，但用户电脑安装运行仍待实机验收。Phase 3 按用户要求暂缓；S7 产品接入尚未开始，外部候选能力证据不等于 Schema、Adapter、API、Worker、前端或用户机完成，S3 Worker 不属于当前 MVP。
- 后端、前端、shared 三个 workspace 包已存在；不要再按“无业务代码”处理。
- AI Provider Router 已支持多 Provider 优先级故障转移，并已在 Phase 1-T02 完成连续失败熔断、10 分钟冷却、恢复探测和脱敏日志。
- KaoBuddy 只可作为产品组织方式参考，不复制源码、视觉、文案或资产。

## 每次任务必读

1. `docs/00-文档索引-Index.md`
2. `docs/04-开发任务清单-Todo-List.md`
3. 与任务相关的 PRD / `docs/08` / `docs/10` / `docs/11`
4. `docs/12-开发规范-Dev-Rules.md`

开工前必须在 `docs/04` 找到当前任务和“Phase 1 行动计划索引”。任务未登记时先登记；计划尚未创建或未获批准时，不得直接进入实现。

产品事实以 `docs/01` 和 `docs/02` 为准；旧备份和外部参考项目不是 SoT。

## 常用命令

```powershell
# 状态检查
git status --short --branch

# 文档治理
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check

# 工程验证
pnpm type-check
pnpm -r --filter backend run build
pnpm -r --filter @ai-studybuddy/frontend run build
pnpm test

# 后端开发：写数据前先设置隔离目录
$env:APP_DATA_ROOT = 'H:\ai-studybuddy-tmp\runs\<task-id>'
pnpm -r --filter backend run dev
```

`<task-id>` 是占位符，不得原样执行。真实 Provider 验证必须脱敏记录，不提交密钥、正文、完整 URL 或完整 UUID。

## Git 工作流硬规则

- `master` 只代表已集成、已验证、且 `docs/04` 状态同步的事实；不得把“分支已完成”说成“master 已完成”。
- 每个任务先从最新 `master` 创建任务分支：Codex 用 `codex/<work-id>-<scope>`，Claude 用 `claude/<work-id>-<scope>`，人工可用 `human/<work-id>-<scope>`；`work-id` 可为 `phase1-t03a`、`process`、`hotfix` 等，示例：`claude/phase1-t03a-s3-schema`、`claude/process-git-workflow`。
- 任务分支可以推送远端作备份或审查，但这不等于完成。完成判定必须以合回 `master` 后的代码、文档和验证结果为准。
- 分支合回 `master` 前必须：实现范围已完成、测试/构建/治理检查通过、`docs/04` 勾选并登记证据、无越权文件。
- 合并流程固定：`git checkout master` → `git pull --ff-only origin master` → 将任务分支 rebase 到最新 `master` → `git checkout master` → `git merge --ff-only <task-branch>`；不能快进或有冲突时停下，不强行合并。
- 合并后必须在 `master` 重新运行要求的验证，再 `git push origin master`。只有 `origin/master` 包含该提交后，才可向用户报告任务完成。
- 交付说明必须写清：任务分支名、提交哈希、是否已合并 `master`、是否已推送 `origin/master`、`docs/04` 更新位置。

## 文档门禁

新增设计文档前必须：读 `docs/00` → 查文档是否已存在 → 查触发条件 → 未满足则不创建 → 满足才按 `NN-中文标题-English-Title.md` 创建 → 同步更新索引 → 运行治理检查。

当前门禁状态：

- S1、S2：已创建并实现 MVP，不重建。
- S3：PRD 与 T03A–T03D 全部完成（Schema、练习生成 API、限时作答/规则批改、前端闭环）；Worker 仍未开始。
- S4：PRD、T04A 归档与 Schema、T04B 错题改错前端闭环（含 migration v6 与 S4 API）和 T05 回流规则已完成。
- S5：Phase 2 触发。
- S6：PRD、T06A 家长报告生成和 T06B 推送渠道均已完成；采用冻结脱敏快照、渠道级去重/重试与失败隔离，真实渠道 smoke 不作为常规验证依赖。
- S1 时间线：T07 已完成，考试工作台可读取当前课程近期活动。
- 本机配置中心：T08 已完成，支持 DPAPI 加密存储、AI/SMTP/飞书连接测试、运行时热切换、loopback API 防护和前端设置页；真实渠道 smoke 不作为常规验证依赖。
- 学生端产品化：T09A 学期创建/选择/切换、T09B 每日首页、T09C 课程课表/考试目标、T09D 全局导航与学生旅程 E2E、T09E 练习历史与学期归档均已完成、通过主线复验并推送 `origin/master`；Phase 1 学生端可交付 MVP 已形成。
- S7：Phase 1.5 触发。

## 精简 16 步流程

1. 读文档定边界。
2. 检查文档门禁。
3. 写 `.plans/` 计划。
4. 做独立计划审查。
5. 修订并取得用户明确批准。
6. 拆分任务逐项实现。
7. 编写或更新测试。
8. 跑 `pnpm type-check`。
9. 跑相关 build。
10. 跑测试。
11. 做 smoke / 浏览器验收。
12. 独立审查并修复。
13. 更新任务清单和文档。
14. 跑文档治理。
15. 跑 diff 检查。
16. 提交并交付说明。

详细分支、worktree、多 Agent、浏览器验收和隐私规则见 `docs/12-开发规范-Dev-Rules.md`。

## 禁止事项

- 不凭记忆新建文档。
- 不从旧 zip 或参考项目恢复旧稿到 `docs/`。
- 不把真实密钥、资料原文、Provider URL、完整 UUID 或正式数据提交进仓库。
- 不硬编码盘符路径到业务代码；路径必须走 `paths.ts`，环境变量走 `env.ts`。
- 不提前实现或勾选未批准的 Phase 1 后续任务。

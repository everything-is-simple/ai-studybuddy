# CLAUDE.md

**Version**: v1.1
**Updated**: 2026-07-16

This file is the Claude Code entry point for `I:\ai-studybuddy`. The complete tool-neutral collaboration rules live in `docs/12-开发规范-Dev-Rules.md`.

## 当前状态

AI StudyBuddy 是中文优先的个人学习助手，采用“共同底座 + 七个场景子系统（S1–S7）”。当前事实：

- Phase 0.8 已完成，S1 基础与 S2 核心已在主仓库实现并通过 T09 隔离复验。
- S1、S2、S3 PRD 已存在；S3 业务代码尚未开始，S4–S7 仍未触发。
- 后端、前端、shared 三个 workspace 包已存在；不要再按“无业务代码”处理。
- AI Provider Router 已支持多 Provider 优先级故障转移，并已在 Phase 1-T02 完成连续失败熔断、10 分钟冷却、恢复探测和脱敏日志。
- KaoBuddy 只可作为产品组织方式参考，不复制源码、视觉、文案或资产。

## 每次任务必读

1. `docs/00-文档索引-Index.md`
2. `docs/04-开发任务清单-Todo-List.md`
3. 与任务相关的 PRD / `docs/08` / `docs/10` / `docs/11`
4. `docs/12-开发规范-Dev-Rules.md`

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
$env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\<task-id>'
pnpm -r --filter backend run dev
```

`<task-id>` 是占位符，不得原样执行。真实 Provider 验证必须脱敏记录，不提交密钥、正文、完整 URL 或完整 UUID。

## 文档门禁

新增设计文档前必须：读 `docs/00` → 查文档是否已存在 → 查触发条件 → 未满足则不创建 → 满足才按 `NN-中文标题-English-Title.md` 创建 → 同步更新索引 → 运行治理检查。

当前门禁状态：

- S1、S2：已创建并实现 MVP，不重建。
- S3：PRD 已创建；业务代码尚未开始，下一实现任务 T03A 仍需独立计划和明确批准。
- S4：等 S3 MVP 完成后触发。
- S5：Phase 2 触发。
- S6：Phase 1 后期准备正式家长报告前触发。
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

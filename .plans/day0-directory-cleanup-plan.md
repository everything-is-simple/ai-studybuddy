# 目录清理计划 - Day 0

## 目标

回收约 13-15 GiB 空间，建立清洁基线

## 清理项目

### 1. H:\ai-studybuddy-tmp\runs 旧运行根（优先级最高）

- **当前状态**：157个运行根，约10.74 GiB
- **保留策略**：
  - 保留 2026-07-30 的所有运行根
  - 保留包含 "validation"、"evidence"、"candidate"、"release" 的运行根
  - 删除 2026-07-28 及之前的其他运行根
- **预期回收**：~8-9 GiB

### 2. 16个已合入主线的干净worktree

已验证以下worktree的HEAD是master的祖先，且工作树干净：

```
alpha-20260727-day1-baseline-remediation
phase3-complete-task-breakdown
phase3-p1-r1-r2-controlled-readonly-implementation
phase3-p1-r1-r2-minimal-plan
phase3-pause-at-t02g
phase3-personal-minimum-rebaseline
phase3-t02-common-trusted-approval-nofollow-implementation
phase3-t02-production-trust-anchor-release-integrity
phase3-t02-production-trust-anchor-release-integrity-plan
phase3-t02-security-privacy-baseline-audit-plan
phase3-t02a-production-attack-surface-error-boundary-plan
phase3-t02b-subprocess-environment-boundary
phase3-t02g-master-integration-docs
phase3-t02g-windows-data-acl-backup-restore-implementation
phase3-task-count-clarification
process-docs04-phase3-worktree-cleanup-20260725
```

- **操作**：使用 `git worktree remove <name>`，保留分支引用
- **预期回收**：~2-3 GiB

### 3. H:\ai-studybuddy-composer 可重建依赖

- `windows-native\.venv`（Python虚拟环境）
- `windows-native\node_modules`（Node依赖）
- **预期回收**：~500 MiB

### 4. 主仓 node_modules（可选）

- 可重建，删除后需 `pnpm install`
- **预期回收**：~349 MiB

## 执行顺序

1. tmp/runs 旧运行根（最大收益）
2. 16个干净worktree
3. composer可重建依赖
4. （可选）主仓node_modules

## 安全规则

- 先生成精确白名单，你批准后执行
- worktree只用 `git worktree remove`，不手工删除
- 每批次后检查主仓git状态
- 不删除data、runtime、backup目录

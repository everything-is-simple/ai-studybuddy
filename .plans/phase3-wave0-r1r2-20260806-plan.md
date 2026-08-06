# T02-R1/R2（Wave 0）正式证据基线实施计划

**计划编号**：PHASE3-WAVE0-R1R2-20260806
**状态**：📝 已创建并完成自审；等待用户实施确认（用户已于 2026-08-06 指示"进入 B：Phase 3 高权重恢复"并授予全权执行）
**日期**：2026-08-06
**上游计划**：`PHASE3-REOPEN-HIGH-WEIGHT-20260728`（Wave 0）、`.plans/phase3-t02d-secret-scan-deployment-package-plan.md`（T02D 合成边界）、`.plans/phase3-t02g-windows-data-acl-backup-restore-plan.md`（T02G 只读 ACL 契约）

## 1. 目标

完成 Wave 0 两个正式证据基线任务，产出**只读、脱敏、可签收**的证据：

- **T02-R1**：对当前正式仓库（Git 已跟踪文件清单）与已批准候选部署包（`H:\AIStudyBuddy-v0.8.1-win64`）执行受控秘密扫描并形成签收结论。
- **T02-R2**：对开发机（当前 Windows 机器）逻辑数据目录 `config/data/logs/backups/tmp/models` 做**只读** ACL 采证，输出脱敏风险结论与是否需要最小 ACL 修复的建议。

## 2. 范围边界（严格遵守）

### T02-R1 扫描输入（白名单）
1. Git 已跟踪文件清单（`git ls-files`）——不扫描未跟踪、被忽略或仓库外路径。
2. 已批准候选部署包根：`H:\AIStudyBuddy-v0.8.1-win64`（manifest 确认：`H:\AIStudyBuddy-v0.8.1-win64\deployment-manifest.json` 存在，8 月 3 日构建）。
3. 交叉引用候选：`H:\ai-studybuddy-runtime\AIStudyBuddy-v0.8.0-win64.zip` 的 **SHA-256 短指纹**（仅记录短指纹，不展开扫描旧包）。

**明确排除**：`H:\ai-studybuddy\.trae-html-share-packages` 与 `H:\ai-studybuddy\alpha-sprint-plan`（已确认不存在）；整个工作区递归、用户目录、未知目录、`.env.local`、node_modules。

### T02-R2 采证范围
- 逻辑数据根：开发机 `APP_DATA_ROOT` 下的 `config/`、`data/`、`logs/`、`backups/`、`tmp/`、`models/`（存在者采证）。
- 只读操作：`Get-Acl` / 目录遍历，**绝不**执行 `Set-Acl`、`icacls` 修改、owner/DACL/SACL/继承变更。
- 脱敏主体分类固定为：当前交互用户、当前用户计划任务、SYSTEM、Administrators、其他本地用户、未知主体、deny ACE、继承状态、有效访问未知。**不记录**完整用户名、完整 SID、ACL 原文、绝对宿主路径。

## 3. 输出（脱敏证据）

- 扫描/采证结果只含：规则名、经审核的程序相对路径或稳定文件 ID/逻辑类别、脱敏指纹（短哈希）、错误码、耗时、摘要。
- **绝不输出**：秘密值、原始资料、完整 UUID、绝对宿主路径、Provider 原始响应、原始终端 transcript、PowerShell 原始命令、ACL 原文/完整 SID、环境变量行、manifest 原文。
- 证据文件存入 `.plans/evidence/`（提交）与仓库外 `H:\ai-studybuddy-tmp\runs\phase3-wave0-<date>/`（原始输出）。

## 4. 实施步骤

1. T02-R1：使用 `scripts/lib/AIStudyBuddy.SecretScan.cjs` 对 Git 已跟踪清单扫描；对部署包根按文件遍历复用同一扫描逻辑（包内文件清单，不展开 node_modules）。
2. T02-R1 签收：记录 artifact ID、构建提交短哈希（deployment-manifest 的 builtAt / 包内容与 master 比对）、包 SHA-256 短指纹、批准时间窗口、命中数与人工复核结论。
3. T02-R2：PowerShell 只读采证脚本遍历六个目录，输出固定脱敏主体分类 + 可写范围 + reparse 风险；生成风险结论与是否需要最小修复的建议。
4. 两个任务均产出 `summary.json` + 脱敏 markdown 证据。
5. 独立审查（fresh）→ 验证 → docs/04 登记 → 治理检查 → 提交 → 合入 master → 推送。

## 5. 非目标

- 不执行任何 ACL 写入、Firewall、组策略、注册表或永久安全策略修改。
- 不扫描未跟踪路径、用户目录或未知目录。
- 不做 T02-R3（真实 backup/restore）、T04-3（真实恢复写入）、T05 日志验收（后续 Wave）。
- 不宣称 Phase 3、T02 总体或用户电脑验收完成。

## 6. 验证

- 扫描/采证脚本退出码 0；证据文件经人工抽查无秘密值/完整 UUID/绝对路径/ACL 原文。
- `pnpm type-check`（若涉及脚本变更）、文档治理、`git diff --check`。

## 7. 交付

- docs/04 更新 T02-R1/T02-R2 状态为"已签收/已完成（Wave 0）"，登记验证证据。
- 交付说明写清：分支、提交、是否推送、证据位置、未完成边界（Wave 1-4 后续）。

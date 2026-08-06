# Phase 3 Wave 2 T04-3 选项 C：部署格式隔离安装根真实模拟演练证据

**日期**：2026-08-06
**计划**：`.plans/phase3-wave2-t043-target-20260806-plan.md`
**安装根**：`H:\ai-studybuddy-tmp\runs\phase3-wave2-real-sim-20260806-190858`（隔离，非真实数据）
**方式**：选项 C——部署格式隔离安装根 + 真实服务进程（node server.js + PID 文件 + 端口监听 + production.env），不触碰 `H:\AIStudyBuddy` 真实数据。

## 1. 演练环境

- 安装根结构：`app/backend`（编译产物）+ `app/scripts`（部署脚本）+ `config/production.env`（`APP_DATA_ROOT=<根>/data`、`BACKEND_PORT=31123`）+ `data/` + `logs/` + `run/` + `backups/`
- 服务：`node packages/backend/dist/server.js`（真实编译产物，health 校验 `0.8.1`）
- 数据：隔离根 `data/studybuddy.db`（服务启动初始化，6 表）

## 2. 演练过程与结果

| 步骤 | 操作 | 结果 |
|---|---|---|
| 1 | `backup-data.ps1` 备份（服务停止） | ✅ `BACKUP_CREATED files=1`（studybuddy.db 57344B，manifest v2 + SHA-256） |
| 2 | 启动服务 | ✅ health `{"success":true,"version":"0.8.1"}`，PID 20548 |
| 3 | **服务运行中恢复** | ✅ `RESTORE_WRITERS_ACTIVE` 拒绝（核心门禁） |
| 4 | 停止服务 → 篡改全局库（400 字节写 0xAA） | ✅ 服务停止确认、数据损坏 |
| 5 | `restore-data.ps1 -EnableWrite` 恢复 | ✅ 8 步状态序列全通过 → `RESTORE_COMPLETED files=1` |
| 6 | 恢复后验证 | ✅ integrity=ok、6 表完好 |
| 7 | 恢复后重启服务 | ✅ health `{"success":true,"version":"0.8.1"}`（数据可正常服务） |

状态序列：`PREWRITE_APPROVED → WRITERS_QUIESCED → PRECHECK_PASSED → RECOVERY_POINT_VERIFIED → STAGING_WRITTEN_AND_VERIFIED → CUTOVER_IN_PROGRESS → POST_RESTORE_VERIFICATION → RESTORE_COMPLETED`

## 3. 过程中发现并修复的缺陷

1. **PS 5.1 单元素数组解包 bug**（`scripts/lib/AIStudyBuddy.Deployment.psm1`）：
   - `Get-AIStudyBuddyValidatedBackup` 中 `$payloadFiles.Count -ne $validated.Count` 在单文件备份时失效（单元素数组被 PS 解包为标量，Count 比较异常 → 误报 `RESTORE_PAYLOAD_INVALID`）。
   - 修复：`@($payloadFiles).Count` 强制数组计数。

2. **端口误判 bug**（`scripts/restore-data.ps1`）：
   - WRITERS_QUIESCED 默认检查 3000 端口，本机 3000 被无关进程占用 → 误判 `RESTORE_WRITERS_ACTIVE`。
   - 修复：端口从本安装实例 `config/production.env` 的 `BACKEND_PORT` 读取，避免误判其他进程。

## 4. 结论

T04-3 目标机演练前置（选项 C）在部署格式隔离安装根 + 真实服务进程下全部通过：备份、服务运行中写入保护、停止后受控恢复、恢复后数据完好与服务重启。持久化状态机（状态文件 + 中断标记 + 重启默认拒绝 + CUTOVER）验证完成。

**边界**：仍未对真实 `H:\AIStudyBuddy` 执行任何写入；真实目标机写入须用户精确批准 + R3-prewrite 独立签收。

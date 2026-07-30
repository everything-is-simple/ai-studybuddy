# Phase 3 T04：数据耐久性三项关键改进——实施计划

**计划编号**：PHASE3-T04-DATA-DURABILITY
**状态**：📝 已创建，待独立审查与用户批准
**创建日期**：2026-07-30
**任务分支**：`codex/phase3-t04-data-durability`（待创建）
**授权背景**：用户于 2026-07-30 明确要求实施 T04-3（启用恢复写入）、T04-1（自动定期备份）和 T04-2（启动时数据库完整性检查），不再实施其余 Phase 3 项目。

---

## 1. 目标与范围

### 1.1 目标

在不扩大产品边界、不引入 Phase 3 其余 15 项的前提下，将系统数据耐久性从"脆弱"提升至"基本可靠"：
- 数据库损坏时系统能立即发现（T04-2）
- 数据自动定期备份，不依赖用户记住手动操作（T04-1）
- 备份能在需要时实际恢复（T04-3）

### 1.2 本轮范围

| 项目 | 改动文件 | 说明 |
| ---- | -------- | ---- |
| T04-2 | `packages/backend/src/bootstrap.ts` | 启动时对全局库和全部活跃学期库执行 integrity_check；损坏时拒绝启动并输出明确错误 |
| T04-2 | `packages/backend/src/db/connection.ts` | 新增 `getAllActiveSemesterDbPaths()` 函数 |
| T04-1 | `scripts/schedule-auto-backup.ps1` | 新建：注册 Windows 计划任务，每日自动执行 `backup-data.ps1` |
| T04-1 | `scripts/remove-auto-backup.ps1` | 新建：注销自动备份计划任务 |
| T04-3 | `scripts/restore-data.ps1` | 移除 `RESTORE_WRITE_DISABLED` 硬拒绝，实现受控恢复写入 |

### 1.3 严格非范围

- 不实施 T01、T02-R1~R6、T03、T05、其余 Phase 3 项目
- 不改变数据库 Schema、API、前端
- 不引入新的 npm 依赖
- 不修改部署包构建流程
- 不执行真实备份/恢复操作（仅改代码，不写数据）
- 不读取真实密钥、资料或运行数据

---

## 2. 逐项设计

### 2.1 T04-2：启动时数据库完整性检查

**设计**：在 `bootstrapBackend()` 中，`app.listen()` 之前执行完整性检查。

```
bootstrapBackend() 流程变更：
  initializeConfiguration()
  → migrateReadySemesters()
  → createApplication()
  → STARTUP INTEGRITY CHECK（新增）
    ├── checkDatabaseIntegrityAtPath(globalDbPath) → "ok" 或错误
    ├── 遍历活跃学期 → checkDatabaseIntegrityAtPath(semesterDbPath)
    ├── 全部 ok → 继续
    └── 任一失败 → 输出明确错误，拒绝启动（process.exitCode=1）
  → worker.startPolling()
  → app.listen()
```

**错误输出**：
```
[DATABASE] STARTUP_INTEGRITY_FAILED scope=global detail=...
[DATABASE] STARTUP_INTEGRITY_FAILED scope=semester semesterId=<id> detail=...
[DATABASE] STARTUP_INTEGRITY_ALL_FAILED count=N
```

**安全考虑**：
- 只读检查（`openReadOnlyExistingDbAtPath`），不修改数据库
- 检查失败时拒绝启动，不尝试自动修复
- 不输出数据库路径、学期名或资料信息

### 2.2 T04-1：自动定期备份

**设计**：新增 PowerShell 脚本，将 `backup-data.ps1` 注册为 Windows 计划任务。

**`schedule-auto-backup.ps1`**：
- 参数：`-InstallRoot`（安装根）、`-OutputRoot`（备份输出目录）、`-ScheduleTime`（默认 22:00）
- 创建 Windows 计划任务 `AIStudyBuddy-AutoBackup`，每日触发
- 任务以当前用户身份运行，最低权限
- 设置并发互斥（不重复触发）
- 输出：任务名称、触发器、下次运行时间

**`remove-auto-backup.ps1`**：
- 参数：`-InstallRoot`
- 注销 `AIStudyBuddy-AutoBackup` 计划任务
- 输出：确认已注销

**安全考虑**：
- 不写入或读取密钥
- 输出不包含绝对路径或资料名
- 备份失败时计划任务仍会记录错误（通过 `backup-data.ps1` 的错误输出）

### 2.3 T04-3：启用恢复写入

**设计**：修改 `restore-data.ps1`，移除 `RESTORE_WRITE_DISABLED` 硬拒绝，实现受控恢复。

**前提条件门禁**（恢复前必须满足）：
1. 服务已停止（检查 PID 文件和端口监听）
2. 备份已通过完整性验证（manifest/hash）
3. 备份不在目标目录内
4. 目标目录无 reparse point

**恢复流程**：
```
1. 验证前提条件（服务停止、备份有效）
2. 创建 recovery point（复制当前 data 目录到 backups/recovery-<timestamp>）
3. 停止自动备份计划任务（如存在）
4. 复制 payload 到目标 data 目录
5. 验证恢复后数据库完整性
6. 输出恢复结果
7. 提示用户手动重启服务
```

**错误处理**：
- 前提条件不满足 → 拒绝恢复，输出具体原因
- 恢复过程中断 → 已有 recovery point，可回滚
- 恢复后完整性失败 → 报告错误，指出 recovery point 路径

**安全考虑**：
- 不输出绝对路径（用逻辑根标识）
- 不输出数据库内容或资料名
- 恢复后不自动启动服务（需用户确认）

---

## 3. 测试计划

### T04-2 测试

| 测试 | 方法 |
| ---- | ---- |
| 正常数据库启动时完整性检查通过 | 集成测试：创建隔离数据库，启动后端，验证 health |
| 损坏数据库拒绝启动 | 集成测试：创建隔离数据库，写入垃圾数据，验证启动失败 |
| 缺失学期库不影响启动 | 集成测试：删除一个学期库文件，验证启动仍成功但记录 warning |
| 全局库损坏拒绝启动 | 集成测试：损坏全局库，验证启动失败 |

### T04-1 测试

| 测试 | 方法 |
| ---- | ---- |
| 注册计划任务 | PowerShell 测试：在隔离环境注册，验证任务存在 |
| 注销计划任务 | PowerShell 测试：注销刚注册的任务，验证任务不存在 |
| 重复注册不覆盖 | PowerShell 测试：注册两次，验证第二次拒绝 |

### T04-3 测试

| 测试 | 方法 |
| ---- | ---- |
| -WhatIf 验证不写入 | PowerShell 测试：验证输出 `RESTORE_VALIDATED_NO_WRITE` |
| 服务未停止时拒绝恢复 | PowerShell 测试：模拟运行中状态，验证拒绝 |
| 正常恢复流程 | 集成测试：在隔离环境完整执行恢复，验证数据一致 |
| 恢复后完整性检查 | 集成测试：恢复后验证数据库 integrity_check |

---

## 4. 验证步骤

1. `pnpm type-check`
2. 后端 build
3. 新增测试通过
4. 全量 `pnpm test` 通过（隔离 `APP_DATA_ROOT`）
5. 文档治理检查通过
6. `git diff --check` 通过
7. 浏览器验收（启动、health、数据读回）

---

## 5. 非范围确认

- 不实施 T01、T02-R1~R6、T03、T05
- 不修改数据库 Schema、API 路由、前端页面
- 不创建新的 npm 依赖
- 不执行真实备份/恢复操作
- 不读取真实密钥、资料或运行数据
- 不宣称 Phase 3 完成
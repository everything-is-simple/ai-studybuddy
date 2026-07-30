# 目标机安装检查清单

**部署包**：H:\ai-studybuddy-runtime\deploy-output
**目标机器**：HP Pavilion Aero (Windows 11)
**版本**：v0.8.0 + Node 24修复 + T04数据加固

## 安装前准备

### 1. 软件前置条件
- [ ] Node.js 24 LTS x64（必需）
- [ ] Python 3.10+ x64（必需）
- [ ] 网络可访问 npm registry（用于安装依赖）
- [ ] 至少 2GB 可用磁盘空间

### 2. 准备测试材料
- [ ] 纯文本资料 1份
- [ ] PDF 文件 1份（文字版，非扫描）
- [ ] 清晰图片 1张（用于OCR测试）
- [ ] 有效的 AI Provider 配置（1组即可）

## 安装步骤（A01-A06）

### A01: 部署包验证
```powershell
cd H:\ai-studybuddy-runtime\deploy-output
Get-FileHash -Path deployment-manifest.json
```
- [ ] manifest 文件存在
- [ ] 不含 .git、node_modules、真实env

### A02: Node/Python版本
```powershell
node --version  # 应显示 v24.x.x
python --version  # 应显示 3.10.x 或更高
```
- [ ] 版本记录：Node = _______ , Python = _______

### A03: Bootstrap
```powershell
$installRoot = "$env:LOCALAPPDATA\AIStudyBuddy"
.\scripts\bootstrap-runtime.ps1 -InstallRoot $installRoot -AppSource .\app -PythonPath "C:\Path\To\python.exe"
```
- [ ] 生产依赖安装成功
- [ ] Python venv 创建完成
- [ ] OCR 依赖安装成功

### A04: Installation Check
```powershell
.\scripts\check-installation.ps1 -InstallRoot $installRoot
```
- [ ] 必要文件检查通过
- [ ] 运行时检查通过
- [ ] 无敏感信息泄漏

### A05: Start/Health
```powershell
.\scripts\start-production.ps1 -InstallRoot $installRoot
```
- [ ] 仅监听 127.0.0.1:3000
- [ ] 浏览器打开 http://127.0.0.1:3000
- [ ] /api/health 返回成功

### A06: Stop/Residue
```powershell
.\scripts\stop-production.ps1 -InstallRoot $installRoot
```
- [ ] 停止成功
- [ ] 无残留 Node/Python 进程

### A07: 重启读回
```powershell
.\scripts\start-production.ps1 -InstallRoot $installRoot
```
- [ ] 重启后学期/课程数据仍可读

### A08: 备份
```powershell
.\scripts\backup-data.ps1 -InstallRoot $installRoot -OutputRoot H:\test-backup
.\scripts\test-data-integrity.ps1 -BackupPath H:\test-backup\backup-*
.\scripts\restore-data.ps1 -InstallRoot $installRoot -BackupPath H:\test-backup\backup-* -WhatIf
```
- [ ] 备份创建成功
- [ ] 完整性检查通过
- [ ] restore -WhatIf 通过

### A09: 空状态/错误
- [ ] 新安装页面不白屏
- [ ] 配置缺失显示中文提示
- [ ] 接口失败不显示英文stack/秘密/绝对路径

## 核心业务流程（B01-B11）

### B01: 学期与课程
- [ ] 创建学期成功
- [ ] 创建课程成功
- [ ] 设置考试目标
- [ ] 刷新后数据保持

### B02: 学习首页/时间线
- [ ] 当前学习聚合可达
- [ ] 时间线可达
- [ ] 跨学期隔离正确

### B03: 资料导入
- [ ] 纯文本导入成功
- [ ] PDF 导入成功
- [ ] 图片 OCR 成功
- [ ] 失败可重试

### B04: AI Provider
- [ ] 配置 Provider 成功
- [ ] 健康检查通过
- [ ] 最小生成成功

### B05: 笔记
- [ ] 笔记生成成功
- [ ] Markdown 渲染正常
- [ ] KaTeX 公式正常
- [ ] 思维导图正常

### B06: 练习
- [ ] 练习生成成功
- [ ] 作答提交成功
- [ ] 结果读回正确

### B07: 错题
- [ ] 错题归档成功
- [ ] 错因确认成功
- [ ] 重做功能可用

### B08: 模拟考
- [ ] 模拟考生成成功
- [ ] 作答提交成功
- [ ] 结果与分析可用

### B09: 临考速背
- [ ] 翻卡功能正常
- [ ] 刷新恢复正常
- [ ] 限时锁定可用

### B10: 冲刺计划/工作台
- [ ] 只读计划可达
- [ ] 深链正常
- [ ] 考试切换正常

### B11: 连贯旅程
- [ ] S1→S2→S3→S4→S5 全链路无 P0 错误

## 数据加固验证（T04）

### T04-2: 启动完整性检查
- [ ] 正常数据库启动成功
- [ ] （可选）测试：破坏数据库文件，确认启动失败并有明确错误日志

### T04-1: 自动备份
```powershell
.\scripts\schedule-auto-backup.ps1 -InstallRoot $installRoot -OutputRoot H:\auto-backup -ScheduleTime "23:00"
```
- [ ] 任务注册成功
- [ ] 任务出现在"任务计划程序"中
- [ ] （可选）手动触发任务，确认备份成功

```powershell
.\scripts\remove-auto-backup.ps1 -InstallRoot $installRoot
```
- [ ] 任务注销成功

### T04-3: 恢复写入
```powershell
# 1. 停止服务
.\scripts\stop-production.ps1 -InstallRoot $installRoot

# 2. 恢复数据
.\scripts\restore-data.ps1 -InstallRoot $installRoot -BackupPath H:\test-backup\backup-*

# 3. 启动服务
.\scripts\start-production.ps1 -InstallRoot $installRoot
```
- [ ] 恢复成功
- [ ] Recovery point 已创建
- [ ] 数据一致性验证通过
- [ ] 重启后数据正确

## 问题记录

### 安装阻塞
| 问题 | 错误信息 | 解决方案 |
|---|---|---|
|  |  |  |

### 功能故障
| 场景 | 期望 | 实际 | 影响 |
|---|---|---|---|
|  |  |  |  |

## 验收结论

- 安装验收（A01-A09）：□ 通过 / □ 失败
- 业务验收（B01-B11）：□ 通过 / □ 失败
- 数据加固（T04）：□ 通过 / □ 失败

**总体评价**：□ 可进入真实使用 / □ 需修复Bug后重试

**验收人**：___________
**验收日期**：___________

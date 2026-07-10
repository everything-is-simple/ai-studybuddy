# Windows 任务计划 COMPONENT CARD

**阶段**：Phase 0.7
**状态**：⏸️ BLOCKED_EXTERNAL（权限）

| 项目 | 记录 |
|---|---|
| 版本/运行环境 | 开发机：Windows 10 专业版 10.0.19045；Node 25.4.0；Python 3.10.19；约 28.92GB 可见内存。Node 22 LTS 与 HP Windows 11 待复测。 |
| 安装命令 | `npm ci`；RapidOCR 使用 `.venv`。 |
| 安全检查 | 非隐私测试素材；不记录真实密钥、Webhook 或学习隐私全文。 |
| 输入/输出 | Task Scheduler XML → 临时任务启动独立 `report-runner.js` 并写入 SQLite 发送记录。 |
| 耗时与内存 | XML 单元测试通过；实际创建因当前会话 `Access is denied` 阻塞。 |
| 成功结论 | `StartWhenAvailable=true` 与无 OCR/Web 服务的 XML 通过；真实创建、触发、退出码、清理、登录补发未通过。 |
| 失败边界 | 需要可创建 Task Scheduler 任务的 Windows 交互会话。 |
| Phase 0.8 接入判断 | 待真实计划任务创建和补发验证后决定。 |

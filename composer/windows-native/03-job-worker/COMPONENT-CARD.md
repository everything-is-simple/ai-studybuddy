# SQLite Job Worker COMPONENT CARD

**阶段**：Phase 0.7
**状态**：✅ 开发机离线通过

| 项目 | 记录 |
|---|---|
| 版本/运行环境 | 开发机：Windows 10 专业版 10.0.19045；Node 25.4.0；Python 3.10.19；约 28.92GB 可见内存。Node 22 LTS 与 HP Windows 11 待复测。 |
| 安装命令 | `npm ci`；RapidOCR 使用 `.venv`。 |
| 安全检查 | 非隐私测试素材；不记录真实密钥、Webhook 或学习隐私全文。 |
| 输入/输出 | `jobs` 表 → 串行领取、有限重试、失败终止、stale running 恢复。 |
| 耗时与内存 | 测试约 33ms；Node RSS 基线约 44MB。 |
| 成功结论 | `npm run test:jobs` 通过。 |
| 失败边界 | 单进程串行；不支持多机并发领取。 |
| Phase 0.8 接入判断 | 可作为 Redis/BullMQ 的单机替代候选。 |

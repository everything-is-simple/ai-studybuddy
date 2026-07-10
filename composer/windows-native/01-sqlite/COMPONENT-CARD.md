# SQLite / better-sqlite3 COMPONENT CARD

**阶段**：Phase 0.7
**状态**：✅ 开发机离线通过

| 项目 | 记录 |
|---|---|
| 版本/运行环境 | 开发机：Windows 10 专业版 10.0.19045；Node 25.4.0；Python 3.10.19；约 28.92GB 可见内存。Node 22 LTS 与 HP Windows 11 待复测。 |
| 安装命令 | `npm ci`；RapidOCR 使用 `.venv`。 |
| 安全检查 | 非隐私测试素材；不记录真实密钥、Webhook 或学习隐私全文。 |
| 输入/输出 | 最小 schema → WAL、CRUD、唯一约束、事务回滚、备份恢复。 |
| 耗时与内存 | 测试约 30ms；Node RSS 基线约 44MB。 |
| 成功结论 | `npm run test:sqlite` 通过。 |
| 失败边界 | 仅验证单 Node 写进程；正式接入仍须 migration 方案。 |
| Phase 0.8 接入判断 | 可作为默认业务数据与 Job 持久化存储候选。 |

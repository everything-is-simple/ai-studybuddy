# QQ SMTP COMPONENT CARD

**阶段**：Phase 0.7
**状态**：✅ 真实发送通过

| 项目 | 记录 |
|---|---|
| 版本/运行环境 | 开发机：Windows 10 专业版 10.0.19045；Node 25.4.0；Python 3.10.19；约 28.92GB 可见内存。Node 22 LTS 与 HP Windows 11 待复测。 |
| 安装命令 | `npm ci`；RapidOCR 使用 `.venv`。 |
| 安全检查 | 非隐私测试素材；不记录真实密钥、Webhook 或学习隐私全文。 |
| 输入/输出 | 脱敏 HTML 报告 → QQ SMTP；无凭据时退出码 2。 |
| 耗时与内存 | `npm run test:smtp` 约 2.6s；Node RSS 基线约 44MB。 |
| 成功结论 | `PASS_LIVE: QQ SMTP message accepted`；163 父母测试邮箱已收到 Phase 0.7 测试邮件。 |
| 失败边界 | 需启用 QQ 邮箱 SMTP 服务并使用授权码；授权码错误、账号异常或网络失败会返回可诊断错误。 |
| Phase 0.8 接入判断 | 可作为默认邮件发送通道候选；正式接入时继续保持密钥不入日志。 |

# 飞书 Webhook COMPONENT CARD

**阶段**：Phase 0.7
**状态**：✅ 真实推送通过

| 项目 | 记录 |
|---|---|
| 版本/运行环境 | 开发机：Windows 10 专业版 10.0.19045；Node 25.4.0；Python 3.10.19；约 28.92GB 可见内存。Node 22 LTS 与 HP Windows 11 待复测。 |
| 安装命令 | `npm ci`；RapidOCR 使用 `.venv`。 |
| 安全检查 | 非隐私测试素材；不记录真实密钥、Webhook 或学习隐私全文。 |
| 输入/输出 | 脱敏完整报告卡片 → 飞书自定义机器人；无 Webhook 时退出码 2。 |
| 耗时与内存 | `npm run test:feishu` 约 1s；Node RSS 基线约 44MB。 |
| 成功结论 | `PASS_LIVE: Feishu webhook accepted`；父母飞书群已收到 Phase 0.7 报告卡片。 |
| 失败边界 | 需 `FEISHU_WEBHOOK_URL`；HTTP 失败不得阻止邮件渠道。 |
| Phase 0.8 接入判断 | 可作为默认即时报告卡片通道候选；正式接入时继续隐藏完整 Webhook。 |

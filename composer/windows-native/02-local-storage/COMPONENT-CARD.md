# 本地文件存储 COMPONENT CARD

**阶段**：Phase 0.7
**状态**：✅ 开发机离线通过

| 项目 | 记录 |
|---|---|
| 版本/运行环境 | 开发机：Windows 10 专业版 10.0.19045；Node 25.4.0；Python 3.10.19；约 28.92GB 可见内存。Node 22 LTS 与 HP Windows 11 待复测。 |
| 安装命令 | `npm ci`；RapidOCR 使用 `.venv`。 |
| 安全检查 | 非隐私测试素材；不记录真实密钥、Webhook 或学习隐私全文。 |
| 输入/输出 | 逻辑 `storage_key` → materials/tmp/exports 写读删与越界拒绝。 |
| 耗时与内存 | 测试约 5ms；Node RSS 基线约 44MB。 |
| 成功结论 | `npm run test:storage` 通过。 |
| 失败边界 | 仅非隐私小文件；大文件流式 localhost API 待 Phase 0.8。 |
| Phase 0.8 接入判断 | 可替代 MinIO；业务数据只保存 `storage_key`。 |

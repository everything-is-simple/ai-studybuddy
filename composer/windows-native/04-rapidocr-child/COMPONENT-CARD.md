# RapidOCR 子进程 COMPONENT CARD

**阶段**：Phase 0.7
**状态**：✅ 开发机离线通过；HP 待测

| 项目 | 记录 |
|---|---|
| 版本/运行环境 | 开发机：Windows 10 专业版 10.0.19045；Node 25.4.0；Python 3.10.19；约 28.92GB 可见内存。Node 22 LTS 与 HP Windows 11 待复测。 |
| 安装命令 | `npm ci`；RapidOCR 使用 `.venv`。 |
| 安全检查 | 非隐私测试素材；不记录真实密钥、Webhook 或学习隐私全文。 |
| 输入/输出 | 非隐私 PNG 路径 → stdout 单 JSON；缺文件走诊断错误。 |
| 耗时与内存 | 成功路径约 2.83 秒；仅记录 Node RSS 约 44MB，Python/系统峰值及 HP 16GB待测。 |
| 成功结论 | `PHASE07_PYTHON=.venv\Scripts\python.exe npm run test:ocr` 通过；子进程测试完成返回。 |
| 失败边界 | 缺 Python runtime、缺文件或超时均须明确失败；真实高分辨率图片待测。 |
| Phase 0.8 接入判断 | 可作为按需子进程候选，禁止常驻。 |

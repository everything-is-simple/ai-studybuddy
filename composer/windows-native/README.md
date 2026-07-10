# Phase 0.7 Windows 原生轻量底座 Smoke Test

此目录是独立试炼场，不加入根 pnpm workspace，不引用或修改 `packages/`。

## 准备

```powershell
cd composer/windows-native
npm ci
Copy-Item .env.example .env.local
$env:PHASE07_PYTHON = '.venv\Scripts\python.exe'
```

RapidOCR 成功路径使用独立 Python 虚拟环境；开发机已使用 `rapidocr-onnxruntime`。Node 22 LTS 是目标运行时；当前开发机为 Node 25.4.0，仅用于兼容性验证，不能替代孩子 HP 的 Node 22 LTS 复测。

## 命令

```powershell
npm run test:offline
npm run test:scheduler
npm run test:smtp
npm run test:feishu
npm run test:all
npm run measure:memory
```

- `test:offline` 不需要真实密钥。
- `test:smtp`、`test:feishu` 缺少 `.env.local` 凭据时以退出码 `2` 输出 `BLOCKED_EXTERNAL`。
- `test:scheduler` 先验证 Task Scheduler XML；若当前权限禁止创建临时任务，也以退出码 `2` 输出 `BLOCKED_EXTERNAL`。
- `test:all` 只有离线、真实 QQ SMTP、飞书和计划任务均成功才返回 `0`。

真实 QQ SMTP、飞书 Webhook、可创建任务计划的 Windows 会话、孩子 HP 16GB 实机均未完成前，Phase 0.7 不能标记完成。

# Phase 1-T12 设置中心 Provider 预设与渠道配置 UX 改造实施计划

**版本**：v5（已获用户批准，实施中）
**日期**：2026-07-19
**计划审查分支**：`codex/phase1-t12-settings-provider-presets`（v4 审查记录）
**实施分支**：`codex/phase1-t12-settings-provider-presets-impl`（从 `origin/master` @ `af37bd5` 新建）
**基线**：`origin/master` @ `af37bd5`
**状态**：用户已于 2026-07-19 明确批准实施。业务代码仅允许在当前干净实施 worktree 修改；原 `m01-master-integration` 的未提交草稿继续禁止暂存、还原、提交或合入。

> **For agentic workers:** 实施前必须使用 `superpowers:test-driven-development`；按任务逐项执行时使用 `superpowers:executing-plans` 或 `superpowers:subagent-driven-development`。本文件本身不构成实施或合入 `master` 授权。

**目标：** 把 T08 的开发者式设置表单改为面向普通用户的本机配置中心：官方 Provider 预设只需填密钥，QQ SMTP 与飞书收敛为最少首屏字段，同时保持现有 DPAPI 加密、连接测试和 Provider fallback 安全边界。

**架构：** 后端持有唯一的非秘密官方预设 catalog，并通过只读配置 API 提供给前端；前端绝不复制官方 Base URL。激活官方 Provider 时，前端只提交 `presetId`、模型、优先级和短暂存在于内存的 API Key，后端从 catalog 解析固定 Base URL 后复用现有配置测试、加密存储和运行时热切换；自定义 OpenAI-compatible 中转站走单独、默认折叠的高级入口。

---

## 一、独立审查结论与已锁定决策

原 v3 草案的范围方向正确，但存在以下不可实施歧义，均在本版锁定：

1. **唯一 catalog 与唯一读取接口**：catalog 固定放在 `packages/backend/src/config/provider-presets.ts`；新增且只新增 `GET /api/config/presets`。前端 `configuration-api.ts` 只声明响应类型，不维护第二份 Provider/Base URL 常量。
2. **官方 Base URL 由服务端固定**：官方 Provider 采用 `kind: 'official' + presetId` 的候选格式；请求不携带官方 Base URL。路由在调用现有 `ConfigurationService` 前从 catalog 解析为当前的具体 Provider 配置。旧的 `{ name, baseUrl, apiKey, model, priority }` 形式继续作为自定义 Provider 输入兼容，不视为官方预设。
3. **Claude 不扩协议**：本任务不新增 Anthropic Native Adapter。Claude 卡片显示“后续适配”，禁用密钥输入和激活操作；不得把它加入运行时 fallback。
4. **普通与高级路径分离**：官方卡片始终可见；启用后的 fallback 列表提供上移、下移和移除，优先级由列表顺序确定为 `1..n`。高级自定义 Provider 区默认折叠；只有自定义项可以编辑名称和 Base URL。
5. **不把私人中转策略产品化**：不导入或记录个人 CC Switch 导出、倍率筛选、日抛/CPA 名单、账号、URL 或密钥。高级区只给出通用提示：孩子长期使用避免来源不稳定的日抛、CPA 或中转账号。
6. **脏 worktree 隔离**：当前 worktree 中所有未提交 Provider、页面、测试和 `docs/04` 改动均为未经批准草稿。本计划不认可其为实现证据；获得实施批准后必须从最新 `origin/master` 建立上述新分支/干净 worktree，现有草稿保持原样且不进入任何提交。

## 二、正式范围与 Provider catalog

### Provider 卡片

按以下顺序提供官方卡片：OpenAI、Claude / Anthropic、Gemini、Grok / xAI、智谱 GLM、Kimi / Moonshot、DeepSeek、MiniMax、Qwen / DashScope、StepFun。catalog 中每项均为非秘密数据：`id`、中文显示名、分组、协议、可用状态、官方 Base URL、默认模型、模型建议和中文说明；不得包含 API Key、账号、Webhook、个人中转 URL、本机目录或价格/倍率信息。

- OpenAI 官方卡片的模型建议**仅包含** `gpt-5.5`、`gpt-5.4`、`gpt-5.6-terra`、`gpt-5.6-luna`，默认 `gpt-5.5`。
- Kimi 官方卡片固定 Base URL `https://api.moonshot.cn/v1`，模型建议顺序为 `kimi-k2.7-code`、`kimi-k2.7`、`kimi-k2.6`，默认 `kimi-k2.7-code`；catalog、前端文案和测试均不得包含或默认 `kimi-k3`。
- 其余可用卡片使用各 Provider 的官方 OpenAI-compatible Base URL 与当前受支持模型建议；实现当天必须只依据 Provider 官方文档更新 catalog，不得引入第三方聚合站或中转地址。
- Claude 的协议标记为 `anthropic-native`、状态标记为 `coming-soon`；Base URL 仅作只读说明，不产生可激活候选。

### API 与兼容性

`GET /api/config/presets` 返回统一 `{ success, data, error }` envelope，`data` 包含：

```ts
type ConfigurationPresets = {
  ai: AiProviderPreset[];
  smtp: {
    host: 'smtp.qq.com';
    port: 465;
    secure: true;
    userHint: string;
    authCodeHint: string;
    toHint: string;
    note: string;
  };
  feishu: { webhookHint: string; note: string };
  customRelayGuidance: string[];
};

type AiProviderPreset = {
  id: string;
  displayName: string;
  group: 'global-primary' | 'china-primary' | 'secondary';
  protocol: 'openai-compatible' | 'anthropic-native';
  availability: 'available' | 'coming-soon';
  baseUrl: string;
  defaultModel: string;
  modelSuggestions: string[];
  note: string;
};
```

AI 激活请求扩展为以下受控候选；`ConfigurationService`、安全存储格式和运行时 Router 继续接收已解析的既有 `ProviderConfig[]`，无需迁移已有加密配置或 `.env.local` fallback：

```ts
type OfficialAiCandidate = {
  kind: 'official';
  presetId: string;
  apiKey: string;
  model: string;
  priority: number;
};

type CustomAiCandidate = {
  kind: 'custom';
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  priority: number;
};
```

路由必须拒绝未知 preset、`coming-soon` preset、空密钥、无效模型和超过现有限制的候选；官方候选的 `model` 必须精确属于该 preset 的 `modelSuggestions`，自定义候选仅沿用既有非空长度与 URL 校验。将官方候选解析为 catalog 中的显示名与 Base URL，再复用现有清理、排序、测试和 DPAPI 保存流程。为兼容 T08 已有前端/API 调用，未含 `kind` 的旧 Provider 对象按 `kind: 'custom'` 处理并走现有 URL 校验，不允许借此冒充官方预设。

## 三、前端交互与秘密边界

### AI Provider

- `/settings` 加载时并行读取现有状态和 `/api/config/presets`；加载、读取失败和成功均显示中文状态，不能白屏。
- 卡片按“国外主流 / 国内主流 / 国内外备选”分组。可用卡只展示官方 Base URL（只读）、模型建议、一个 password API Key 输入框和“加入 fallback”操作；官方模型默认值来自 catalog，且只能从该卡片的 `modelSuggestions` 下拉选择，不能手填模型或编辑官方 Base URL。
- 加入后在可见的 fallback 列表中显示 Provider 名称、模型、优先级和上移/下移/移除操作；列表顺序是唯一优先级来源。界面明确写“按优先级失败切换 + 冷却，不是成功请求轮询”。
- “高级自定义 Provider / 中转站”采用默认关闭的 `<details>`；创建自定义候选时才显示名称、Base URL、模型和 API Key。说明只提示该入口面向用户自有 OpenAI-compatible 服务，并提醒不使用日抛、CPA 或来源不稳定账号。
- 提交激活请求后，无论成功或失败都从 React state 清除 API Key；成功后刷新非秘密配置状态。前端不得使用 `localStorage`、`sessionStorage`、URL 查询参数、日志或错误消息保存/输出任何密钥。

### QQ SMTP 与飞书

- QQ SMTP 首屏严格只显示“QQ 邮箱账号”“SMTP 授权码”“收件邮箱”。`smtp.qq.com`、`465`、SSL/TLS 从 catalog 预填；服务器、端口和安全连接只放在默认关闭的“高级 SMTP 参数”。授权码为 password 输入，提示其不是 QQ 登录密码。
- 飞书首屏严格只显示 password 类型的“飞书群机器人 Webhook URL”和中文安全提示：Webhook 会加密保存在本机、页面不回显、不要复制到截图或提交到 Git。T12 不新增签名密钥或其他未获后端支持字段。
- 三类秘密均只随测试/激活 POST 短暂传输；现有 status/retest API 只能显示脱敏状态、最近验证时间、固定错误码和非秘密摘要。

## 四、实施任务（获批后才执行）

1. **在干净分支建立后端 catalog 与读取 API**
   - 新建 `packages/backend/src/config/provider-presets.ts`，实现受控 catalog、类型和查找函数；扩展 `packages/backend/src/routes/config-routes.ts` 注册 `GET /presets`。
   - 在 `packages/backend/test/config-api.test.mjs` 先写失败用例：catalog 覆盖十张卡片、OpenAI/Kimi 精确模型集合、Kimi 无 K3、Claude 仅后续适配、响应无秘密、SMTP 默认和飞书文案正确；再实现最小代码使测试通过。

2. **在路由层实现官方候选解析与兼容输入**
   - 先为 `POST /api/config/ai/test-and-activate` 写失败用例：官方 `presetId` 解析到固定 Base URL、未列入该 preset 建议的模型/未知/Claude preset 被拒绝、旧 T08 provider payload 仍以 custom 路径可用、排序仍稳定。
   - 在 `config-routes.ts` 完成 union payload 校验与解析；只把已解析的现有 `ChannelConfigMap['ai']` 交给 `ConfigurationService`。不修改 DPAPI、安全存储、`AiProviderRouter` 或数据库 schema。

3. **重构前端 API 契约和设置页**
   - 在 `packages/frontend/src/api/configuration-api.ts` 增加 catalog、官方/自定义候选的前端类型与 `getConfigurationPresets()`；不复制任何 URL 或模型常量。
   - 重写 `packages/frontend/src/pages/settings-page.tsx` 的 AI、QQ SMTP、飞书表单状态与提交映射；官方与自定义候选分开建模，所有优先级由 fallback 数组序号派生。
   - 在 `packages/frontend/src/styles/global.css` 增加卡片分组、默认收起的高级区和 390px 窄屏的单列布局，不引入新依赖。

4. **以组件、API 和真实浏览器验证安全交互**
   - 先扩展 `packages/frontend/test/settings-page.test.tsx`，覆盖卡片分组、官方 Base URL 不可编辑、官方模型只能从 catalog 下拉选择、OpenAI/Kimi 模型、Claude 禁用、fallback 排序、两个高级区默认关闭、三个 password 输入、请求 union payload、请求完成后 secrets 清空，以及 `Storage.prototype.setItem` 从未因页面交互被调用。
   - 新建 `e2e/settings-provider-presets.spec.ts`，通过现有 Playwright API route mock 覆盖：桌面首屏、官方 Kimi 成功路径、失败仅显示固定码、刷新后不显示秘密、390px 窄屏无横向溢出。E2E 使用假值和路由 mock，不向 AI、QQ SMTP 或飞书发出真实网络请求。

5. **文档、审查与交付**
   - 只在实际实现提交、审查和全部验证完成后，更新 `docs/04-开发任务清单-Todo-List.md`：记录任务分支、提交、命令结果、浏览器验收和未运行的真实外部 smoke；未合入前仍标注“分支已验证，待主线集成”。
   - 独立审查必须检查：Base URL 是否能被官方路径篡改、Claude 是否可误激活、秘密是否进入响应/DOM 文本/Storage/测试快照、以及 fallback 是否被误写为轮询。

## 五、验收与验证

实施分支必须在隔离数据根中运行以下命令；任何真实 AI、QQ SMTP、飞书 Webhook 或个人中转站均不作为常规验证依赖：

```powershell
$env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t12-settings-provider-presets'
pnpm type-check
pnpm -r --filter @ai-studybuddy/backend run build
pnpm -r --filter @ai-studybuddy/frontend run build
pnpm test
pnpm test:e2e
powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
git diff --check
git diff --cached --check
```

验收必须证明：

- API catalog 只含非秘密官方预设；官方候选在服务端固定 Base URL，Claude 无法激活。
- 普通用户可用卡片完成 API Key → fallback → 测试激活；成功和失败后都无 API Key、SMTP 授权码或 Webhook 回显/Storage 写入。
- QQ SMTP 与飞书首屏字段严格符合本计划；高级参数默认关闭。
- 已有 T08 的已保存配置、retest、DPAPI 加密存储和按优先级失败切换不回归；本任务不把 fallback 改为轮询。
- 浏览器覆盖桌面与 390px 窄屏，证据输出仅存放在隔离目录，不提交截图、SQLite、`.env.local` 或任何秘密。

## 六、明确不在范围内

- Anthropic Native Adapter、Claude 实际调用、S5、S7、家长 Web 面板、公网部署、账号体系、模型价格/额度排行。
- CC Switch / Codex 配置导入、个人中转站导入、倍率/价格策略、日抛/CPA 名单或任何第三方中转站预设。
- 真实 AI、QQ SMTP、飞书渠道 smoke；如用户以后单独授权，只能使用本机秘密并在仓库外记录脱敏结果。
- 对当前脏 worktree 的未提交草稿作任何还原、暂存、提交、合并或“修正”。

## 七、已获批准的实施边界

用户已于 2026-07-19 明确回复“批准 T12 实施”。实施者现按本计划在干净 `codex/phase1-t12-settings-provider-presets-impl` 分支先写失败测试，再实现；在任务分支独立审查、验证和提交后，仍须另行取得 `master` 集成授权。

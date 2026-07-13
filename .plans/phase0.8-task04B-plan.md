# P0.8 T04B 扩展格式支持——装配进主系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## 目标

在 Phase 0.8-T04A（试炼场调通）的基础上，在主仓库（`I:\ai-studybuddy`）的 `packages/backend` 中正式实现对 `.docx`、网页 URL、`.pptx` 和 `.html` 格式的文本提取转换器。统一接入返回 `@ai-studybuddy/shared` 中定义的 `ConverterResult` 标准接口，并暴露给 `dev-converter.ts` 以供 smoke test 验证。

## 范围、依据与不可变约束

- **继承 T04A 的安全与业务边界**：
  - URL Fetch 必须严格实施 SSRF 防护、3次重定向限制、5MB 体积限制、10秒超时。
    - **安全重点 (P0)**：
      1. 仅允许 `http:` / `https:`，拒绝 URL user-info（如 `http://user@host`）。
      2. 必须手动处理重定向（逐跳验证）。
      3. 对初始 URL 与每一次 redirect 的目标 URL 都做 scheme、hostname/IP、端口与 DNS 全地址校验。**端口校验策略 (P1)**：只允许默认端口 `80` (HTTP) 和 `443` (HTTPS)，拒绝非常规端口以防探测内网。
      4. 必须通过配置 `connect: { lookup: secureLookup }` 给 `undici.Agent` 传入自定义 `lookup`，并在调用时 `fetch(url, { dispatcher: agent, redirect: "manual" })`。在**实际连接解析阶段（防 DNS rebinding TOCTOU）**拒绝回环、私网、链路本地、IPv4-mapped IPv6、未指定地址等。
  - DOCX/PPTX 提取：
    - **安全重点 (P0)**：防范压缩炸弹/内存耗尽。必须设置 ZIP entry 数量上限、单 entry 解压大小上限、累计解压大小上限，以及特定 XML（如 `word/document.xml`、`slide*.xml`）读取大小上限。超限时返回受控的错误，避免 OOM。
  - HTML 必须剥离 `script/style/noscript`，首选 Readability 提取正文，失败则 fallback 到 body text。
- **拦截老旧格式**：对于不支持的格式返回明确的 HTTP 400 与友好中文提示，不静默失败。拒绝清单必须包括但不限于：`.doc`, `.ppt`, `.xls/.xlsx`, `.odt/.ods/.odp`, `.rtf`, `.epub`, 压缩包及邮件格式。
- **不污染依赖**：严格在主系统重新实现，禁止 `import` composer 试炼场的代码。测试用例必须独立在 `packages/backend/test/` 下编写。

## 关键文件路径

| 类型                | 路径                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| 共享类型            | `packages/shared/src/types.ts`                                                                       |
| 后端依赖            | `packages/backend/package.json`                                                                      |
| Converter 统一入口  | `packages/backend/src/adapters/converter.ts`                                                         |
| DOCX 实现与测试     | `packages/backend/src/adapters/docx-converter.ts`<br>`packages/backend/test/docx-converter.test.mjs` |
| URL/HTML 实现与测试 | `packages/backend/src/adapters/url-fetcher.ts`<br>`packages/backend/test/url-fetcher.test.mjs`       |
| PPTX 实现与测试     | `packages/backend/src/adapters/pptx-converter.ts`<br>`packages/backend/test/pptx-converter.test.mjs` |
| Dev 路由            | `packages/backend/src/api/dev-converter.ts`                                                          |
| 任务清单            | `docs/04-开发任务清单-Todo-List.md`                                                                  |

---

## 任务拆分

### Task 1: 扩展共享类型与安装依赖

**Files:**

- Modify: `packages/shared/src/types.ts`
- Modify: `packages/backend/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: 扩展 `ConverterResult` 类型**
      在 `types.ts` 中，将 `sourceType` 的联合类型扩展为 `"pdf" | "image" | "text" | "docx" | "url" | "html" | "pptx"`。
      为避免 `metadata` 字段膨胀，定义强类型 sub-interface，并在 `ConverterResult.metadata` 中进行交叉或组合引用：

  ```typescript
  export interface DocxMetadata {
    embeddedVisualCount?: number;
  }
  export interface PptxMetadata {
    slideCount?: number;
    textSlideCount?: number;
    imageSlideCount?: number;
  }
  export interface UrlMetadata {
    title?: string;
    byline?: string;
    finalUrl?: string;
    redirectCount?: number;
    byteCount?: number;
  }
  // 在 ConverterResult 中扩展：metadata?: { pageCount?: number; charCount?: number; hasFormula?: boolean; hasTable?: boolean; } & DocxMetadata & PptxMetadata & UrlMetadata;
  ```

- [ ] **Step 2: 安装必要的后端依赖**
      在 `packages/backend` 目录下执行：
      `pnpm add mammoth jszip @mozilla/readability jsdom undici`
      `pnpm add -D @types/jsdom`
      确保 `package.json` 依赖已更新。

---

### Task 2: 装配 DocxConverter

**Files:**

- Create: `packages/backend/src/adapters/docx-converter.ts`
- Create: `packages/backend/test/docx-converter.test.mjs`
- Modify: `packages/backend/src/adapters/converter.ts` (导出该类)

- [ ] **Step 1: 实现 `DocxConverter`**
  - `async convert(input: Buffer | string): Promise<ConverterResult>`
  - 逻辑复刻 T04A：空 buffer 报错；使用 `mammoth.convertToHtml`；使用 `JSDOM` 替换 `<img>` 为占位符；使用 `jszip` 读取 `word/document.xml` 进行视觉对象计数差额补齐。
  - 正文为空返回包含“空文档”的明确错误。
- [ ] **Step 2: 编写单元测试**
  - **(P1) 测试数据 (Fixtures)**：包含中文带图片与图表的正常文档、空文档、以及**损坏 ZIP / 构造的压缩炸弹边界文档**，断言受控错误返回而非 OOM。
  - Run:
    ```powershell
    pnpm --filter @ai-studybuddy/backend run build
    pnpm --filter @ai-studybuddy/backend run test
    ```
    确认通过。

---

### Task 3: 装配 UrlFetcher 与 TextConverter 的 HTML 支持

**Files:**

- Create: `packages/backend/src/adapters/url-fetcher.ts`
- Create: `packages/backend/test/url-fetcher.test.mjs`
- Modify: `packages/backend/src/adapters/converter.ts` (修改原 TextConverter，并增加路由分发)

- [ ] **Step 1: 实现安全的 URL 抓取逻辑**
  - **DNS Rebinding 防护 (P0)**：必须通过配置 `connect: { lookup: secureLookup }` 给 `undici.Agent` 传入自定义 `lookup` 函数。在 `undici` 实际建立连接的解析阶段，校验 IP。如果 IP 属于私有网络、回环地址、链路本地、IPv4-mapped IPv6 或未指定地址等，抛出 SSRF blocked 错误。测试必须证明自定义 Agent 的 `lookup` 被调用。
  - **重定向与端口安全 (P0)**：禁止自动跟随重定向（配置 `redirect: "manual"`），必须手动处理重定向并逐跳对 URL（scheme、hostname/IP、端口）进行完整的 SSRF 和域名解析校验。**端口只允许 80 和 443**。
  - 限制重定向最多 3 次，文件大小上限 5MB，总超时 10 秒。
  - **Content-Type 白名单**：允许 `text/html`, `application/xhtml+xml`, `text/plain`。只检查 MIME 解析前缀，兼容带 charset 参数的情况。
  - 实现 HTML 剥离（去除 script/style）并调用 Readability 解析正文。
- [ ] **Step 2: 扩展 `TextConverter` 支持本地 HTML**
  - 如果传入的是 HTML 文件内容，复用上述 Readability 逻辑，`sourceType` 为 `html`；如果是纯文本则按原逻辑执行。
- [ ] **Step 3: 编写单元测试**
  - **(P1) 测试数据 (Fixtures)**：包含 SSRF 拦截场景（解析到 127.0.0.1、内网 IP 等）、重定向到内网的场景、体积超限拦截、Readability 提取成功与 fallback 案例。测试必须采用本地注入/mock resolver 的方式，不得依赖外网不稳定 URL。
  - Run:
    ```powershell
    pnpm --filter @ai-studybuddy/backend run build
    pnpm --filter @ai-studybuddy/backend run test
    ```
    确认通过。

---

### Task 4: 装配 PptxConverter

**Files:**

- Create: `packages/backend/src/adapters/pptx-converter.ts`
- Create: `packages/backend/test/pptx-converter.test.mjs`

- [ ] **Step 1: 实现 `PptxConverter`**
  - 使用 `jszip` 读取 `ppt/slides/slideN.xml`，必须按数字升序处理。
  - 提取 `<a:t>` 文本并解码 XML entities，每页前缀 `【第 N 页】`。
  - **(P1) 图片判断精确化**：逐页解析对应的 `ppt/slides/_rels/slideN.xml.rels`，将 relationship id 映射到具体引用。检测关联媒体文件或 `<p:pic>`/`r:embed`。若该页包含图片，附加 OCR 提示（如：“【第 N 页含嵌入图片，图片内文字需走 OCR】”）。明确区分纯文字页、图文混合页、无字纯图页的输出提示逻辑。
- [ ] **Step 2: 编写单元测试**
  - **(P1) 测试数据 (Fixtures)**：至少提供 12 页 PPTX 验证 `slide10` 不排在 `slide2` 前（数值排序）；验证图文页、纯图片页的警告信息；验证损坏 ZIP 错误。
  - Run:
    ```powershell
    pnpm --filter @ai-studybuddy/backend run build
    pnpm --filter @ai-studybuddy/backend run test
    ```
    确认通过。

---

### Task 5: 文件组织调整、暴露 Dev API 与拦截老旧格式

**Files:**

- Modify: `packages/backend/src/adapters/converter.ts`
- Modify: `packages/backend/src/api/dev-converter.ts`

- [ ] **Step 1: 调整 `converter.ts` 结构与实现分派 (Option A)**
  - 将 `converter.ts` 调整为 `re-export barrel` 模式：原有的 Pdf/Ocr/TextConverter 暂不拆分，新增的 Docx/Pptx/Url 必须在 `converter.ts` 中统一 export。
  - **(P1) 新增路由分派函数** `dispatchConverter`，定义输入接口：
    ```typescript
    export interface DispatchConverterInput {
      buffer?: Buffer;
      url?: string;
      filename?: string;
      declaredMimeType?: string;
    }
    export async function dispatchConverter(input: DispatchConverterInput): Promise<ConverterResult>;
    ```
    - 扩展名是路由核心依据，MIME 仅作辅助/告警，不信任客户端 MIME。
    - 该函数既提供给未来 `POST /materials/upload` 统一使用，本阶段也在 dev API 中作为统一入口（可选）或被具体路由调用。

- [ ] **Step 2: 补充 Dev 路由与 Body Parser 区分**
  - 补充 `POST /api/dev/converter/docx` (使用 `multer`)
  - 补充 `POST /api/dev/converter/pptx` (使用 `multer`)
  - 补充 `POST /api/dev/converter/url`：
    - **(P1)** 复用 `src/server.ts` 已全局挂载的 `express.json()`，无需重复挂载。
    - 校验 `url` 必须是非空 string。
    - 需明确 URL 解析错误、SSRF 拦截、上游报错、超时等如何映射为合适的 API Error code 与 HTTP 状态码（例如 SSRF -> 403/400，Timeout -> 504）。

- [ ] **Step 3: 路由分发与旧格式拒绝**
  - **(P1)** 在分派逻辑中实现完整的旧格式精确拒绝清单，返回 HTTP 400：
    - 拦截：`.doc`, `.ppt`, `.xls/.xlsx`, `.odt/.ods/.odp`, `.rtf`, `.epub`, 以及常见的压缩包（`.zip`, `.rar`）和邮件格式。
    - 提供对用户友好的中文提示（如：“请先将 .doc 另存为 DOCX 后重新上传”）。
- [ ] **Step 4: 手动 Smoke Test 验证**
  - 启动 `pnpm dev`，使用 `curl` 验证上述端点。

---

### Task 6: 复跑、文档治理和提交

**Files:**

- Modify: `docs/04-开发任务清单-Todo-List.md`
- Do not modify: `docs/00-文档索引-Index.md` (不满足触发条件)

- [ ] **Step 1: 全局构建与测试**
  - Run: `pnpm type-check`
  - Run: `pnpm build`
  - Run: `pnpm --filter @ai-studybuddy/backend run test`
- [ ] **Step 2: 治理脚本验证**
  - Run: `powershell -ExecutionPolicy Bypass -File scripts\check-docs-governance.ps1`
  - Run: `git diff --check`
- [ ] **Step 3: 更新任务清单**
  - 在 `docs/04-开发任务清单-Todo-List.md` 勾选 0.8-T04B 对应的子项。
- [ ] **Step 4: 提交代码**

---

## 明确不做

- 不直接实现 S2 资料上传的完整持久化流程（T07 处理）。
- 不处理分级 fallback（PDF.js 渲染 / PaddleOCR / 视觉 Provider）。
- 不引入外部工作队列，依然在同步请求内处理转换（URL fetch timeout 控制在 10s 内）。

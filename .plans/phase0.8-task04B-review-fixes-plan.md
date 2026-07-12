# P0.8 T04B 实现审查修复计划

## 目标

修复 T04B 实现审查确认的 URL 抓取安全、总超时、API 错误信封，以及 DOCX/PPTX 文件路径输入语义问题；不扩大到 T07 持久化上传范围。

## 修复范围

1. `UrlFetcher`
   - 将 10 秒限制改为整条重定向链共享的总 deadline。
   - 规范化 IPv6 主机名，拒绝 IPv6 回环、IPv4-mapped IPv6、链路本地、未指定地址和私网地址；保留实际连接期 `connect.lookup` 复验。
   - 强制 HTTP 仅使用端口 80、HTTPS 仅使用端口 443（显式或默认端口）。
2. Dev URL API
   - URL 转换失败返回 `ApiError`，使用稳定的大写蛇形 error code，并保持对应 HTTP 状态。
3. Office converters
   - 使 `DocxConverter` 与 `PptxConverter` 的 `Buffer | string` 输入约定与现有 Pdf/Text converter 一致：string 表示本地文件路径。
4. 回归测试
   - 先添加总超时、IPv6/映射 IPv6、跨协议端口、URL API 失败信封、DOCX/PPTX 路径输入测试，确认修复前失败，再实现修复。

## 文件范围

- Modify: `packages/backend/src/adapters/url-fetcher.ts`
- Modify: `packages/backend/src/adapters/docx-converter.ts`
- Modify: `packages/backend/src/adapters/pptx-converter.ts`
- Modify: `packages/backend/src/api/dev-converter.ts`
- Modify: `packages/backend/test/url-fetcher.test.mjs`
- Modify: `packages/backend/test/dev-converter-api.test.mjs`
- Modify: `packages/backend/test/docx-converter.test.mjs`
- Modify: `packages/backend/test/pptx-converter.test.mjs`
- Modify: `docs/04-开发任务清单-Todo-List.md`

## 验证

```powershell
pnpm type-check
pnpm build
pnpm test
powershell -ExecutionPolicy Bypass -File scripts\check-docs-governance.ps1
git diff --check
git diff --cached --check
```

提交仅包含上述修复和任务清单状态证据，不包含 `.claude/`。

# S2 资料格式全支持——独立实施计划

**计划编号**：S2-FILE-FORMAT-EXPANSION
**状态**：📝 已创建；待独立审查与用户批准后实施（按 16 步工作流）
**日期**：2026-08-06
**任务分支**：`claude/s2-file-format-expansion`
**上游**：`docs/subsystems/03-S2-资料笔记子系统PRD-NoteBuilder.md`（T07 上传边界）、`packages/backend/src/adapters/converter.ts`、`packages/backend/src/services/note-builder-service.ts`、`packages/frontend/src/pages/material-upload-page.tsx`

---

## 1. 问题与目标

### 1.1 现状

- S2 PRD T07 只承诺五类输入：PDF、图片（JPG/PNG/WebP）、纯文本、DOCX、PPTX。
- `converter.ts` 的 `inferSourceType` 实际已支持 8 类：pdf、image（jpg/jpeg/png/gif/webp/bmp）、text（txt/md/csv/json）、html/htm、docx、pptx。
- 但上传白名单 `FILE_TYPES`（`note-builder-service.ts`）只放行 8 种扩展名，**md/csv/json/gif/bmp/html/htm 被白名单拦截**——converter 能力与上传入口不一致。
- `REJECTED_EXTENSIONS` 显式拒绝 16 种：doc、ppt、xls、xlsx、odt、ods、odp、rtf、epub、zip、rar、7z、tar、gz、eml、msg。

### 1.2 目标

常见文件格式"全支持"，按三级处理：

- **A 级（放行）**：converter 已支持但被白名单拦截 → `md`、`csv`、`json`、`gif`、`bmp`、`html`、`htm`。零代码量（白名单 + 前端 accept），完整测试覆盖。
- **B 级（新增转换器）**：常见但当前拒绝 → `xlsx`、`odt`、`ods`、`odp`、`rtf`、`epub`。零新依赖方案：复用现有 `jszip` 解 zip/XML 提取文本，RTF 自写控制字剥离。
- **C 级（继续拒绝）**：`doc`、`ppt`、`xls`（旧二进制格式，需复杂解析）、压缩包（zip/rar/7z/tar/gz）、邮件（eml/msg）。保持拒绝并更新提示文案，引导另存为支持格式。

### 1.3 关键选型事实

- **不引入 SheetJS（npm `xlsx` 0.18.5）**：npm registry 已停更（官方版本转到 CDN），且存在 CVE-2023-30533（原型污染）与 CVE-2023-22365（ReDoS）。本项目已有成熟的 `jszip` 依赖与严格的 zip 解压安全限制（`getPptxZipLimits`/`getDocxZipLimits`），自写 xlsx sharedStrings/XML 文本提取即可覆盖"学生上传 Excel 课件"场景，无需新增第三方依赖。
- **不引入 exceljs**：同为新依赖，且 xlsx 读取需求简单（纯文本提取），jszip 方案已够。
- 所有新格式统一归一化为现有 `MaterialFileType`：xlsx/odt/ods/odp/rtf/epub 归 `text`；html 归 `text`（现有 `source_type` 列无 ENUM 约束，`converter.ts` 已产出 `html` sourceType，保持兼容）。**不改 shared 类型、不改 DB schema**。

## 2. 范围

### 2.1 涉及文件

| 文件 | 动作 |
|---|---|
| `packages/backend/src/services/note-builder-service.ts` | 扩展 `FILE_TYPES`：+.md +.csv +.json +.gif +.bmp +.html +.htm +.xlsx +.odt +.ods +.odp +.rtf +.epub（均带严格 MIME 白名单） |
| `packages/backend/src/adapters/converter.ts` | `REJECTED_EXTENSIONS` 移除 B 级格式；`inferSourceType` 增加 `.xlsx/.odt/.ods/.odp/.rtf/.epub` 映射；更新 C 级提示文案（xls 提示另存 xlsx） |
| `packages/backend/src/adapters/xlsx-converter.ts`（新增） | jszip 解压 `xl/sharedStrings.xml` + `xl/worksheets/sheetN.xml` 提取表格文本，带 zip 大小/条目安全限制 |
| `packages/backend/src/adapters/opendocument-converter.ts`（新增） | jszip 解压 `content.xml`，提取 `<text:p>` 文本（odt/ods/odp 共用） |
| `packages/backend/src/adapters/rtf-converter.ts`（新增） | 自写 RTF 控制字/十六进制剥离（`\par`、`\tab`、`{\*...}` 组、`\uN` unicode） |
| `packages/backend/src/adapters/epub-converter.ts`（新增） | jszip 解压 `.xhtml`/`.html` 条目，复用现有 html 提取逻辑 |
| `packages/backend/src/adapters/index.ts` | 导出新转换器 |
| `packages/frontend/src/pages/material-upload-page.tsx` | 上传 accept 扩展（A+B 级格式） |
| `packages/frontend/src/components/file-dropzone.tsx` | 无需改（accept 由调用方传入） |
| 测试 | 新增 `packages/backend/test/format-expansion-api.test.mjs`（各格式上传→转换→normalized_texts 闭环）+ 转换器单测；更新既有格式测试 |

### 2.2 安全边界（延续既有设计）

- 文件大小上限 10MB（已有）。
- zip 类（xlsx/odt/ods/odp/epub）沿用 `getDocxZipLimits` 式条目数/解压比限制，防 zip 炸弹。
- MIME 与扩展名严格匹配（已有 `fileType` 校验逻辑，新格式逐项配 `mimeTypes`）。
- 不解析宏（.xlsm/.docm/.pptm 继续拒绝，提示另存）；不执行任何嵌入代码。

## 3. 非目标

- 不引入 SheetJS/exceljs 等新第三方依赖。
- 不支持旧二进制 `.doc`/`.ppt`/`.xls`（提示另存为 DOCX/PPTX/XLSX）。
- 不支持压缩包、邮件格式（安全与复杂度原因）。
- 不改变 AI 笔记生成、知识模块提取、前端渲染等下游管道。
- 不改 `MaterialFileType` 类型、不改数据库 migration。

## 4. 实施步骤

1. 登记 `docs/04` 任务（已完成）。
2. 独立审查本计划（边界、选型、安全）。
3. 用户明确批准后实施：
   - 后端：白名单扩展 → converter 映射 → 4 个新转换器 → index 导出。
   - 前端：material-upload-page accept 扩展。
   - 测试：新增格式闭环测试 + 各转换器单测（用合成 xlsx/odt/rtf/epub 夹具）。
4. type-check → build（后端/前端）→ 全量测试 → E2E 回归。
5. `docs/04` 勾选 + 证据登记；docs/00 索引无需新增文档（不改 PRD 边界？见 §6）。
6. 治理检查 + diff 检查；提交 → 合入 master → 推送 origin/master。

## 5. 验证

- `pnpm type-check` 零错误。
- 后端/前端 build 成功。
- `pnpm -r --filter @ai-studybuddy/backend run test` 全绿（含新增格式测试）。
- `pnpm -r --filter @ai-studybuddy/frontend run test` 全绿。
- `pnpm test:e2e` 全绿（回归，无新增 E2E 除非必要）。
- 专项冒烟：真实服务上传 xlsx/odt/epub 合成文件 → 转换 → normalized_texts 读回文本。
- `scripts/check-docs-governance.ps1` + `git diff --check` 通过。

## 6. PRD 同步

S2 PRD T07 写死五类输入。本任务将上传能力扩展为"五类 + 常见衍生格式"，属于 PRD 边界内的能力增强（仍为本地多格式资料→文本→笔记管道）。实施完成后在 PRD 的"资料上传"行同步更新格式清单，并登记版本变更。

## 7. 交付

- 后端白名单 + 转换器 + 前端 accept + 测试。
- 交付说明列出：新增支持格式清单、选型事实（SheetJS 漏洞）、继续拒绝格式与原因、验证命令与结果、PRD 更新位置。

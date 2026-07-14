# T08-fix：前端 MVP 验收修补任务卡

**日期**：2026-07-14
**前置**：T08 已完成，验收测试发现 3 个可修复问题
**优先级**：中（不阻塞后续任务，但影响体验和健壮性）

---

## 问题清单

### Fix-1：轮询在后端持续错误时请求风暴

**现象**：切换学期时，旧 courseInstanceId 仍保留在 state 中，`use-material-polling` 的 useEffect deps 变化导致 effect 反复重跑，产生 30+ 次 500 请求。

**根因**：`useEffect` deps 包含 `fetch`（由 `useCallback` 生成），而 `fetch` 依赖 `semesterId` + `courseInstanceId`。切换学期时 semesterId 变了但 courseInstanceId 短暂保留旧值，触发多次重挂载。同时 error path 虽不调 schedule，但 effect 本身会重新 `fetch()`。

**修复方案**：
1. error 时引入退避计数器（错误连续 3 次后停止轮询，显示"重试"按钮让用户手动触发）
2. `useEffect` cleanup 时 abort 前次请求（已有），但需要在 deps 中去掉 `fetch` 的不稳定引用 — 用 `useRef` 存最新 fetcher，effect 只依赖 `semesterId + courseInstanceId + enabled`
3. 切换课程/学期时，先 clear materials 再重新开始轮询

**涉及文件**：
- `packages/frontend/src/hooks/use-material-polling.ts`

---

### Fix-2：Bundle 过大（1.2MB / gzip 427KB）

**现象**：Vite build 警告 chunk > 500KB。markmap-lib（~400KB）、KaTeX fonts、react-markdown 全打在一个 chunk 里。

**修复方案**：
1. 笔记页用 `React.lazy()` + `Suspense` 懒加载
2. `vite.config.ts` 配置 `manualChunks`，将 markmap / katex / react-markdown 拆到独立 chunk
3. 目标：主 chunk < 500KB，笔记相关 chunk 按需加载

**涉及文件**：
- `packages/frontend/vite.config.ts`（manualChunks 配置）
- `packages/frontend/src/app.tsx`（lazy import note-page）
- `packages/frontend/src/pages/note-page.tsx`（确认 default export）

---

### Fix-3：旧学期缺 `jobs` 表导致 500

**现象**：2026-fall 学期在 T07 引入 `jobs` 表之前创建，查询 `materialSummarySelect` 时 SQL 报 "no such table: jobs"，被通用 catch 吞为 `S2_REQUEST_FAILED`。

**根因**：`openReadySemesterDb` 只校验 `ready` 标志和文件存在，不做 schema 版本检查。早期创建的学期数据库缺少后续新增的表。

**修复方案**：
1. 后端 `openReadySemesterDb` 后增加 schema 版本检查或自动迁移：打开学期 DB 后检查 `jobs` 表是否存在，不存在则执行 `CREATE TABLE IF NOT EXISTS jobs (...)` 补建
2. 更好的方案：引入 `schema_version` 表，记录当前版本号，打开时比对并逐步迁移（适合后续多次迭代）
3. MVP 最小修复：在 `materialSummarySelect` 中对 `jobs` 子查询加保护 — 不可行，SQLite 不支持 `IF EXISTS` 在子查询中
4. **推荐方案**：`openReadySemesterDb` 中打开 DB 后，执行 `schema-semester.ts` 里的全量 `CREATE TABLE IF NOT EXISTS` 语句（幂等），确保所有表存在

**涉及文件**：
- `packages/backend/src/services/note-builder-service.ts`（`openReadySemesterDb` 方法）
- `packages/backend/src/db/sql/schema-semester.ts`（确认所有表有 IF NOT EXISTS）
- `packages/backend/test/note-builder-api.test.mjs`（新增：旧学期缺表时自动修复的回归测试）

---

## 执行顺序

```
Fix-3（后端健壮性）→ Fix-1（前端轮询）→ Fix-2（性能优化）
```

Fix-3 优先，因为它影响用户使用旧数据；Fix-1 影响体验；Fix-2 是优化，不急。

---

## 验证标准

- [x] Fix-3：缺少 `jobs` 表的旧学期库会在打开时自动补表；`listMaterials` 定向回归通过
- [x] Fix-1：前端轮询连续失败 3 次后停止，错误反馈提供手动重试按钮；切换课程时会清空旧资料
- [x] Fix-2：`pnpm --filter @ai-studybuddy/frontend run build` 后入口 chunk 为 172.85 kB，笔记依赖按需拆分
- [ ] 全量 `pnpm test`：前端 10 项通过；后端存在既有 `dev converter /pptx returns extracted text` 失败，和本次变更无关

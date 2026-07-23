# Windows 生产单进程启动与静态资源服务 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让编译后的 Express 在生产模式下同时提供 `/api` 与前端静态文件/SPA fallback，并始终限制为本机回环地址。

**Architecture:** `createApp` 接受可选静态目录；仅在目录明确存在时挂载静态服务，API 404 保持 JSON/原行为，非 API GET fallback 到 `index.html`。构建脚本把 frontend `dist` 复制到 backend `dist/public`，生产启动只运行 `node dist/server.js`。

**Tech Stack:** Express 4、TypeScript、Vite、Node test runner。

---

### Task 1: 生产静态服务行为

**Files:**
- Modify: `packages/backend/src/app.ts`
- Modify: `packages/backend/src/server.ts`
- Test: `packages/backend/test/production-static-host.test.mjs`

- [ ] **Step 1: 写失败集成测试**：临时目录放置 `index.html`/asset，验证 `/api/health`、静态 asset、深层 SPA 路由、未知 `/api/*` 不返回 HTML、无静态目录时不改变测试应用行为。
- [ ] **Step 2: build 后运行测试并确认失败原因是尚未支持 `staticRoot`。**
- [ ] **Step 3: 最小实现 `staticRoot`、`express.static` 和非 API GET fallback；server 从 `FRONTEND_STATIC_ROOT` 或编译产物默认目录解析。**
- [ ] **Step 4: 重跑专项与现有 API 测试。**

### Task 2: 构建产物装配

**Files:**
- Create: `scripts/assemble-production.ps1`
- Modify: `package.json`
- Modify: `packages/backend/package.json`
- Test: `packages/backend/test/production-assembly-script.test.mjs`

- [ ] **Step 1: 写失败测试**：要求脚本先构建 shared/frontend/backend，再只复制前端 `dist` 到 backend `dist/public`，并生成版本清单；拒绝 `.env.local`、数据库和 `node_modules`。
- [ ] **Step 2: 实现 `pnpm build:production` 对应装配脚本。**
- [ ] **Step 3: 运行装配并确认 `packages/backend/dist/public/index.html` 与后端入口同时存在。**
- [ ] **Step 4: 用临时数据根启动编译后服务，访问健康接口和 SPA 深链。**

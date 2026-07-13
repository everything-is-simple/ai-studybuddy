# Phase 0.8 T08：前端——最小可用页面 行动计划

**版本**：v1.1
**日期**：2026-07-13
**状态**：待批准（审查反馈已修订）
**依赖**：T07 S2 核心 API 已完成；`docs/11-前端开发规范-Frontend-Guidelines.md` v1.1 已生效

---

## 一、目标

从零搭建 `packages/frontend`，实现三个最小可用页面：

1. **课程页** `/courses`：课程列表 + 创建课程 + 创建考试目标
2. **资料页** `/materials`：选择课程 → 拖拽/选择文件上传 → 展示处理状态与结果
3. **笔记页** `/notes/:noteId`：Markdown + KaTeX 笔记、Markmap 思维导图、知识模块列表与关联学习任务

不追求样式完美，追求功能可用、错误可理解、数据不丢失。

---

## 二、已知缺口与前置修改

### 2.1 后端需补充 noteId 到资料响应，并统一列表/详情聚合字段

**问题 1**：当前 `listMaterials` 和 `getMaterial` 返回 `hasNote: boolean` 但不返回 `noteId`。前端规范要求"资料完成后显示'查看笔记'链接并跳转到 `/notes/:noteId`"。

**问题 2**：`getMaterial` 当前不返回 `hasNote` 和 `knowledgeModuleCount`（只有列表接口有），列表与详情的聚合字段不一致。

**方案**：

- 抽取统一的资料汇总 SQL 片段，包含 `has_note`、`knowledge_module_count`、`note_id`、`conversion_retry_count`、`ai_retry_count`，供 `listMaterials` 和 `getMaterial` 共用。
- `note_id` 使用简单关联：`(SELECT id FROM structured_notes WHERE material_id = m.id) AS note_id`。当前 schema 有 `UNIQUE INDEX idx_structured_notes_material ON structured_notes(material_id)`，一份资料只有一份笔记，无需 `ORDER BY` 或 `LIMIT`。
- `MaterialDto` 增加可选字段 `noteId?: string`，注释为"存在已生成结构化笔记时有值"（不绑定特定 status）。
- 新增后端 API 测试断言：资料 completed 后 `hasNote === true` 且返回的 `noteId` 能成功用于 `GET /notes/:id`。

### 2.2 Prettier 配置

根目录已有 `prettier` 依赖（v3.2.5），但没有配置文件。T08 新增 `.prettierrc`（最小配置）和根目录 `format:check` 脚本。

### 2.3 学期来源（semesterId 引导）

当前没有正式"列学期"API；`/api/dev/db-health` 是开发健康检查，不应被正式前端消费。

**MVP 方案**：App shell 顶部提供"当前学期 ID"输入框：

- 输入 UUID 后校验格式（前端正则），保存到 `localStorage`
- 下次打开自动读取并回显
- 提供"清除/更换学期"按钮
- 非法 UUID 格式或空值时，显示中文提示"请输入有效的学期 ID"，所有页面内容区域显示空状态引导
- 后端请求返回 `SEMESTER_NOT_FOUND` 时，清除本地缓存并提示"学期不存在，请重新输入"

---

## 三、涉及文件清单

### 新建文件

```text
packages/frontend/
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  .env.example
  src/
    main.tsx
    app.tsx
    styles/global.css
    api/
      api-client.ts
      study-rhythm-api.ts
      note-builder-api.ts
    components/
      app-navigation.tsx
      feedback-message.tsx
      file-dropzone.tsx
      material-status.tsx
      markdown-note.tsx
      mind-map.tsx
      knowledge-module-list.tsx
    hooks/
      use-api-request.ts
      use-material-polling.ts
    pages/
      course-page.tsx
      material-upload-page.tsx
      note-page.tsx
    types/
      view-models.ts

.prettierrc
packages/frontend/test/
  api-client.test.ts
```

### 修改文件

```text
package.json                        — 增加 format:check 脚本；test 改为 pnpm build && pnpm -r run test
pnpm-workspace.yaml                 — 无需修改（已覆盖 packages/*）
packages/shared/src/types.ts        — MaterialDto 增加 noteId 可选字段
packages/backend/src/services/note-builder-service.ts — listMaterials/getMaterial 统一汇总 SQL + toMaterial 映射
packages/backend/test/note-builder-api.test.mjs — 新增 noteId 回归断言
```

---

## 四、接口/类型设计

### 4.1 前端 API 客户端核心类型

```typescript
// api-client.ts
export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
  }
}

// 分页结果——与后端 data.pagination 结构一致，不额外转换
export interface ApiPage<T> {
  items: T[];
  pagination: { page: number; pageSize: number; total: number; hasMore: boolean };
}

// 基础方法
async function request<T>(url: string, options?: RequestInit & { signal?: AbortSignal }): Promise<T>;
async function requestPage<T>(url: string, options?: RequestInit & { signal?: AbortSignal }): Promise<ApiPage<T>>;
async function upload<T>(url: string, formData: FormData, signal?: AbortSignal): Promise<T>;
```

**错误处理职责分层**：

- `api-client.ts`：`fetch` 抛出 `AbortError` 时，原样抛出（不吞掉）；网络失败包装为 `ApiClientError("NETWORK_ERROR", "网络连接失败")`；后端信封错误包装为 `ApiClientError(code, message)`。
- `use-api-request.ts` hook：捕获 `AbortError` 后静默忽略（不写入 error 状态、不更新 data）；其他 `ApiClientError` 写入 error 状态。

### 4.2 API 模块

```typescript
// study-rhythm-api.ts
export function getCourses(semesterId: string, signal?: AbortSignal): Promise<CourseInstanceDto[]>;
export function createCourse(
  data: { semesterId: string; name: string; retakeOfCourseInstanceId?: string },
  signal?: AbortSignal
): Promise<CourseInstanceDto>;
export function getExams(
  semesterId: string,
  courseInstanceId: string,
  signal?: AbortSignal
): Promise<AssessmentAttemptDto[]>;
export function createExam(
  data: { courseInstanceId: string; name: string; attemptType: string; examAt: string; goal?: string },
  signal?: AbortSignal
): Promise<AssessmentAttemptDto>;
export function getStudyTasks(
  semesterId: string,
  courseInstanceId: string,
  signal?: AbortSignal
): Promise<StudyTaskDto[]>;

// note-builder-api.ts
export function getMaterials(
  semesterId: string,
  courseInstanceId: string,
  signal?: AbortSignal
): Promise<ApiPage<MaterialDto>>;
export function uploadMaterial(
  data: { semesterId: string; courseInstanceId: string; title?: string; file: File },
  signal?: AbortSignal
): Promise<MaterialDto>;
export function retryConversion(semesterId: string, materialId: string, signal?: AbortSignal): Promise<unknown>;
export function retryAiGeneration(semesterId: string, materialId: string, signal?: AbortSignal): Promise<unknown>;
export function getNote(semesterId: string, noteId: string, signal?: AbortSignal): Promise<NoteDetail>;
export function getKnowledgeModules(
  semesterId: string,
  courseInstanceId: string,
  signal?: AbortSignal
): Promise<ApiPage<KnowledgeModuleDto>>;
```

### 4.3 Hooks

```typescript
// use-api-request.ts
function useApiRequest<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[]
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

// use-material-polling.ts
function useMaterialPolling(
  semesterId: string,
  courseInstanceId: string,
  enabled: boolean
): {
  materials: MaterialDto[];
  loading: boolean;
  error: string | null;
};
// 内部实现指数退避 2s→4s→8s→16s→30s；终态停止；visibilitychange 重置
```

### 4.4 shared 类型补充

```typescript
// packages/shared/src/types.ts — MaterialDto 增加：
noteId?: string;  // 存在已生成结构化笔记时有值
```

---

## 五、实现步骤（子任务拆分）

### Phase A：基础脚手架

| #   | 子任务                                                                                                                                            | 文件           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| A1  | 创建 `packages/frontend/package.json`（React 18、Vite、TS、react-router-dom、vitest）                                                             | package.json   |
| A2  | 创建 `tsconfig.json`（strict, paths 指向 shared）                                                                                                 | tsconfig.json  |
| A3  | 创建 `vite.config.ts`（端口 5173，proxy `/api` → 后端）                                                                                           | vite.config.ts |
| A4  | 创建 `index.html`（挂载点 #root）                                                                                                                 | index.html     |
| A5  | 创建 `.env.example`                                                                                                                               | .env.example   |
| A6  | 创建根目录 `.prettierrc`（最小配置：printWidth 120, semi, singleQuote）                                                                           | .prettierrc    |
| A7  | 更新根 `package.json` scripts：增加 `format:check`；`test` 改为 `pnpm build && pnpm -r run test`（shared 无 test 脚本时 pnpm recursive 自动跳过） | package.json   |
| A8  | `pnpm install` 安装前端依赖                                                                                                                       | —              |

### Phase B：后端小补丁

| #   | 子任务                                                                                                                                                              | 文件                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| B1  | `MaterialDto` 增加 `noteId?: string`（注释：存在已生成结构化笔记时有值）                                                                                            | packages/shared/src/types.ts |
| B2  | 抽取统一资料汇总 SQL 片段（含 `has_note`、`note_id`、`knowledge_module_count`、retry counts），供 `listMaterials` 和 `getMaterial` 共用；`toMaterial` 映射 `noteId` | note-builder-service.ts      |
| B3  | `getMaterial` 使用统一汇总 SQL，确保返回 `hasNote`、`knowledgeModuleCount`、`noteId`                                                                                | note-builder-service.ts      |
| B4  | 新增后端测试断言：资料 completed 时 `hasNote === true` 且 `noteId` 能成功用于 `GET /notes/:id`                                                                      | note-builder-api.test.mjs    |
| B5  | 跑 `pnpm type-check && pnpm -r --filter backend run build && pnpm test`，确认后端既有测试全部通过                                                                   | —                            |

### Phase C：API 层

| #   | 子任务                                                       | 文件                        |
| --- | ------------------------------------------------------------ | --------------------------- |
| C1  | 实现 `api-client.ts`：request、requestPage、upload、错误处理 | src/api/api-client.ts       |
| C2  | 实现 `study-rhythm-api.ts`                                   | src/api/study-rhythm-api.ts |
| C3  | 实现 `note-builder-api.ts`                                   | src/api/note-builder-api.ts |

### Phase D：通用 Hooks 与组件

| #   | 子任务                                                                        | 文件                                     |
| --- | ----------------------------------------------------------------------------- | ---------------------------------------- |
| D1  | `use-api-request.ts`：可取消请求、loading/error 状态、refetch                 | src/hooks/use-api-request.ts             |
| D2  | `use-material-polling.ts`：指数退避、visibilitychange、终态停止               | src/hooks/use-material-polling.ts        |
| D3  | `feedback-message.tsx`：loading / empty / error 统一组件                      | src/components/feedback-message.tsx      |
| D4  | `app-navigation.tsx`：三页导航                                                | src/components/app-navigation.tsx        |
| D5  | `file-dropzone.tsx`：拖拽 + 选择文件                                          | src/components/file-dropzone.tsx         |
| D6  | `material-status.tsx`：资料状态展示 + 重试入口 + "查看笔记"链接               | src/components/material-status.tsx       |
| D7  | `markdown-note.tsx`：react-markdown + remark-gfm + remark-math + rehype-katex | src/components/markdown-note.tsx         |
| D8  | `mind-map.tsx`：Markmap 初始化/更新/销毁封装                                  | src/components/mind-map.tsx              |
| D9  | `knowledge-module-list.tsx`：知识模块列表 + 学习状态                          | src/components/knowledge-module-list.tsx |

### Phase E：页面

| #   | 子任务                                                                                                                                                              | 文件                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| E1  | `course-page.tsx`：课程列表、创建课程表单、考试目标列表与创建                                                                                                       | src/pages/course-page.tsx          |
| E2  | `material-upload-page.tsx`：选择课程、上传区域、资料列表与轮询                                                                                                      | src/pages/material-upload-page.tsx |
| E3  | `note-page.tsx`：笔记正文、思维导图、知识模块与学习任务；从路由参数取 `noteId`，仍需 App shell 的 `semesterId`；缺失时不发请求，显示"请先设置学期"引导回 `/courses` | src/pages/note-page.tsx            |

### Phase F：App Shell 与样式

| #   | 子任务                                             | 文件                     |
| --- | -------------------------------------------------- | ------------------------ |
| F1  | `main.tsx`：入口、全局 CSS、KaTeX CSS、Router 挂载 | src/main.tsx             |
| F2  | `app.tsx`：路由定义、全局导航、semesterId 状态管理 | src/app.tsx              |
| F3  | `global.css`：最小全局布局、表单、反馈样式         | src/styles/global.css    |
| F4  | `view-models.ts`：前端展示辅助类型                 | src/types/view-models.ts |

### Phase G：测试

| #   | 子任务                                                           | 文件                    |
| --- | ---------------------------------------------------------------- | ----------------------- |
| G1  | `api-client.test.ts`：成功解包、分页解包、失败解包、网络错误兜底 | test/api-client.test.ts |
| G2  | 前端 `type-check` 和 `build` 通过                                | —                       |
| G3  | 全量 `pnpm type-check && pnpm test` 通过                         | —                       |

### Phase H：验收与治理

| #   | 子任务                                                                       |
| --- | ---------------------------------------------------------------------------- |
| H1  | Smoke test：启动后端 + 前端，按人工验收清单 §10.3 逐项走通                   |
| H2  | `powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1` |
| H3  | `git diff --check`                                                           |
| H4  | 更新 `docs/04-开发任务清单-Todo-List.md` 标记 T08 完成                       |

---

## 六、技术决策与风险

| 风险                                   | 影响             | 缓解                                                                                                   |
| -------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| Markmap 是 ESM-only，Vite 需要正确处理 | 导入失败         | Vite 原生支持 ESM；在 vite.config.ts 中确认不需要 CJS 降级                                             |
| KaTeX CSS 约 300KB，首次加载慢         | UX 延迟          | 本机 localhost 不走网络，影响可忽略；后续可懒加载                                                      |
| noteId 后端缺口                        | 前端无法跳转笔记 | Phase B 先补丁：统一汇总查询 + DTO 映射 + 回归测试，不破坏现有 API 契约                                |
| semesterId 引导                        | 第一次使用无数据 | App shell 提供 UUID 输入框 + localStorage 持久化 + 清除/更换 + 格式校验 + 后端 404 清除提示（见 §2.3） |
| 根目录 `pnpm dev` 并行启动前后端       | 端口冲突         | 后端 3000，前端 5173；Vite proxy `/api` 到 3000                                                        |
| `react-markdown` v9+ 是 ESM-only       | 构建报错         | Vite + React 18 + ESM 原生支持，无需额外配置                                                           |

---

## 七、测试策略

### 自动化测试

1. **API 客户端单元测试**（vitest + hand-mocked fetch）
   - 成功信封解包返回 `data`
   - 带 `pagination` 的分页信封返回 `ApiPage<T>`
   - 失败信封抛 `ApiClientError`，携带 `code` 和中文 `message`
   - 网络失败兜底为 `ApiClientError("NETWORK_ERROR", "网络连接失败")`
   - `AbortSignal` 取消时，`api-client` 抛出原生 `AbortError`；`useApiRequest` hook 捕获后静默忽略，不写入 error 状态

2. **构建验证**
   - `pnpm -r --filter frontend run type-check`
   - `pnpm -r --filter frontend run build`（Vite production build 无错误）

3. **后端回归**
   - B 阶段补丁后，`pnpm test` 全量通过，并新增 `noteId` API 回归断言（测试总数可能因新增用例增加）

### 人工 Smoke Test（对齐前端规范 §10.3）

1. 创建课程 + 考试目标 → 刷新后仍可见
2. 选课程 → 上传文件 → 看到"处理中" → 完成后显示"查看笔记"
3. 进入笔记页 → Markdown 渲染、KaTeX 公式、Markmap 导图各自可用或降级
4. 知识模块列表显示来源与学习任务
5. 断后端 → 页面展示中文错误不白屏
6. `pnpm type-check && pnpm test && format:check && 文档治理 && git diff --check`

---

## 八、治理步骤

1. 实现完成后运行 `pnpm type-check`
2. `pnpm -r --filter frontend run build`
3. `pnpm test`（含后端全量回归）
4. `pnpm run format:check`
5. Smoke test（§七.人工）
6. 更新 `docs/04-开发任务清单-Todo-List.md`
7. `powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1`
8. `git diff --check`
9. 提交：`feat(frontend): T08 前端最小可用页面——课程/资料上传/笔记展示`

---

## 九、实现顺序总结

```text
A（脚手架）→ B（后端补丁+回归）→ C（API 层）→ D（Hooks + 组件）→ E（页面）→ F（Shell + 样式）→ G（测试）→ H（验收治理）
```

Phase A-B 为前提，完成后再并行推进 C-F，最后 G-H 收尾。

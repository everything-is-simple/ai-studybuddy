# AI StudyBuddy 开发规范

**版本**：v1.0
**日期**：2026-07-06
**适用范围**：本项目所有代码、所有AI协作对话

> 本文档是AI协作的"紧箍咒"。每次开发对话必须带入本文档作为上下文。
> 随着项目推进，踩过的坑会反向补充到本文档中，形成自我进化。

---

## 一、代码风格

### 1.1 TypeScript 规范

```typescript
// ✅ 正确
interface User {
  id: string;
  displayName: string;
  role: 'student' | 'parent';
}

// ❌ 禁止
interface User {
  id: any;           // 禁止 any
  display_name: string;  // 禁止 snake_case
  role: string;      // 禁止宽泛类型，用联合类型
}
```

**强制规则：**

| 规则 | 说明 |
|------|------|
| `strict: true` | tsconfig 必须开启严格模式 |
| 禁止 `any` | 使用 `unknown` 替代，再用类型守卫收窄 |
| 禁止 `@ts-ignore` | 类型问题必须修复，不能跳过 |
| 禁止 `as any` | 强制类型转换用 `as unknown as TargetType` |
| 接口优于类型别名 | `interface` 用于对象结构，`type` 仅用于联合类型和工具类型 |
| 导出类型用 `export type` | 类型导出必须显式标注 `type` |

### 1.2 命名规范

| 类别 | 风格 | 示例 |
|------|------|------|
| 变量/函数 | camelCase | `getUserById`, `courseName` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`, `API_BASE_URL` |
| 接口/类型 | PascalCase | `UserProfile`, `TaskStatus` |
| React组件 | PascalCase | `CourseCard`, `MindMapView` |
| 文件名（组件） | PascalCase | `CourseCard.tsx` |
| 文件名（工具/服务） | kebab-case | `api-client.ts`, `auth-service.ts` |
| 路由文件 | 遵循Expo Router | `(tabs)/courses/index.tsx` |
| 数据库字段 | snake_case | `created_at`, `display_name` |
| API路径 | kebab-case | `/api/v1/question-sets/:id` |
| 环境变量 | UPPER_SNAKE_CASE | `DATABASE_URL`, `OPENAI_API_KEY` |

### 1.3 函数规范

```typescript
// ✅ 函数声明用于顶层函数
async function getUserById(userId: string): Promise<User | null> {
  // ...
}

// ✅ 箭头函数用于回调和组件内部
const handleClick = useCallback(() => {
  // ...
}, [dependency]);

// ✅ 返回值必须显式标注（公共函数）
function calculateScore(answers: Answer[]): number {
  // ...
}

// ❌ 禁止隐式 any 参数
function process(data) { }  // data 没有类型标注
```

**规则：**

- 公共函数（导出函数）必须标注返回类型
- 函数参数超过 3 个，改用对象参数 `function createTask(params: CreateTaskParams)`
- 异步函数统一使用 `async/await`，禁止 `.then()` 链
- 错误处理必须用 `try/catch`，禁止静默吞掉异常

---

## 二、项目结构规范

### 2.1 Monorepo 结构

```
ai-studybuddy/
├── apps/
│   ├── mobile/          # React Native (Expo) 前端
│   └── server/          # Node.js (Fastify) 后端
├── packages/
│   └── shared/          # 前后端共享的类型和常量
├── docs/                # 项目文档（全部放这里）
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── dev-rules.md     # 本文档
│   ├── frontend-guidelines.md
│   ├── backend-guidelines.md
│   ├── test-plan.md
│   ├── todo-list.md
│   ├── lessons.md
│   └── buglist.md
├── docker-compose.yml
└── turbo.json
```

### 2.2 文件归属规则

| 代码属于哪端 | 放哪里 |
|-------------|--------|
| UI组件、页面 | `apps/mobile/` |
| API路由、业务逻辑 | `apps/server/` |
| AI调用封装 | `apps/server/src/ai/` |
| 数据库schema/迁移 | `apps/server/src/db/` |
| 前后端共用的类型定义 | `packages/shared/types/` |
| 前后端共用的枚举/常量 | `packages/shared/constants/` |

### 2.3 文件职责规则

- **一个文件一个职责**：组件文件只放组件，service文件只放业务逻辑
- **文件不超过 300 行**：超过必须拆分，除非是自动生成的文件（如 schema）
- **index.ts 只做导出**：目录下的 `index.ts` 只负责 re-export，不放逻辑

### 2.4 新增模块检查清单

新增任何模块前，确认以下事项：

- [ ] 这个模块属于 mobile 还是 server 还是 shared？
- [ ] 是否需要在 docs/ARCHITECTURE.md 中更新模块说明？
- [ ] 是否涉及新表？需要在 schema.ts 中定义并生成迁移
- [ ] 是否涉及新API？需要遵循 API 设计规范（见第五节）
- [ ] 是否有对应的测试用例？

---

## 三、AI 行为约束

> 本节是给AI的"紧箍咒"，AI必须严格遵守。

### 3.1 修改代码时

| 规则 | 说明 |
|------|------|
| 只改必要的部分 | 不要顺手重构、不要"顺便优化"不相关的代码 |
| 不要重写整个文件 | 用精确的搜索替换，只修改目标代码段 |
| 不要删除已有注释 | 除非注释明确标注为"临时"或"TODO" |
| 不要改动已有样式 | 修改组件逻辑时，不触碰已有的 style/样式代码 |
| 保留已有import | 不要删除或重排已有的 import 语句 |
| 完成后列出改动点 | 每次修改后，列出所有修改的文件和具体变更摘要 |

### 3.2 新增代码时

| 规则 | 说明 |
|------|------|
| 遵循现有代码风格 | 先看目标文件已有的风格，保持一致 |
| 不自行引入新依赖 | 需要新依赖时，先说明理由并等待确认 |
| 不硬编码配置值 | 所有配置（URL、密钥、阈值）放 `.env` 或常量文件 |
| 不创建多余文件 | 能在现有文件中实现的，不新建文件 |
| 错误处理不能留空 | 每个 async 函数必须有 try/catch 或明确的错误传播 |
| 单个任务代码量 ≤ 200行 | 超过说明任务粒度太大，需要拆分 |

### 3.3 绝对禁止

- ❌ 在代码中硬编码 API Key、密码、Token
- ❌ 使用 `console.log` 做生产日志（用 pino 日志库）
- ❌ 使用 `var` 声明变量
- ❌ 使用 `==` 比较（统一用 `===`）
- ❌ 使用 `// @ts-ignore` 或 `// @ts-nocheck`
- ❌ 在循环中使用 `await`（用 `Promise.all` 或 `Promise.allSettled`）
- ❌ 捕获异常后静默忽略（至少记日志）
- ❌ 在组件渲染函数中直接调用API（必须用 useEffect 或 action）
- ❌ 修改与当前任务无关的代码
- ❌ 在没有确认的情况下删除任何文件

---

## 四、Git 规范

### 4.1 提交信息格式

```
<type>(<scope>): <subject>

[body]

[footer]
```

### 4.2 Type 类型

| type | 用途 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(quiz): 实现选择题AI出题` |
| `fix` | 修复Bug | `fix(auth): 修复Token刷新逻辑` |
| `refactor` | 重构（不改功能） | `refactor(ai): 抽取CoT解析公共方法` |
| `docs` | 文档更新 | `docs: 更新API设计文档` |
| `style` | 代码格式调整 | `style: 统一import排序` |
| `test` | 添加/修改测试 | `test(quiz): 补充出题边界测试` |
| `chore` | 构建/工具变更 | `chore: 升级Expo SDK` |
| `perf` | 性能优化 | `perf(upload): 录音分片上传优化` |

### 4.3 Scope 范围

对应项目模块：`auth`, `courses`, `sessions`, `recordings`, `notes`, `organize`, `quiz`, `homework`, `submissions`, `error-book`, `tasks`, `visibility`, `ai-config`, `ai`, `db`, `mobile`, `server`, `shared`

### 4.4 提交规则

- 一个 commit 只做一件事
- 提交前必须通过 TypeScript 类型检查（`tsc --noEmit`）
- 提交信息用中文或英文均可，但同一个项目内保持一致（推荐中文）
- 禁止提交包含 `.env`、密钥、Token 的文件

---

## 五、API 设计规范

### 5.1 基本规范

- RESTful 风格，统一前缀 `/api/v1`
- URL 使用 kebab-case：`/api/v1/question-sets`
- 资源用名词，操作用 HTTP 方法：`GET /courses`, `POST /courses`, `PATCH /courses/:id`
- 嵌套最多一层：`/courses/:id/sessions`，不出现 `/courses/:id/sessions/:sid/recordings/:rid/...`

### 5.2 响应格式

```typescript
// 成功
interface ApiResponse<T> {
  code: 0;
  message: 'ok';
  data: T;
}

// 失败
interface ApiError {
  code: number;      // 业务错误码，如 40001
  message: string;   // 用户可读的错误描述
  data: null;
}

// 分页（服务端响应，字段用 snake_case，与数据库字段一致）
interface PaginatedResponse<T> {
  code: 0;
  message: 'ok';
  data: {
    items: T[];
    total: number;
    page: number;
    page_size: number;
  };
}
```

**规则：API 响应体（wire format）统一用 `snake_case`**，与数据库字段命名一致，避免序列化时做无谓的字段名转换。前端 TypeScript 类型内部用 `camelCase`（见 1.2 命名规范），在 `lib/api-client.ts` 中做一次性的 snake_case ↔ camelCase 转换（如用 `camelcase-keys` 库），业务代码不直接接触 API 原始响应。

### 5.3 错误码规范

| 范围 | 模块 |
|------|------|
| 40001-40099 | 认证相关 |
| 40101-40199 | 权限相关 |
| 40201-40299 | 课程/课次相关 |
| 40301-40399 | 记录/素材相关 |
| 40401-40499 | AI整理相关 |
| 40501-40599 | 写题相关 |
| 40551-40579 | 错题本相关 |
| 40601-40699 | 任务调度相关 |
| 40701-40799 | 家长可见相关 |
| 40801-40899 | AI配置相关 |
| 50001-50099 | 服务内部错误 |

### 5.4 路由文件规范

```typescript
// routes/courses.ts
import { FastifyInstance } from 'fastify';

export default async function courseRoutes(fastify: FastifyInstance) {
  // GET /api/v1/courses - 列表
  fastify.get('/', { /* schema + handler */ });

  // POST /api/v1/courses - 创建
  fastify.post('/', { /* schema + handler */ });

  // GET /api/v1/courses/:id - 详情
  fastify.get('/:id', { /* schema + handler */ });

  // PATCH /api/v1/courses/:id - 更新
  fastify.patch('/:id', { /* schema + handler */ });

  // DELETE /api/v1/courses/:id - 删除
  fastify.delete('/:id', { /* schema + handler */ });
}
```

- 路由文件只定义路由和请求验证 schema，业务逻辑放 `services/` 目录
- 每个路由必须定义请求参数 schema（query/body/params）
- 认证路由必须通过 middleware 校验 JWT

---

## 六、数据库规范

### 6.1 Schema 定义（Drizzle ORM）

```typescript
// db/schema.ts
import { pgTable, uuid, varchar, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';

// 枚举定义
export const userRoleEnum = pgEnum('user_role', ['student', 'parent']);
export const taskStatusEnum = pgEnum('task_status', [
  'pending', 'in_progress', 'submitted', 'graded', 'overdue', 'skipped'
]);

// 表定义
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  role: userRoleEnum('role').notNull().default('student'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
```

### 6.2 规范要点

| 规则 | 说明 |
|------|------|
| 主键统一用 UUID | `uuid().primaryKey().defaultRandom()` |
| 时间统一用 TIMESTAMPTZ | `timestamp('xxx', { withTimezone: true })` |
| JSON字段用 JSONB | `jsonb('field_name')` |
| 表名用复数小写 | `users`, `courses`, `question_sets` |
| 字段名用 snake_case | `created_at`, `display_name` |
| 软删除用 deleted_at | 需要软删除的表加 `deleted_at` 字段 |
| 迁移文件必须有描述 | `drizzle-kit generate --name="add_encouragements_table"` |
| 禁止直接修改已有迁移 | 只能新增迁移，不能改已有的 |

---

## 七、前端规范（React Native / Expo）

### 7.1 组件规范

```typescript
// components/CourseCard.tsx
import { View, Text } from 'react-native';
import { StyleSheet } from 'react-native';

interface CourseCardProps {
  name: string;
  teacher: string;
  sessionCount: number;
  onPress?: () => void;
}

export function CourseCard({ name, teacher, sessionCount, onPress }: CourseCardProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.teacher}>{teacher}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { /* ... */ },
  name: { /* ... */ },
  teacher: { /* ... */ },
});
```

**规则：**

- 组件用 `function` 声明导出，不用 `export default`（除非是页面组件）
- Props 必须定义 `interface`，命名为 `XxxProps`
- 样式用 `StyleSheet.create`，不内联
- 修改组件逻辑时，不触碰已有的 `styles` 对象
- 事件处理函数命名：`handleXxx`（如 `handlePress`, `handleSubmit`）

### 7.2 状态管理（Zustand）

```typescript
// stores/courseStore.ts
import { create } from 'zustand';
import type { Course } from '@ai-studybuddy/shared/types';

interface CourseState {
  courses: Course[];
  loading: boolean;
  fetchCourses: () => Promise<void>;
}

export const useCourseStore = create<CourseState>((set) => ({
  courses: [],
  loading: false,
  fetchCourses: async () => {
    set({ loading: true });
    try {
      const data = await api.getCourses();
      set({ courses: data, loading: false });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
}));
```

**规则：**

- 一个 store 对应一个业务域（courseStore, taskStore, authStore）
- store 中不放 UI 状态（如 modal 显示/隐藏），UI 状态用组件内 useState
- API 调用统一走 `lib/api-client.ts`，不在 store 中直接写 fetch

### 7.3 页面规范

- 页面文件放在 `app/` 目录下，遵循 Expo Router 文件系统路由
- 页面组件可以 `export default`
- 数据获取在页面组件中用 `useEffect` 或 React Query
- 复杂逻辑抽取到 `lib/` 或 `services/`，页面只做组合和渲染

---

## 八、后端规范（Fastify）

### 8.1 分层架构

```
routes/     → 路由定义 + 请求验证 schema（薄层）
services/   → 业务逻辑（核心）
ai/         → AI服务调用封装
workers/    → BullMQ异步任务
db/         → 数据库 schema + 迁移
middleware/ → 认证、权限、日志、错误处理
```

**规则：**

- routes 不写业务逻辑，只调用 service
- service 不直接操作 request/response，只处理业务
- AI 调用全部异步走 BullMQ 队列，不在路由中同步调用 AI
- 数据库操作封装在 service 中，不直接暴露 db 实例给 route

### 8.2 日志规范

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty' }
    : undefined,
});

// ✅ 正确
logger.info({ userId, courseId }, 'Course created');
logger.error({ err, taskId }, 'Task processing failed');

// ❌ 禁止
console.log('user created');
```

### 8.3 错误处理

```typescript
// 自定义业务错误
class AppError extends Error {
  constructor(
    public code: number,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
  }
}

// 使用
throw new AppError(40001, '用户名或密码错误', 401);

// 全局错误处理（middleware）
fastify.setErrorHandler((error, request, reply) => {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send({
      code: error.code,
      message: error.message,
      data: null,
    });
  } else {
    request.log.error(error);
    reply.status(500).send({
      code: 50001,
      message: '服务内部错误',
      data: null,
    });
  }
});
```

---

## 九、环境变量规范

```bash
# .env.example（提交到 Git）
NODE_ENV=development
PORT=3000

# 数据库
DATABASE_URL=postgresql://user:pass@localhost:5432/studybuddy

# Redis
REDIS_URL=redis://localhost:6379

# 对象存储（MinIO）
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=studybuddy

# AI服务（录音转写，自部署）
ASR_SERVICE_URL=http://localhost:8080   # SenseVoice 或 FunASR 服务地址

# AI服务（OCR，自部署）
OCR_SERVICE_URL=http://localhost:8081   # PaddleOCR 服务地址

# AI Provider默认配置（用户可在App内自定义替换）
AI_DEFAULT_PROVIDER=deepseek
AI_DEFAULT_BASE_URL=https://api.deepseek.com/v1
AI_DEFAULT_API_KEY=sk-xxx
AI_DEFAULT_MODEL=deepseek-v4-flash

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

**规则：**

- `.env` 不提交到 Git，只提交 `.env.example`
- `.env.example` 中放示例值，不放真实密钥
- 所有配置通过 `packages/shared` 中的 config 模块统一读取和校验
- 不在代码中直接读 `process.env`，通过 config 模块间接访问

---

## 十、经验教训（持续更新）

> 每次踩坑后，将可复用的经验提炼为规则，补充到对应章节。
> 格式：`[日期] 问题简述 → 提炼的规则 → 补充到哪个章节`

*暂无，开发中积累。*

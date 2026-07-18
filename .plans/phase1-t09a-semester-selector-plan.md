# Phase 1-T09A 学期创建、选择与切换实施计划（v4，待用户批准）

> **给实施 Agent：** 获得用户明确批准后，必须按本计划逐项使用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans` 执行；每个复选框是可追踪步骤。本计划本身不授权创建任务分支或改动业务代码。

**目标：** 以正式、可恢复的学期入口替代学生端手输 UUID：支持创建、OCR/规则预览与确认、列表、当前选择与切换，并使刷新及既有课程/考试/任务/时间线始终处于受控当前学期。

**架构：** 当前学期仅保存在全局 `studybuddy.db` 的 `app_meta.current_semester_id`，前端启动从后端读取它，不读取或写入浏览器 UUID 配置。学期创建沿用并收紧既有 staging 学期库 → checkpoint/关闭 → global `ready=0` 索引 → 原子目录 promote → 同一 global transaction 写 `ready=1` 和 current 的流程；课程与课表使用既有 `schedule_entries` 这一唯一事实源，v8 只对其做兼容升级，绝不创建第二张课表表。服务启动时在监听 HTTP 前受控升级所有 canonical、`ready=1` 的历史学期库至 v8；selector 只接受已是当前 v8 的数据库。

**技术栈：** Express 4、better-sqlite3、SQLite migration、multer、React/Vite/React Router、Vitest（既有前端测试配置）、Node `node:test` 集成测试、Playwright；生产 OCR 复用现有 `OcrConverter`，测试经注入的确定性识别器，不依赖 Python/RapidOCR/外部 Provider。

---

## 0. 门禁、范围与已定结论

### 0.1 当前门禁

- `docs/04-开发任务清单-Todo-List.md` 已登记 T09A；当前仅允许“计划 → 独立审查 → 用户明确批准”。
- 在用户明确批准本计划前：**不得创建** `codex/phase1-t09a-semester-selector`，不得新建任何业务 migration/API/UI/test，不得改写 S2/S3/S4/S6 行为。
- 批准后实施必须从最新 `origin/master` 创建推荐任务分支；实施收尾按 `docs/12` 的固定 fast-forward 流程合入，并只在 `origin/master` 含提交后报告完成。

### 0.2 T09A 做与不做

| 范围 | 本计划结论 |
| --- | --- |
| 创建新学期 | 输入名称、起止日期；第一次还输入学生姓名；上传课程表图像，得到可编辑的课程/课表预览后一次确认创建。 |
| 学期列表、当前状态、选择/切换 | 后端列出可选择学期、读写当前学期；前端显示名称、日期、当前状态，并在切换后回到安全的 `/courses`。 |
| 首次使用与错误 | 无学期时直接引导 `/semesters`；覆盖重复名称、非法日期、文件真实性/OCR/预览过期、创建失败与 stale current。 |
| 隔离与刷新 | 既有业务 API 继续显式接收 App 控制的 `semesterId`；E2E 证明切换后课程、考试、任务、时间线互斥，刷新恢复当前学期。 |
| 不做 | 不做 T09B 每日首页、T09C 已建课表查看/编辑、T09D 全局导航重构、T09E 历史/归档 UI、S5、S7、家长 Web 面板、云同步或多用户。 |

### 0.3 不变量

1. `schedule_entries` 是唯一课程表事实源；数据库/API/UI 统一 `weekday: 0..6`（周日为 0，周六为 6），不使用 1..7 也不保留双向映射。
2. 可选择学期必须同时满足：`semesters.ready=1`、`status='active'`、受控相对路径、`semester.db` 存在、不是符号链接逃逸、可安全真正只读打开且 semester migration 版本**恰为当前 v8**。坏记录、未来版本或升级失败记录不列表、不允许选择、不可泄漏绝对路径。
3. `ready=1` 与 `app_meta.current_semester_id=<candidate>` 必须在**同一个全局 SQLite transaction**写入；失败回滚后二者均不改变，既有 current 必须保留。
4. 首次创建时必须明确写入一个学生；已有且仅有一个全局学生时复用它；0 个或多于 1 个学生的未预期状态必须返回可恢复错误，不能静默任选或重复创建学生。
5. preview 的 `clientId` 仅在请求/编辑 DTO 内关联；`course_instances.id`、`schedule_entries.id`、`semesterId` 均由服务端生成。
6. 原始上传、OCR 原文、Python stderr、临时绝对路径、完整 UUID 不得回传 UI、写入计划交付证据或正常日志。

### 0.4 后端 API 契约

统一响应为 `{ success, data, error }`；所有错误使用稳定代码与可展示中文消息，响应不含路径/stack/OCR 原文。

| 方法与路径 | 成功数据/状态 | 输入与失败语义 |
| --- | --- | --- |
| `GET /api/semesters` | 200，`SemesterSummaryDto[]`；仅返回可选择 active 学期，`name` 映射既有 `semester_code` | 若存在坏 `ready=1` 行则跳过并记录脱敏诊断；不暴露路径。 |
| `GET /api/semesters/current` | 200，`CurrentSemesterDto`，固定为 `{ semester: SemesterSummaryDto | null, recoveredFromStaleCurrent: boolean }` | stale key 在服务端 transaction 中删除，随后返回 `{ semester: null, recoveredFromStaleCurrent: true }`；首次无学期则为 `{ semester: null, recoveredFromStaleCurrent: false }`；不能返回 409。 |
| `PUT /api/semesters/current` | 200，选中的 `SemesterSummaryDto` | body `{ semesterId }`；空/格式错误 400；不存在或不可选择 409 `SEMESTER_NOT_SELECTABLE`；失败不得更改旧 current。 |
| `POST /api/semesters/previews` | 201，`SemesterPreviewDto`（含 `previewId`、`requiresStudentName`、课程与课表草稿、规则解析置信度及 warnings） | `multipart/form-data`：`name`、`teachingStartDate`、`teachingEndDate`、首次所需的 `studentName`、字段 `timetableImage`。日期/名称/学生 400，伪 MIME/魔数 415，大小/像素超限 413，OCR/无法解析 422。 |
| `POST /api/semesters/previews/:previewId/confirm` | 201，创建的 `SemesterSummaryDto`，并成为 current | body 是完整修正后的 `SemesterConfirmDto`；preview 不存在/过期 410；重复名称 409 `SEMESTER_CODE_EXISTS`；同 preview 并发 confirm 单飞并返回同一成功结果或同一可恢复失败。 |

`SemesterPreviewDto` 和 `SemesterConfirmDto` 的限制固定为：名称/学生姓名各 trim + Unicode NFC 后 1–100 字符；课程 1–80 门；每门名称 1–100 字符；课表 1–400 条；`location` 最长 160；`clientId` 全局唯一且仅 `[A-Za-z0-9_-]{1,64}`；`weekday` 为整数 0–6；时间严格 `HH:mm` 且 end 大于 start；同课程不得有同一 `(weekday,startTime,endTime)` 重复条目。所有校验由服务端重新执行，前端只是帮助用户修正。

### 0.5 数据、文件与失败生命周期

- **历史 ready 学期升级：** 新建受控 `upgradeReadySemesterDatabases(appDataRoot)`，在 `bootstrapBackend` 完成全局库初始化且 HTTP server 监听前执行。它仅枚举 canonical 且 `ready=1` 的全局行，经过相同路径边界检查后用可写 `migrateSemesterDb()` 将 v1–v7 顺序升级到 v8；v8 是幂等 no-op。缺失/损坏/未来版本/升级失败的行不创建目录、不改 ready、不阻塞其他学期启动，只记录稳定脱敏错误码，随后由 selector 视为不可选择；若它是 current，则 current 读取负责清键。
- **当前选择：** `app_meta` 的键固定为 `current_semester_id`。`SemesterSelectorService.resolveSelectableSemester()` 是 list/current/select 共用的唯一判定入口；它验证 `db_relative_path` 仍等于规范的 `semesters/<uuid>/semester.db` 并通过路径/realpath 边界检查，使用新增的 `openReadOnlyExistingDbAtPath()`（`readonly + fileMustExist`，不设置 WAL 或其他写 pragma）检查 `schema_migrations` 恰为 v8，随后关闭连接。
- **v8 migration：** 不建新课表表。对既有 `schedule_entries` `ALTER TABLE` 增加 `source TEXT NOT NULL DEFAULT 'legacy'`、`source_confidence REAL`；为 source 枚举 `legacy|ocr|student_confirmed`、置信度 `NULL 或 0..1`、`weekday 0..6`、严格时间/时段建立 insert/update validation triggers；建立 `(course_instance_id, weekday, start_time)` 索引和避免相同完整时段重复的 unique index。v7 已有数据保留原课程关联、weekday、开始/结束、地点和 timestamps，新增列默认为 `legacy`/`NULL`。
- **上传与 preview：** router 固定 `upload.single('timetableImage')`，使用 `memoryStorage` 与 `limits: { files: 1, fileSize: 10 * 1024 * 1024, parts: 8, fields: 6 }`；`MulterError` 的 `LIMIT_FILE_SIZE` 映射 413，其他超限映射 400，拒绝第二文件/未知文件字段。服务在验证前将内存 buffer 写为 `APP_DATA_ROOT/tmp/semester-onboarding/<server-preview-id>/upload.<server-derived-extension>`。目录名和文件名仅服务端生成；用 `O_CREAT|O_EXCL|O_NOFOLLOW` 写入、realpath 后仍须在 onboarding 根目录内。先检查 PNG/JPEG/WebP magic bytes，再读取尺寸；单文件已由 multer 提前限制为 10 MiB，像素至多 24,000,000；新 `timetable-image-validation.ts` 仅解析 PNG/JPEG/WebP 头部尺寸，不解码或引入新图像库。preview 的内存元数据与临时目录 TTL 15 分钟；每次 preview/create、服务启动和显式 cleanup 都清理到期目录，成功/失败同样清理。
- **OCR 注入点：** `TimetableRecognizer.recognize(inputPath)` 返回 `{ text }`；生产 `OcrTimetableRecognizer` 只把受控路径字符串交给 `new OcrConverter().convert(inputPath)`，绝不传 Buffer，因而不让 `OcrConverter` 在 OS 临时目录再写副本。`TimetableRuleParser` 只根据识别文本计算 `parserConfidence`；UI 文案必须写“规则解析置信度”，不得声称获得 OCR 行级置信度。测试和 E2E 注入 `FakeTimetableRecognizer`。
- **确认状态机：**
  1. 验证/claim preview，复核学生归属与全部 DTO；
  2. 创建 candidate staging 目录，运行 semester migrations；
  3. 在单一 semester DB transaction 写 server-generated `course_instances`，再写 `schedule_entries`（确认后的来源为 `student_confirmed`，解析置信度仅在可关联时写入）；
  4. `checkpointAndClose(stagingDb)` 完成后才能继续；
  5. global DB 单一 transaction 插入 candidate `semesters.ready=0`（并在首次时创建 student）；
  6. staging 目录原子 rename 到 final；
  7. global DB 单一 transaction 将 candidate `ready=1` 并 upsert candidate current；
  8. 标记同 preview 成功结果（供网络重试读取）后清理 preview 文件。
- **补偿与日志：** candidate 任一步失败只删除 candidate global 行、candidate staging/final 目录和 preview 文件。若 candidate 尚未成为 current，绝不触碰旧 current；若 final current transaction 已回滚，则旧 current 原样保留。首次创建失败最终没有 key/返回 null；已有旧 current 创建第二学期失败仍返回旧 current。确认成功响应因网络丢失时，同一进程的短期 completed cache 返回相同 201；进程重启后 preview 过期则返回 410 且前端提示“预览已过期，请从学期列表确认是否已创建后重试”，不能创建第二份。现有 `writeMaintenanceFailure()` 同步改为只写稳定错误码、阶段和固定短摘要，绝不写 `Error.message`、临时路径、OCR 文本或 stderr；相关测试读取维护日志验证该边界。

---

## 1. 预期文件结构（批准后）

| 文件 | 操作 | 单一职责 |
| --- | --- | --- |
| `packages/shared/src/types.ts` | 修改 | `SemesterSummaryDto`、`CurrentSemesterDto`、preview/confirm DTO、稳定 error code 所需共享契约。 |
| `packages/backend/src/db/sql/migration-semester-v8.ts` | 新建 | 仅升级既有 `schedule_entries` 的元数据、索引和约束 trigger。 |
| `packages/backend/src/db/migrations.ts` | 修改 | 把 v8 追加在 v7 后，绝不重排历史版本。 |
| `packages/backend/src/db/connection.ts` | 修改 | 增加不会创建/写 pragma 的 `openReadOnlyExistingDbAtPath()`。 |
| `packages/backend/src/db/ready-semester-upgrader.ts` | 新建 | bootstrap 前有界升级 canonical `ready=1` 学期库；不升级坏路径。 |
| `packages/backend/src/db/semester-initializer.ts` | 修改 | 可注入候选初始课程/课表、checkpoint 顺序、current 原子提交、仅清 candidate 的补偿与脱敏维护日志。 |
| `packages/backend/src/services/timetable-recognizer.ts` | 新建 | 生产 OCR wrapper 与可测试接口。 |
| `packages/backend/src/services/timetable-rule-parser.ts` | 新建 | 将识别文本转为受限 preview 草稿与规则解析置信度。 |
| `packages/backend/src/services/timetable-image-validation.ts` | 新建 | 验证 PNG/JPEG/WebP magic bytes 和像素上限；不写文件。 |
| `packages/backend/src/services/semester-selector-service.ts` | 新建 | selectable 判定、学生解析、preview、confirm 单飞、列表/current/select。 |
| `packages/backend/src/api/semester-selector.ts` | 新建 | multer、HTTP DTO 与错误信封映射；不含业务事务。 |
| `packages/backend/src/app.ts`、`packages/backend/src/bootstrap.ts` | 修改 | 在现有 `/api` origin policy 后注册 selector router；启动期调用 ready-semester upgrader。 |
| `packages/backend/test/semester-initialization.test.mjs` | 修改 | v7→v8 数据升级、启动升级、状态机和各失败阶段补偿。 |
| `packages/backend/test/semester-selector-api.test.mjs` | 新建 | HTTP 合同、文件安全、preview/confirm/选择和学生归属集成测试。 |
| `packages/frontend/src/api/semester-api.ts` | 新建 | 学期 API 封装；使用 `FormData` 时不手写 multipart Content-Type。 |
| `packages/frontend/src/pages/semester-selector-page.tsx` | 新建 | 首次/列表、创建表单、上传、可编辑预览、确认、错误与键盘焦点。 |
| `packages/frontend/src/components/current-semester-control.tsx` | 新建 | 仅展示当前名称/日期/状态与“管理学期”，不显示 UUID。 |
| `packages/frontend/src/app.tsx` | 修改 | 后端 current 启动状态机、路由守卫、切换回调，删除旧浏览器 UUID 表单。 |
| `packages/frontend/src/pages/course-page.tsx` | 修改 | 无 current 时提供“前往创建或选择学期”，不再提示手输 ID。 |
| `packages/frontend/src/components/app-navigation.tsx`、`packages/frontend/src/styles/global.css` | 修改 | 最小导航入口与学期向导/状态/error 样式；不实施 T09D 重构。 |
| 既有前端测试文件或 `packages/frontend/src/**/__tests__/semester-selector*.test.*` | 新建/修改 | API、启动状态、表单与切换 UI 断言，沿用仓库实际 Vitest 结构。 |
| `packages/backend/test/e2e-server.ts` | 新建 | 仅 Playwright 使用的 app/server harness，显式注入 `FakeTimetableRecognizer`；生产 server 不接受测试替换。 |
| `playwright.config.ts` | 修改 | 后端 webServer 改为启动 E2E harness，并保持正式 `server.ts` 无测试入口。 |
| `e2e/semester-selector.spec.ts` | 新建 | 无 E2E 外部 OCR 依赖的创建、切换、刷新和隔离验收。 |
| `e2e/*.spec.ts` | 修改 | 移除旧浏览器 UUID 注入和 UUID 输入交互，改走受控测试 current API/fixture。 |
| `docs/00-文档索引-Index.md`、`docs/04-开发任务清单-Todo-List.md` | 计划/实现收尾时修改 | 同步计划存在、审查/批准状态；实现完成后才勾选 T09A 并登记 branch/hash/master/push/验证。 |

---

## 2. 批准后实施任务

### Task 1：先用测试锁定 `schedule_entries` v8 兼容升级

**Files:** 修改 `packages/shared/src/types.ts`、`packages/backend/src/db/migrations.ts`；新建 `packages/backend/src/db/sql/migration-semester-v8.ts`；修改 `packages/backend/test/semester-initialization.test.mjs`。

- [ ] **Step 1：添加 v7 fixture 和失败断言。** 在测试中先按 v7 建库，插入一条 course 与一条 `schedule_entries`（weekday 0、有效时间、地点）；再跑 migration。断言版本为 8，原字段逐字保留，`source='legacy'`、`source_confidence IS NULL`。分别断言 source 非法、confidence 为 -0.1/1.1、weekday 为 7、`09:60`、end 不大于 start、同 course 完全重复时段写入均失败。

- [ ] **Step 2：运行红测。**

  ```powershell
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09a-migration-red'
  pnpm -r --filter backend run test -- semester-initialization.test.mjs
  ```

  预期：失败原因仅为缺少 v8 schema/升级约束，v7 fixture 不被删改成假通过。

- [ ] **Step 3：实现 migration 与共享 DTO。** 按 §0.5 对 `schedule_entries` 追加两个列、trigger 和索引；migration runner 只追加 v8。共享 DTO 明确 `weekday: 0|1|2|3|4|5|6`、`sourceConfidence?: number` 和 `clientId` 仅请求层语义；所有实际 DB ID 保持服务端生成。

- [ ] **Step 4：运行绿测并提交原子变更。**

  ```powershell
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09a-migration-green'
  pnpm -r --filter backend run test -- semester-initialization.test.mjs
  git add packages/shared/src/types.ts packages/backend/src/db/sql/migration-semester-v8.ts packages/backend/src/db/migrations.ts packages/backend/test/semester-initialization.test.mjs
  git commit -m "feat(semester): 升级既有课表条目元数据"
  ```

  预期：升级和全部非法写入断言通过，仓库不存在第二张课表表。

### Task 2：升级历史 ready 学期，收紧初始化状态机、学生归属与 selectable 判定

**Files:** 修改 `packages/backend/src/db/connection.ts`、`packages/backend/src/db/semester-initializer.ts`、`packages/backend/src/bootstrap.ts`、`packages/backend/test/semester-initialization.test.mjs`；新建 `packages/backend/src/db/ready-semester-upgrader.ts`、`packages/backend/src/services/semester-selector-service.ts`。

- [ ] **Step 1：为升级器和 initializer/service 写失败测试。** 覆盖 v7 ready 学期在 bootstrap 前升级为 v8、v8 重启幂等、version=0/未来版本/缺 `schema_migrations`/坏 canonical 路径/升级失败不创建或修改数据且不会阻断另一有效学期；若坏行是 current，后续 current 返回 recovery。再覆盖空 global 首次创建需要 `studentName`；已有唯一 student 创建第二学期复用其 ID/姓名；0 或多学生异常给出稳定错误；第二次失败不删除/改写已有 student。对已有旧 current 分别注入初始 course/schedule transaction、checkpoint、rename、final ready/current transaction 失败，断言 old current 保留且 candidate 行/目录清除；首次失败断言 current 为 null。

- [ ] **Step 2：为 selectable 共享入口写测试。** 构造 `ready=1` 但 db 缺失、相对路径不匹配、文件为目录/符号链接、version=0、version>8、schema 表缺失的行。断言 list 全不显示、select 一律 409 `SEMESTER_NOT_SELECTABLE`、current 清键后返回 `CurrentSemesterDto` 的 `{ semester: null, recoveredFromStaleCurrent: true }`；有效 v8 学期可 list/current/select。

- [ ] **Step 3：实施升级器与真正只读检查。** `openReadOnlyExistingDbAtPath()` 必须以 `readonly: true, fileMustExist: true` 打开且不得设置 journal/WAL pragma；`ready-semester-upgrader.ts` 在 bootstrap 的 HTTP 监听前逐个升级已验证的 ready DB。升级器只调用现有 migration runner，不创建目录，不把损坏/未来数据库误升级；返回脱敏结果供固定日志使用。

- [ ] **Step 4：实施严格状态机。** `SemesterInitializationInput` 接收已校验的 candidate course/schedule，不接受 client 生成的 DB ID；在 staging semester DB transaction 写课程后写 `schedule_entries`，执行 `checkpointAndClose`，随后依 §0.5 执行两个 global transaction 和 rename。补偿按 candidate ID 精确删除，`DELETE app_meta` 仅在 `value=candidateId` 时执行；每个 catch 分支关闭连接后再删目录。

- [ ] **Step 5：实施 student 解析与 `resolveSelectableSemester`。** service 读取全局 students：首次必须由 preview/confirm 带已规范化 studentName 创建；正好一个则复用，任何其他数量为 `STUDENT_PROFILE_INCONSISTENT` 409。`resolveSelectableSemester` 是 list/current/select 的唯一入口，使用受控路径+真正只读检查；current 失效时 transaction 删除 key 后返回确定的 `CurrentSemesterDto`。

- [ ] **Step 6：回归并提交。**

  ```powershell
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09a-initializer'
  pnpm -r --filter backend run test -- semester-initialization.test.mjs
  git add packages/backend/src/db/connection.ts packages/backend/src/db/ready-semester-upgrader.ts packages/backend/src/db/semester-initializer.ts packages/backend/src/bootstrap.ts packages/backend/src/services/semester-selector-service.ts packages/backend/test/semester-initialization.test.mjs
  git commit -m "feat(semester): 原子初始化与当前学期选择"
  ```

  预期：历史 v7 已升级、坏库不可选择、所有候选失败路径保留 old current，首次失败无 current，list/current/select 对坏记录一致。

### Task 3：实现受控 OCR preview、confirm 并发和 HTTP 边界

**Files:** 新建 `packages/backend/src/services/timetable-recognizer.ts`、`packages/backend/src/services/timetable-rule-parser.ts`、`packages/backend/src/services/timetable-image-validation.ts`、`packages/backend/src/api/semester-selector.ts`、`packages/backend/test/semester-selector-api.test.mjs`；修改 `semester-selector-service.ts`、`packages/backend/src/db/semester-initializer.ts`、`packages/backend/src/app.ts`。

- [ ] **Step 1：添加 API 红测。** 以 `FakeTimetableRecognizer` 固定返回文本，覆盖空库 list/current、首创 preview/confirm、第二学期不再要求姓名、重复 canonical name、`2026-02-30`/start>end、重复 clientId/课程/时段、并发 confirm、服务重建后的 current。另覆盖伪 MIME、错误魔数、multer >10 MiB/第二文件/parts 超限、>24MP、符号链接/路径逃逸、OCR throw、TTL 过期、成功/失败 cleanup，断言 API 响应和维护日志均无临时路径/OCR 原文/stderr。

- [ ] **Step 2：运行红测。**

  ```powershell
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09a-selector-red'
  pnpm -r --filter backend run test -- semester-selector-api.test.mjs
  ```

  预期：缺路由/preview service/稳定 error mapping 失败；不允许通过本机 Python 或真实 OCR 获得偶然成功。

- [ ] **Step 3：实现 recognizer、parser 与 preview 生命周期。** recognizer 接口只接收 path；生产 wrapper 调现有 `OcrConverter` 的 string 输入。parser 输出课程与 `weekday 0..6` 条目及规则解析置信度；解析失败由 422 返回，不落正式库。API 固定 `single('timetableImage')` 与 limits，并在 `MulterError` 层映射状态码；新 header 解析器经 magic/尺寸验证后，才将临时文件放入受控 root；preview 服务使用 TTL cleanup、in-flight claim 与 completed result cache，所有异常 finally 清理候选资源。

- [ ] **Step 4：实现 router/错误映射。** 注册在现有 `/api` origin policy 后；`GET /semesters`、`GET /semesters/current`、`PUT /semesters/current`、`POST /semesters/previews`、`POST /semesters/previews/:previewId/confirm` 严格按 §0.4。SQLite `semesters.semester_code` unique constraint（包括并发竞争）统一映射为 409 `SEMESTER_CODE_EXISTS`，而不是 500。

- [ ] **Step 5：运行绿测并提交。**

  ```powershell
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09a-selector-green'
  pnpm -r --filter backend run test -- semester-selector-api.test.mjs
  git add packages/backend/src/services/timetable-recognizer.ts packages/backend/src/services/timetable-rule-parser.ts packages/backend/src/services/timetable-image-validation.ts packages/backend/src/services/semester-selector-service.ts packages/backend/src/api/semester-selector.ts packages/backend/src/db/semester-initializer.ts packages/backend/src/app.ts packages/backend/test/semester-selector-api.test.mjs
  git commit -m "feat(semester): 提供正式创建与选择接口"
  ```

  预期：API 契约、清理、安全边界、单飞、重复映射与刷新读回均通过。

### Task 4：替换学生端 UUID 输入为当前学期 UI

**Files:** 新建 `packages/frontend/src/api/semester-api.ts`、`packages/frontend/src/pages/semester-selector-page.tsx`、`packages/frontend/src/components/current-semester-control.tsx`；修改 `packages/frontend/src/app.tsx`、`packages/frontend/src/pages/course-page.tsx`、`packages/frontend/src/components/app-navigation.tsx`、`packages/frontend/src/styles/global.css` 和相应前端测试。

- [ ] **Step 1：写前端红测。** mock semester API 断言 App 启动 loading 后：`CurrentSemesterDto.semester` 为 null 用 `replace` 到 `/semesters`；`CurrentSemesterDto.recoveredFromStaleCurrent=true` 提示一次且不循环；有效 current 将它显式传入既有页面；header 只展示名称/日期/“管理学期”；不存在旧 UUID placeholder、应用/清除按钮。断言首创必须填学生姓名、第二创隐藏该项、inline 错误关联 `aria-describedby`，确认成功选择新学期，切换后路由为 `/courses`。

- [ ] **Step 2：运行红测。**

  ```powershell
  pnpm -r --filter @ai-studybuddy/frontend run test -- semester-selector
  ```

  预期：旧 App 浏览器 UUID 控件导致断言失败；若实际脚本不支持文件参数，则使用项目 Vitest 等价命令并在提交说明记录。

- [ ] **Step 3：实现 API 与状态机。** `semester-api.ts` 只消费后端信封，上传使用 `FormData`。App 消费确定的 `CurrentSemesterDto` 并保持 `currentSemester: loading | none | selected`，loading 时不渲染依赖 semester 的业务页；none 或 stale 恢复统一 replace `/semesters`；选择/确认成功更新受控 state、replace `/courses`，不写浏览器 UUID 配置。既有各子系统仍从 App 获得显式 ID，避免重构业务 API。

- [ ] **Step 4：实现最小可访问页面。** `/semesters` 在无学期时先说明首次创建，在已有时列出可选学期、current 徽标和切换；创建流表单→上传→预览编辑→确认，显示“规则解析置信度”与 warnings。错误保持用户输入，上传/OCR/重复/日期/过期均可继续操作；提交按钮 loading 禁用，失败焦点回到对应错误或主错误摘要。CSS 只增加本任务组件与窄屏可读布局，不做 T09D 导航重构。

- [ ] **Step 5：绿测、build、提交。**

  ```powershell
  pnpm -r --filter @ai-studybuddy/frontend run test -- semester-selector
  pnpm -r --filter @ai-studybuddy/frontend run build
  git add packages/frontend/src
  git commit -m "feat(semester): 移除手输学期入口"
  ```

  预期：前端源码/E2E 夹具不再含旧学生可见 UUID 输入；课程页无 current 时只有正式入口提示。

### Task 5：跨学期 E2E、完整验证、文档收尾与合并

**Files:** 新建 `packages/backend/test/e2e-server.ts`、`e2e/semester-selector.spec.ts`；修改 `playwright.config.ts`、其他受影响的 `e2e/*.spec.ts`、`docs/00-文档索引-Index.md`、`docs/04-开发任务清单-Todo-List.md`、本计划批准/实施记录。

- [ ] **Step 1：先建立确定性 E2E server harness。** `packages/backend/test/e2e-server.ts` 以 test-only factory 创建 app，显式注入 `FakeTimetableRecognizer`；`playwright.config.ts` 的 backend `webServer.command` 从仓库根目录执行，因此必须使用当前仓库实际可执行的 `pnpm --filter @ai-studybuddy/backend exec tsx test/e2e-server.ts`（或先在 `packages/backend/package.json` 增加等价 `e2e-server` 脚本后调用它），而不是裸 `tsx` 或生产 `dist/server.js`。命令沿用 Playwright webServer env 中的 `APP_DATA_ROOT`、`BACKEND_HOST`、`BACKEND_PORT`，测试注入只发生在 `test/e2e-server.ts` 中，生产 `server.ts` 不读取任何测试注入环境变量。

- [ ] **Step 2：写确定性浏览器流程。** E2E harness 的 fake recognizer 返回固定文本，不依赖 Python；创建“学期甲”并确认，创建课程/考试/任务/事件，创建“学期乙”并确认，切换两次。每次断言列表/header/current 与课程、考试、任务、时间线只显示本学期数据；刷新后仍为最后选择；窄屏 viewport 下创建表单可达，键盘可提交，错误后焦点可见。

- [ ] **Step 3：替换既有 E2E 前置条件。** 将所有旧浏览器 UUID 注入或 UUID 输入操作替换为受控 current fixture/API；保留各任务原测试目的，不重写为 selector 的重复测试。

- [ ] **Step 4：执行隔离 E2E 与全量验证。**

  ```powershell
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09a-e2e'
  pnpm type-check
  pnpm -r --filter backend run build
  pnpm -r --filter @ai-studybuddy/frontend run build
  pnpm test
  pnpm test:e2e
  powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
  git diff --check
  ```

  预期：所有命令通过；失败则先按 `superpowers:systematic-debugging` 定位根因并回归，不得为绿而删除断言。

- [ ] **Step 5：收尾文档和独立代码审查。** 仅当实现、验证和浏览器验收完成时，同步 `docs/00`、勾选 `docs/04` 对应 T09A 子项，更新本计划的批准/实施记录，登记隔离目录（不含数据）、命令、branch、commit、未实现边界。通过独立代码审查后再次运行治理/diff，并在 rebase 前单独提交文档收尾：`git add docs/00-文档索引-Index.md docs/04-开发任务清单-Todo-List.md .plans/phase1-t09a-semester-selector-plan.md; git commit -m "docs(phase1): 登记 T09A 交付证据"`。

- [ ] **Step 6：按仓库固定流程合入并在 master 复验。**

  ```powershell
  git checkout codex/phase1-t09a-semester-selector
  git fetch origin
  git rebase origin/master
  git checkout master
  git pull --ff-only origin master
  git merge --ff-only codex/phase1-t09a-semester-selector
  $env:APP_DATA_ROOT = 'I:\ai-studybuddy-tmp\runs\phase1-t09a-master-final'
  powershell -ExecutionPolicy Bypass -File scripts/check-docs-governance.ps1
  git diff --check
  pnpm type-check
  pnpm -r --filter backend run build
  pnpm -r --filter @ai-studybuddy/frontend run build
  pnpm test
  pnpm test:e2e
  git push origin master
  git status --short --branch
  ```

  预期：只能 fast-forward；所有 master 复验通过且状态显示无未提交变更、`origin/master` 包含实现提交后，才能报告 T09A 完成。

---

## 3. 验收矩阵

| 场景 | 自动化证据 | 浏览器证据 |
| --- | --- | --- |
| v7→v8 升级 | 原 `schedule_entries` 课程关联、weekday、时间、地点不丢失，新列为 `legacy`/null | 不适用 |
| 历史升级/selectable/stale | v7 ready 在启动时升级到 v8，v8 幂等；future/损坏 DB 不可选择；list/current/select 对坏记录一致；stale current 返回确定 `CurrentSemesterDto` | 启动一次提示并落 `/semesters`，无白屏/循环 |
| 第一次创建 | 空库需要学生姓名；创建后 ready/current/student/课程/课表均一致 | 无学期直接进入创建页并成功确认 |
| 后续创建 | 复用唯一学生，不改写其资料；重复 canonical name 409 | 第二次无需学生姓名，重复错误可修正 |
| 文件与 OCR | MIME+magic、尺寸、TTL、symlink、OCR failure、无路径/原文泄漏 | 上传/解析失败输入仍可重试 |
| 失败补偿 | course write/checkpoint/rename/final transaction 每个失败点：candidate 无残留；有旧 current 时它保持 | 不显示半个候选学期 |
| 切换/刷新 | current 写入后重建服务仍读同一学期 | header 状态正确，切换到 `/courses` 后刷新保持 |
| 跨学期隔离 | 两个 semester DB 的课程/考试/任务/事件/时间线查询互斥 | 页面不显示另一学期数据 |
| 消除手输 | 源码搜索与 E2E 不含旧学生可见 UUID 输入 | header 无 UUID 文本框 |

---

## 4. 非目标与风险控制

- 非 active/ready 的历史学期不在 T09A 选择器中显示；不在本任务实现归档状态编辑或历史 UI（留给 T09E）。
- 不改变既有课程、考试、任务、时间线 API 的显式 `semesterId` 参数；T09A 只移除学生**手工提供**它的路径。
- SQLite 与文件系统不能跨介质真 ACID，因此依赖 checkpoint、ready、rename、final transaction、精确补偿和失败注入测试；不得用“删除所有 current”掩盖状态机问题。
- OCR 质量不可靠时只提供可编辑草稿，不直接持久化；置信度来源被明确为规则解析，不夸大 OCR 能力。
- 临时文件只在 `APP_DATA_ROOT/tmp/semester-onboarding`，所有日志只记录脱敏错误码/短摘要；测试图像为合成夹具，截图存仓库外证据目录。

---

## 5. 计划自审（v4）

- 已覆盖用户列出的创建、列表、当前状态、首次使用、错误、切换、刷新、隔离和移除手输依赖。
- 已修正 v1 的三项 P0：不新增第二课表表；首次/后续学生归属明确；candidate 失败不删除既有 current，且 checkpoint 在 rename 前。
- 已覆盖 v2 复审问题：历史 ready 学期启动升级与真正只读 selectable 检查、确定的 stale current DTO、独立 E2E fake OCR harness、multer/维护日志安全、docs/00 同步与全量 E2E/master 复验。
- 本计划不包含 `TODO`、`TBD` 或“之后再补”式实现占位；批准前仍禁止进入实现。

---

## 6. 独立审查记录

| 版本 | 日期 | 审查状态 | 结论 |
| --- | --- | --- | --- |
| v1 | 2026-07-18 | 不通过 | 发现 P0：第二课表表、学生归属遗漏、旧 current 补偿矛盾；并记录 selectable、文件边界、OCR 注入、stale、幂等、merge 等 P1。不得据此实施。 |
| v2 | 2026-07-18 | 不通过 | 已修正 v1 P0，但复审发现历史 ready 学期未升级、只读 API/DTO/E2E harness/日志与文档收尾不完整。不得据此实施。 |
| v3 | 2026-07-18 | 不通过 | 已解决 v2 主要问题，但复审发现 Playwright backend `webServer.command` 裸 `tsx` 在仓库根目录不可执行。不得据此实施。 |
| v4 | 2026-07-18 | 复审通过 | 独立复审确认 v2/v3 阻塞项均已关闭，允许进入“计划已创建并待用户批准”状态；用户明确批准前不得实施。 |

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import type { ApiSuccess } from "@ai-studybuddy/shared";

// 从 monorepo 根目录读取 .env.local
dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });

const app = express();
const PORT = process.env.BACKEND_PORT || 3000;

// ── 中间件 ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── 健康检查 ──────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  const response: ApiSuccess<{ version: string; timestamp: string }> = {
    success: true,
    data: {
      version: "0.8.0",
      timestamp: new Date().toISOString(),
    },
  };
  res.json(response);
});

// ── TODO: 路由 ────────────────────────────────────────────
// app.use("/api/courses", coursesRouter);
// app.use("/api/study-tasks", studyTasksRouter);
// app.use("/api/materials", materialsRouter);
// app.use("/api/notes", notesRouter);

// ── 启动 ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
  console.log(`   - Health: http://localhost:${PORT}/api/health`);
});

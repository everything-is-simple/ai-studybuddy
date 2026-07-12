import express from "express";
import cors from "cors";
import type { ApiSuccess } from "@ai-studybuddy/shared";
import { config } from "./config/env";
import devRouter from "./api/dev";
import storageDevRouter from "./api/dev-storage";
import converterDevRouter from "./api/dev-converter";
import aiDevRouter from "./api/dev-ai";
import studyRhythmRouter from "./api/study-rhythm";

const app = express();
const PORT = config.backendPort;
const HOST = config.backendHost;

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

// ── 开发验证路由 ────────────────────────────────────────────
app.use("/api/dev", devRouter);
app.use("/api/dev/storage", storageDevRouter);
app.use("/api/dev/converter", converterDevRouter);
app.use("/api/dev/ai", aiDevRouter);

// ── S1 学习节奏业务路由 ───────────────────────────────────
app.use("/api", studyRhythmRouter);

// ── 启动 ──────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
  console.log(`✅ Backend running on http://${HOST}:${PORT}`);
  console.log(`   - Health: http://${HOST}:${PORT}/api/health`);
  console.log(`   - Dev:    http://${HOST}:${PORT}/api/dev/db-health`);
});

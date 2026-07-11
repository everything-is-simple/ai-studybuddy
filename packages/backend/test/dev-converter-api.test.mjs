import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const backendDir = path.resolve(import.meta.dirname, "..");

async function startBackend(t) {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "studybuddy-t04-api-"));
  const port = 51000 + Math.floor(Math.random() * 1000);
  const processHandle = spawn(process.execPath, ["dist/server.js"], {
    cwd: backendDir,
    env: {
      ...process.env,
      APP_DATA_ROOT: dataRoot,
      BACKEND_HOST: "127.0.0.1",
      BACKEND_PORT: String(port),
    },
    stdio: "ignore",
  });

  t.after(async () => {
    processHandle.kill();
    await rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  const healthUrl = `http://127.0.0.1:${port}/api/health`;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) return { port };
    } catch {
      // 后端尚未开始监听，继续等待。
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("built backend did not become healthy");
}

test("dev converter returns a JSON 413 when an upload exceeds the file limit", async (t) => {
  const backend = await startBackend(t);
  const form = new FormData();
  form.append("file", new Blob([Buffer.alloc(50 * 1024 * 1024 + 1)]), "too-large.txt");

  const response = await fetch(`http://127.0.0.1:${backend.port}/api/dev/converter/text`, {
    method: "POST",
    body: form,
  });

  assert.equal(response.status, 413);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  const json = await response.json();
  assert.equal(json.success, false);
  assert.equal(json.error.code, "FILE_TOO_LARGE");
});

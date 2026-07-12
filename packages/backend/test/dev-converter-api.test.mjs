import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";

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

// ── 最小 DOCX / PPTX 生成辅助 ─────────────────────────────────

async function buildMinimalDocx() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.folder("_rels").file(".rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.folder("word").file("document.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>API DOCX 测试</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

async function buildMinimalPptx() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>`);
  zip.folder("_rels").file(".rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
  zip.folder("ppt").file("presentation.xml", "<ppt/>");
  zip.folder("ppt").folder("slides").file("slide1.xml", `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><a:p><a:r><a:t>API PPTX 测试</a:t></a:r></a:p></p:spTree></p:cSld></p:sld>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

// ── 新端点 smoke test ────────────────────────────────────────

test("dev converter /docx returns extracted text", async (t) => {
  const backend = await startBackend(t);
  const buffer = await buildMinimalDocx();
  const form = new FormData();
  form.append("file", new Blob([buffer]), "api-test.docx");

  const response = await fetch(`http://127.0.0.1:${backend.port}/api/dev/converter/docx`, {
    method: "POST",
    body: form,
  });

  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.success, true);
  assert.equal(json.data.sourceType, "docx");
  assert.ok(json.data.text.includes("API DOCX 测试"));
});

test("dev converter /pptx returns extracted text", async (t) => {
  const backend = await startBackend(t);
  const buffer = await buildMinimalPptx();
  const form = new FormData();
  form.append("file", new Blob([buffer]), "api-test.pptx");

  const response = await fetch(`http://127.0.0.1:${backend.port}/api/dev/converter/pptx`, {
    method: "POST",
    body: form,
  });

  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.success, true);
  assert.equal(json.data.sourceType, "pptx");
  assert.ok(json.data.text.includes("API PPTX 测试"));
});

test("dev converter /url rejects SSRF with 403", async (t) => {
  const backend = await startBackend(t);

  const response = await fetch(`http://127.0.0.1:${backend.port}/api/dev/converter/url`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "http://127.0.0.1/secret" }),
  });

  const json = await response.json();
  assert.equal(response.status, 403);
  assert.equal(json.success, false);
  assert.equal(json.error.code, "URL_SSRF_BLOCKED");
  assert.ok(json.error.message.includes("SSRF"));
});

test("dev converter /url rejects missing url with 400", async (t) => {
  const backend = await startBackend(t);

  const response = await fetch(`http://127.0.0.1:${backend.port}/api/dev/converter/url`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 400);
  const json = await response.json();
  assert.equal(json.success, false);
  assert.equal(json.error.code, "URL_REQUIRED");
});

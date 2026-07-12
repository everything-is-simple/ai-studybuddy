import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import test from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { PdfConverter, OcrConverter, TextConverter, dispatchConverter } = await import(
  pathToFileURL(path.join(__dirname, "../dist/adapters/converter.js")).href
);

const pdfSamplePath =
  "I:\\ai-studybuddy-composer\\pdf\\pdf-parse-demo\\samples\\test.pdf";
const imageSamplePath =
  "I:\\ai-studybuddy-composer\\ocr\\RapidOCR\\samples\\test.jpg";

test("PdfConverter extracts text from a text-based PDF", async () => {
  const converter = new PdfConverter();
  let buffer;
  try {
    buffer = readFileSync(pdfSamplePath);
  } catch {
    console.warn("[SKIP] 找不到 PDF 测试文件，跳过 PDF 真实样本测试");
    return;
  }

  const result = await converter.convert(buffer);

  assert.equal(result.ok, true);
  assert.equal(result.sourceType, "pdf");
  assert.ok(result.text && result.text.length > 0, "PDF 文本不应为空");
  assert.ok(
    result.metadata && result.metadata.pageCount && result.metadata.pageCount > 0,
    "应能读取页数"
  );
  assert.ok(
    result.metadata && typeof result.metadata.charCount === "number",
    "应返回字符数"
  );
});

test("PdfConverter returns ok=false for empty PDF text", async () => {
  const converter = new PdfConverter();

  // 构造一个最小但无效的 PDF Buffer（非真实 PDF 结构）
  const buffer = Buffer.from("%PDF-1.4\n%\n1 0 obj\n<< /Type /Catalog >>\nendobj\n", "utf8");

  const result = await converter.convert(buffer);

  assert.equal(result.ok, false);
  assert.equal(result.sourceType, "pdf");
  assert.ok(result.error, "应返回错误信息");
});

test("TextConverter decodes UTF-8 text", async () => {
  const converter = new TextConverter();
  const text = "Hello 世界，这是 AI StudyBuddy T04 文本测试。";
  const buffer = Buffer.from(text, "utf8");

  const result = await converter.convert(buffer);

  assert.equal(result.ok, true);
  assert.equal(result.sourceType, "text");
  assert.equal(result.text, text);
  assert.ok(result.metadata && result.metadata.charCount === text.length);
});

test("TextConverter returns ok=false for invalid UTF-8 bytes", async () => {
  const converter = new TextConverter();
  // 0xff 0xfe 是一个不合法的 UTF-8 起始字节序列
  const buffer = Buffer.from([0xff, 0xfe, 0x00]);

  const result = await converter.convert(buffer);

  assert.equal(result.ok, false);
  assert.equal(result.sourceType, "text");
  assert.ok(result.error, "应返回错误信息");
});

test("TextConverter extracts text from HTML buffer", async () => {
  const converter = new TextConverter();
  const html = `<!DOCTYPE html>
<html><head><title>HTML 测试</title></head>
<body>
  <nav>导航</nav>
  <article><p>这是 HTML 正文。</p></article>
  <script>alert('x')</script>
</body></html>`;
  const buffer = Buffer.from(html, "utf-8");

  const result = await converter.convert(buffer);

  assert.equal(result.ok, true);
  assert.equal(result.sourceType, "html");
  assert.ok(result.text.includes("这是 HTML 正文"));
  assert.ok(!result.text.includes("alert"), "script 内容应被剥离");
  assert.equal(result.metadata.title, "HTML 测试");
});

test("TextConverter treats explicit html sourceType as HTML", async () => {
  const converter = new TextConverter();
  const html = "<div>无 doctype 的 HTML 片段</div>";
  const buffer = Buffer.from(html, "utf-8");

  const result = await converter.convert(buffer, "html");

  assert.equal(result.ok, true);
  assert.equal(result.sourceType, "html");
  assert.ok(result.text.includes("无 doctype 的 HTML 片段"));
});

test("OcrConverter recognizes image when rapidocr-onnxruntime is available", async () => {
  // 仅在图片样本存在时运行
  let imageBuffer;
  try {
    imageBuffer = readFileSync(imageSamplePath);
  } catch {
    console.warn("[SKIP] 找不到 OCR 测试图片，跳过 OCR 测试");
    return;
  }

  const converter = new OcrConverter({ timeoutMs: 120000 });

  try {
    const result = await converter.convert(imageBuffer);

    assert.equal(result.ok, true);
    assert.equal(result.sourceType, "image");
    assert.ok(typeof result.text === "string");
    // OCR 结果可能为空（如果图片没有文字），但至少应返回成功
    assert.ok(
      typeof result.metadata === "object" &&
        typeof result.metadata.charCount === "number",
      "应返回字符数"
    );
  } catch (error) {
    if (error.message && error.message.includes("rapidocr-onnxruntime")) {
      console.warn("[SKIP] 未安装 rapidocr-onnxruntime，跳过 OCR 测试");
      return;
    }
    throw error;
  }
});

test("OcrConverter returns ok=false when image file does not exist", async () => {
  const converter = new OcrConverter({ timeoutMs: 120000 });

  const result = await converter.convert("I:\\ai-studybuddy-composer\\ocr\\RapidOCR\\samples\\nonexistent.jpg");

  assert.equal(result.ok, false);
  assert.equal(result.sourceType, "image");
  assert.ok(result.error, "应返回错误信息");
});

// ── dispatchConverter 路由 ───────────────────────────────────

test("dispatchConverter routes .txt to TextConverter", async () => {
  const text = "dispatch 文本测试";
  const result = await dispatchConverter({
    buffer: Buffer.from(text, "utf-8"),
    filename: "note.txt",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sourceType, "text");
  assert.equal(result.text, text);
});

test("dispatchConverter routes .html to HTML TextConverter", async () => {
  const html = `<!DOCTYPE html><html><head><title>T</title></head><body><article>正文</article></body></html>`;
  const result = await dispatchConverter({
    buffer: Buffer.from(html, "utf-8"),
    filename: "page.html",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sourceType, "html");
  assert.ok(result.text.includes("正文"));
});

test("dispatchConverter rejects old .doc format", async () => {
  const result = await dispatchConverter({
    buffer: Buffer.from("fake doc", "utf-8"),
    filename: "report.doc",
  });

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("DOCX") || result.error.includes("PDF"));
});

test("dispatchConverter rejects .xlsx format", async () => {
  const result = await dispatchConverter({
    buffer: Buffer.from("fake xlsx", "utf-8"),
    filename: "sheet.xlsx",
  });

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("Excel") || result.error.includes("PDF"));
});

test("dispatchConverter rejects .zip archive", async () => {
  const result = await dispatchConverter({
    buffer: Buffer.from("fake zip", "utf-8"),
    filename: "archive.zip",
  });

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("解压"));
});

test("dispatchConverter requires buffer or url", async () => {
  const result = await dispatchConverter({ filename: "only-filename.txt" });

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("buffer") || result.error.includes("url"));
});

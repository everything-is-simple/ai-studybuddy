import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { DocxConverter } = await import(
  pathToFileURL(path.join(__dirname, "../dist/adapters/docx-converter.js")).href
);

// ── 最小 DOCX 生成器 ─────────────────────────────────────────

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`;

function makeDocumentXml(bodyInnerXml) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyInnerXml}
  </w:body>
</w:document>`;
}

function makeParagraph(text, visuals = []) {
  const visualXml = visuals
    .map((v) => `<w:${v}/>`)
    .join("");
  return `<w:p><w:r><w:t>${text}</w:t></w:r>${visualXml}</w:p>`;
}

async function buildDocxBuffer(documentXml, extraFiles = {}) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.folder("_rels").file(".rels", RELS_XML);
  zip.folder("word").file("document.xml", documentXml);
  zip.folder("word").folder("_rels").file("document.xml.rels", DOCUMENT_RELS_XML);

  for (const [name, content] of Object.entries(extraFiles)) {
    zip.file(name, content);
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

// ── 测试 ────────────────────────────────────────────────────

test("DocxConverter extracts Chinese text and counts embedded visuals", async () => {
  const documentXml = makeDocumentXml(
    makeParagraph("这是第一段落，包含中文内容。", ["drawing"]) +
      makeParagraph("这是第二段落，包含图表。", ["drawing", "drawing"])
  );
  const buffer = await buildDocxBuffer(documentXml);

  const converter = new DocxConverter();
  const result = await converter.convert(buffer);

  assert.equal(result.ok, true);
  assert.equal(result.sourceType, "docx");
  assert.ok(result.text.includes("这是第一段落"), "应提取第一段中文");
  assert.ok(result.text.includes("这是第二段落"), "应提取第二段中文");
  assert.ok(result.metadata.embeddedVisualCount >= 3, `应至少统计 3 个视觉对象，得到 ${result.metadata.embeddedVisualCount}`);
});

test("DocxConverter returns ok=false for empty document", async () => {
  const documentXml = makeDocumentXml("");
  const buffer = await buildDocxBuffer(documentXml);

  const converter = new DocxConverter();
  const result = await converter.convert(buffer);

  assert.equal(result.ok, false);
  assert.equal(result.sourceType, "docx");
  assert.ok(result.error.includes("空") || result.error.includes("未能"), "应返回空文档相关错误");
});

test("DocxConverter returns ok=false for empty buffer", async () => {
  const converter = new DocxConverter();
  const result = await converter.convert(Buffer.alloc(0));

  assert.equal(result.ok, false);
  assert.equal(result.sourceType, "docx");
  assert.ok(result.error, "应返回错误信息");
});

test("DocxConverter returns ok=false for corrupted ZIP", async () => {
  const converter = new DocxConverter();
  const result = await converter.convert(Buffer.from("not a zip"));

  assert.equal(result.ok, false);
  assert.equal(result.sourceType, "docx");
  assert.ok(result.error, "应返回错误信息");
});

test("DocxConverter rejects a ZIP entry exceeding the size limit", async () => {
  process.env.DOCX_ZIP_MAX_ENTRY_SIZE_BYTES = String(2 * 1024 * 1024);

  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.folder("_rels").file(".rels", RELS_XML);
  // 3MB entry
  zip.file("word/document.xml", Buffer.alloc(3 * 1024 * 1024));

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const converter = new DocxConverter();
  const result = await converter.convert(buffer);

  delete process.env.DOCX_ZIP_MAX_ENTRY_SIZE_BYTES;

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("大小") || result.error.includes("上限"), "应返回大小超限错误");
});

test("DocxConverter rejects total ZIP size exceeding the limit", async () => {
  process.env.DOCX_ZIP_MAX_TOTAL_SIZE_BYTES = String(3 * 1024 * 1024);

  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.folder("_rels").file(".rels", RELS_XML);
  zip.file("word/document.xml", makeDocumentXml(makeParagraph("正文")));
  // 两个 2MB entries，累计 4MB+
  zip.file("media/image1.png", Buffer.alloc(2 * 1024 * 1024));
  zip.file("media/image2.png", Buffer.alloc(2 * 1024 * 1024));

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const converter = new DocxConverter();
  const result = await converter.convert(buffer);

  delete process.env.DOCX_ZIP_MAX_TOTAL_SIZE_BYTES;

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("累计") || result.error.includes("total"), "应返回累计大小超限错误");
});

test("DocxConverter rejects document.xml exceeding the read size limit", async () => {
  process.env.DOCX_ZIP_MAX_DOCUMENT_XML_SIZE_BYTES = String(1 * 1024 * 1024);

  // 2MB document.xml
  const documentXml = makeDocumentXml(makeParagraph("正文".repeat(1024 * 1024)));
  const buffer = await buildDocxBuffer(documentXml);

  const converter = new DocxConverter();
  const result = await converter.convert(buffer);

  delete process.env.DOCX_ZIP_MAX_DOCUMENT_XML_SIZE_BYTES;

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("document.xml") || result.error.includes("大小"), "应返回 document.xml 大小超限错误");
});

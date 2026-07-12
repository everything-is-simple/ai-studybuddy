import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import test from "node:test";
import JSZip from "jszip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { PptxConverter } = await import(
  pathToFileURL(path.join(__dirname, "../dist/adapters/pptx-converter.js")).href
);

// ── 最小 PPTX 生成器 ─────────────────────────────────────────

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;

function makeSlideXml(num, text, opts = {}) {
  const hasPicture = opts.picture === true;
  const pictureXml = hasPicture
    ? `<p:pic><p:blipFill><a:blip r:embed="rId2"/></a:blipFill></p:pic>`
    : "";
  const textXml = text
    ? `<a:p><a:r><a:t>${text}</a:t></a:r></a:p>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      ${textXml}
      ${pictureXml}
    </p:spTree>
  </p:cSld>
</p:sld>`;
}

function makeSlideRels(num, hasMedia = false) {
  const mediaRel = hasMedia
    ? `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${num}.png"/>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  ${mediaRel}
</Relationships>`;
}

async function buildPptxBuffer(slides) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.folder("_rels").file(".rels", RELS_XML);
  zip.folder("ppt").file("presentation.xml", "<ppt/>");

  for (const { num, text, picture } of slides) {
    zip.folder("ppt").folder("slides").file(`slide${num}.xml`, makeSlideXml(num, text, { picture }));
    zip.folder("ppt").folder("slides").folder("_rels").file(`slide${num}.xml.rels`, makeSlideRels(num, picture));
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

// ── 测试 ────────────────────────────────────────────────────

test("PptxConverter extracts slides in numeric order", async () => {
  const slides = [
    { num: 1, text: "第一页" },
    { num: 2, text: "第二页" },
    { num: 10, text: "第十页" },
    { num: 11, text: "第十一页" },
  ];
  const buffer = await buildPptxBuffer(slides);

  const converter = new PptxConverter();
  const result = await converter.convert(buffer);

  assert.equal(result.ok, true);
  assert.equal(result.sourceType, "pptx");
  assert.equal(result.metadata.slideCount, 4);
  assert.equal(result.metadata.textSlideCount, 4);

  const first10Index = result.text.indexOf("【第 10 页】");
  const secondIndex = result.text.indexOf("【第 2 页】");
  const first11Index = result.text.indexOf("【第 11 页】");
  assert.ok(secondIndex < first10Index, "slide2 应排在 slide10 之前");
  assert.ok(first10Index < first11Index, "slide10 应排在 slide11 之前");
});

test("PptxConverter handles 12 slides for decimal sorting", async () => {
  const slides = Array.from({ length: 12 }, (_, i) => ({
    num: i + 1,
    text: `第 ${i + 1} 页文本`,
  }));
  const buffer = await buildPptxBuffer(slides);

  const converter = new PptxConverter();
  const result = await converter.convert(buffer);

  assert.equal(result.ok, true);
  assert.equal(result.metadata.slideCount, 12);

  // 验证最后 slide2 在 slide10 之前
  const idx2 = result.text.indexOf("【第 2 页】");
  const idx10 = result.text.indexOf("【第 10 页】");
  assert.ok(idx2 < idx10, "slide2 必须出现在 slide10 之前");
});

test("PptxConverter decodes XML entities in text", async () => {
  const slides = [
    { num: 1, text: "小于 &lt; 大于 &gt; 与 &amp; 引号 &quot;" },
    { num: 2, text: "十进制 &#20013; 十六进制 &#x6587;" },
  ];
  const buffer = await buildPptxBuffer(slides);

  const converter = new PptxConverter();
  const result = await converter.convert(buffer);

  assert.equal(result.ok, true);
  assert.ok(result.text.includes("<"), "应解码 &lt;");
  assert.ok(result.text.includes(">"), "应解码 &gt;");
  assert.ok(result.text.includes("&"), "应解码 &amp;");
  assert.ok(result.text.includes('"'), "应解码 &quot;");
  assert.ok(result.text.includes("中"), "应解码十进制实体");
  assert.ok(result.text.includes("文"), "应解码十六进制实体");
});

test("PptxConverter marks mixed text+image slides", async () => {
  const slides = [
    { num: 1, text: "文字页", picture: false },
    { num: 2, text: "图文混合页", picture: true },
  ];
  const buffer = await buildPptxBuffer(slides);

  const converter = new PptxConverter();
  const result = await converter.convert(buffer);

  assert.equal(result.ok, true);
  assert.equal(result.metadata.imageSlideCount, 1);
  assert.ok(result.text.includes("图文混合页"));
  assert.ok(result.text.includes("【第 2 页含嵌入图片，图片内文字需走 OCR】"));
  assert.ok(!result.text.includes("【第 1 页含嵌入图片"));
});

test("PptxConverter marks image-only slides", async () => {
  const slides = [{ num: 1, text: "", picture: true }];
  const buffer = await buildPptxBuffer(slides);

  const converter = new PptxConverter();
  const result = await converter.convert(buffer);

  assert.equal(result.ok, true);
  assert.equal(result.metadata.imageSlideCount, 1);
  assert.equal(result.metadata.textSlideCount, 0);
  assert.ok(result.text.includes("【第 1 页为纯图片页，图片内文字需走 OCR】"));
});

test("PptxConverter returns ok=false for empty PPTX", async () => {
  const slides = [{ num: 1, text: "", picture: false }];
  const buffer = await buildPptxBuffer(slides);

  const converter = new PptxConverter();
  const result = await converter.convert(buffer);

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("空") || result.error.includes("未能"));
});

test("PptxConverter returns ok=false for corrupted ZIP", async () => {
  const converter = new PptxConverter();
  const result = await converter.convert(Buffer.from("not a zip"));

  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test("PptxConverter rejects oversized slide XML", async () => {
  process.env.PPTX_ZIP_MAX_SLIDE_XML_SIZE_BYTES = String(1 * 1024 * 1024);

  const bigText = "x".repeat(2 * 1024 * 1024);
  const slides = [{ num: 1, text: bigText }];
  const buffer = await buildPptxBuffer(slides);

  const converter = new PptxConverter();
  const result = await converter.convert(buffer);

  delete process.env.PPTX_ZIP_MAX_SLIDE_XML_SIZE_BYTES;

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("slide") || result.error.includes("大小"));
});

test("PptxConverter treats string input as a local file path", async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "studybuddy-pptx-path-"));
  t.after(() => rm(tempDir, { recursive: true, force: true }));
  const filePath = path.join(tempDir, "sample.pptx");
  await writeFile(filePath, await buildPptxBuffer([{ num: 1, text: "路径 PPTX" }]));

  const result = await new PptxConverter().convert(filePath);

  assert.equal(result.ok, true);
  assert.ok(result.text.includes("路径 PPTX"));
});

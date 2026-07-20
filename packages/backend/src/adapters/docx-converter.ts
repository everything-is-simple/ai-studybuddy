// ============================================================
// DocxConverter — Phase 0.8 T04B
// 使用 mammoth 提取 DOCX 正文，jszip 做视觉对象计数与安全校验。
// ============================================================

import type { ConverterResult } from '@ai-studybuddy/shared';
import fs from 'fs';
import mammoth from 'mammoth';
import { JSDOM } from 'jsdom';
import JSZip from 'jszip';
import { getDocxZipLimits as getZipLimits } from '../config/env';

// ── 安全限制 ────────────────────────────────────────────────
// 可通过环境变量覆盖，便于测试使用较小阈值；生产环境保持较大默认值。
// 每次调用时重新读取，确保测试可以在同进程内调整阈值。


const VISUAL_TAGS = [
  'w:drawing', // 图片、图表、SmartArt
  'w:pict', // VML 对象
  'w:object', // OLE 对象
] as const;

// ── 公共工具 ────────────────────────────────────────────────

function isTextNotEmpty(text: string): boolean {
  return text.trim().length > 0;
}

function countChineseChars(text: string): number {
  const matches = text.match(/[\u4e00-\u9fff]/g);
  return matches ? matches.length : 0;
}

function isBufferEmpty(buffer: Buffer): boolean {
  return !buffer || buffer.length === 0;
}

// 从 document.xml 文本中统计视觉对象数量（简单标签计数）
function countVisualsInDocumentXml(xmlText: string): number {
  let count = 0;
  for (const tag of VISUAL_TAGS) {
    // 匹配开标签：<w:drawing> 或 <w:drawing/> 或 <w:drawing ...>
    const regex = new RegExp(`<${tag}(?:[\\s/>]|$)`, 'g');
    const matches = xmlText.match(regex);
    if (matches) {
      count += matches.length;
    }
  }
  return count;
}

function stripHtmlToText(html: string): string {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // 替换图片为占位符并计数
  const images = document.querySelectorAll('img');
  for (const img of Array.from(images)) {
    const alt = img.getAttribute('alt') || '图片';
    const placeholder = document.createTextNode(`[图片: ${alt}]`);
    img.replaceWith(placeholder);
  }

  return document.body ? document.body.textContent || '' : '';
}

// ── 安全加载 ZIP ────────────────────────────────────────────

async function loadDocxZip(buffer: Buffer): Promise<JSZip> {
  const limits = getZipLimits();
  const zip = await JSZip.loadAsync(buffer);

  const entries = Object.keys(zip.files);
  if (entries.length > limits.maxEntries) {
    throw new Error(`ZIP 条目数 ${entries.length} 超过安全上限 ${limits.maxEntries}，疑似压缩炸弹`);
  }

  let totalSize = 0;
  for (const name of entries) {
    const entry = zip.files[name];
    if (!entry || entry.dir) continue;

    // 只解压关键 XML 到内存做大小校验；其他条目通过 _data.uncompressedSize 估算
    const uncompressedSize =
      (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;

    if (uncompressedSize > limits.maxEntrySizeBytes) {
      throw new Error(`ZIP 条目 ${name} 解压后大小 ${uncompressedSize} 超过安全上限 ${limits.maxEntrySizeBytes} 字节`);
    }
    totalSize += uncompressedSize;
  }

  if (totalSize > limits.maxTotalSizeBytes) {
    throw new Error(`ZIP 累计解压大小 ${totalSize} 超过安全上限 ${limits.maxTotalSizeBytes} 字节`);
  }

  return zip;
}

async function readDocumentXml(zip: JSZip): Promise<string | null> {
  const limits = getZipLimits();
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) {
    return null;
  }

  const size = (documentFile as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
  if (size > limits.maxDocumentXmlSizeBytes) {
    throw new Error(`word/document.xml 大小 ${size} 超过安全上限 ${limits.maxDocumentXmlSizeBytes} 字节`);
  }

  return documentFile.async('text');
}

// ── DocxConverter ───────────────────────────────────────────

export class DocxConverter {
  async convert(input: Buffer | string): Promise<ConverterResult> {
    const buffer = typeof input === 'string' ? fs.readFileSync(input) : input;

    if (isBufferEmpty(buffer)) {
      return {
        ok: false,
        sourceType: 'docx',
        error: 'DOCX 文件内容为空',
      };
    }

    try {
      // 1. 安全加载并校验 ZIP 结构
      const zip = await loadDocxZip(buffer);

      // 2. 读取 document.xml 并统计视觉对象
      const documentXml = await readDocumentXml(zip);
      let visualCount = 0;
      if (documentXml) {
        visualCount = countVisualsInDocumentXml(documentXml);
      }

      // 3. 用 mammoth 转 HTML
      const mammothResult = await mammoth.convertToHtml({ buffer });
      const html = mammothResult.value;

      // 4. 从 HTML 提取文本并替换图片占位符
      const text = stripHtmlToText(html);
      const charCount = text.length;

      if (!isTextNotEmpty(text)) {
        return {
          ok: false,
          sourceType: 'docx',
          text,
          metadata: { charCount, embeddedVisualCount: visualCount },
          error: '未能从 DOCX 中提取到文本，文档可能为空',
        };
      }

      const warnings: string[] = [];
      const chineseCount = countChineseChars(text);
      if (chineseCount === 0) {
        warnings.push('未检测到中文字符，请确认内容语言或来源');
      }

      return {
        ok: true,
        sourceType: 'docx',
        text,
        metadata: { charCount, embeddedVisualCount: visualCount },
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      return {
        ok: false,
        sourceType: 'docx',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

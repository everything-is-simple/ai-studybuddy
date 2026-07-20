// ============================================================
// PptxConverter — Phase 0.8 T04B
// 使用 jszip 解压 PPTX，按数字序提取各页文本并标注图片页。
// ============================================================

import type { ConverterResult } from '@ai-studybuddy/shared';
import fs from 'fs';
import JSZip from 'jszip';
import { getPptxZipLimits as getZipLimits } from '../config/env';

// ── 安全限制 ────────────────────────────────────────────────


// ── XML 工具 ────────────────────────────────────────────────

// 解码常见 XML 实体与数值实体
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)));
}

function extractTextNodes(xmlText: string): string[] {
  const texts: string[] = [];
  const regex = /<a:t>([^<]*)<\/a:t>/g;
  let match;
  while ((match = regex.exec(xmlText)) !== null) {
    const decoded = decodeXmlEntities(match[1]);
    if (decoded.trim().length > 0) {
      texts.push(decoded);
    }
  }
  return texts;
}

function countPicturesInSlide(xmlText: string, relsMap: Map<string, string>): number {
  let count = 0;
  // 统计 <p:pic> 元素（图片占位符/图形容器）
  const picRegex = /<p:pic[\s>]/g;
  const picMatches = xmlText.match(picRegex);
  if (picMatches) {
    count += picMatches.length;
  }

  // 统计带 r:embed 的 <a:blip> 且指向媒体文件
  const embedRegex = /<a:blip[^>]*\sr:embed="([^"]+)"/g;
  let embedMatch;
  while ((embedMatch = embedRegex.exec(xmlText)) !== null) {
    const relId = embedMatch[1];
    const target = relsMap.get(relId);
    if (target && looksLikeMedia(target)) {
      count += 1;
    }
  }

  return count;
}

function looksLikeMedia(target: string): boolean {
  const lower = target.toLowerCase();
  return (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.bmp') ||
    lower.endsWith('.svg') ||
    lower.endsWith('.wmf') ||
    lower.endsWith('.emf') ||
    lower.includes('media/')
  );
}

function parseRelsXml(relsText: string): Map<string, string> {
  const map = new Map<string, string>();
  const regex = /<Relationship[^>]*\sId="([^"]+)"[^>]*\sTarget="([^"]+)"/g;
  let match;
  while ((match = regex.exec(relsText)) !== null) {
    map.set(match[1], match[2]);
  }
  return map;
}

// ── 安全加载 ZIP ────────────────────────────────────────────

async function loadPptxZip(buffer: Buffer): Promise<JSZip> {
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

// ── PptxConverter ───────────────────────────────────────────

export class PptxConverter {
  async convert(input: Buffer | string): Promise<ConverterResult> {
    const buffer = typeof input === 'string' ? fs.readFileSync(input) : input;

    if (!buffer || buffer.length === 0) {
      return {
        ok: false,
        sourceType: 'pptx',
        error: 'PPTX 文件内容为空',
      };
    }

    try {
      const zip = await loadPptxZip(buffer);

      // 收集 slideN.xml 并按数字序排序
      const slideFiles: Array<{ num: number; path: string }> = [];
      const slideRegex = /^ppt\/slides\/slide(\d+)\.xml$/;
      for (const name of Object.keys(zip.files)) {
        const match = name.match(slideRegex);
        if (match) {
          slideFiles.push({ num: Number(match[1]), path: name });
        }
      }

      slideFiles.sort((a, b) => a.num - b.num);

      if (slideFiles.length === 0) {
        return {
          ok: false,
          sourceType: 'pptx',
          error: '未能找到幻灯片内容，文件可能不是有效 PPTX',
        };
      }

      const slideTexts: string[] = [];
      let textSlideCount = 0;
      let imageSlideCount = 0;

      for (const { num, path: slidePath } of slideFiles) {
        const slideFile = zip.file(slidePath);
        if (!slideFile) continue;

        const size = (slideFile as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
        if (size > getZipLimits().maxSlideXmlSizeBytes) {
          throw new Error(
            `幻灯片 XML ${slidePath} 大小 ${size} 超过安全上限 ${getZipLimits().maxSlideXmlSizeBytes} 字节`
          );
        }

        const slideXml = await slideFile.async('text');
        const texts = extractTextNodes(slideXml);
        const slideText = texts.join('\n').trim();

        // 读取对应 rels 文件
        const relsPath = `ppt/slides/_rels/${slidePath.split('/').pop()}.rels`;
        const relsFile = zip.file(relsPath);
        const relsMap = relsFile ? parseRelsXml(await relsFile.async('text')) : new Map<string, string>();
        const pictureCount = countPicturesInSlide(slideXml, relsMap);
        const hasPicture = pictureCount > 0;

        if (slideText.length === 0 && !hasPicture) {
          // 完全空页，不输出
          continue;
        }

        const parts: string[] = [];
        parts.push(`【第 ${num} 页】`);

        if (slideText.length > 0) {
          parts.push(slideText);
          textSlideCount += 1;
        }

        if (hasPicture) {
          imageSlideCount += 1;
          if (slideText.length > 0) {
            parts.push(`【第 ${num} 页含嵌入图片，图片内文字需走 OCR】`);
          } else {
            parts.push(`【第 ${num} 页为纯图片页，图片内文字需走 OCR】`);
          }
        }

        slideTexts.push(parts.join('\n'));
      }

      const fullText = slideTexts.join('\n\n').trim();
      const slideCount = slideFiles.length;

      if (fullText.length === 0) {
        return {
          ok: false,
          sourceType: 'pptx',
          metadata: { slideCount, textSlideCount, imageSlideCount },
          error: '未能从 PPTX 中提取到文本，所有页面均为空或纯图片',
        };
      }

      return {
        ok: true,
        sourceType: 'pptx',
        text: fullText,
        metadata: {
          slideCount,
          textSlideCount,
          imageSlideCount,
          charCount: fullText.length,
        },
      };
    } catch (error) {
      return {
        ok: false,
        sourceType: 'pptx',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

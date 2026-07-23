// ============================================================
// 格式转换层 — Phase 0.8 T04
// PdfConverter / OcrConverter / TextConverter
// 统一返回 @ai-studybuddy/shared 的 ConverterResult
// ============================================================

import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { TextDecoder } from 'util';
import type { ConverterResult } from '@ai-studybuddy/shared';
import { PDFParse } from 'pdf-parse';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { DocxConverter } from './docx-converter';
import { PptxConverter } from './pptx-converter';
import { UrlFetcher } from './url-fetcher';
import { getOcrWorkerEnvironment } from '../config/env';

// ── 公共工具 ────────────────────────────────────────────────

function countChineseChars(text: string): number {
  const matches = text.match(/[\u4e00-\u9fff]/g);
  return matches ? matches.length : 0;
}

function readFileToBuffer(filePath: string): Buffer {
  return fs.readFileSync(filePath);
}

function isTextNotEmpty(text: string): boolean {
  return text.trim().length > 0;
}

// ── PdfConverter ──────────────────────────────────────────

export class PdfConverter {
  async convert(input: Buffer | string): Promise<ConverterResult> {
    const buffer = typeof input === 'string' ? readFileToBuffer(input) : input;

    try {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      const text = typeof result.text === 'string' ? result.text : '';
      const pageCount = typeof result.total === 'number' ? result.total : 0;
      const charCount = text.length;

      const warnings: string[] = [];
      if (!isTextNotEmpty(text)) {
        return {
          ok: false,
          sourceType: 'pdf',
          text,
          metadata: { pageCount, charCount },
          error: '未能提取到文本，可能是扫描版 PDF，建议走 OCR 路径',
        };
      }

      const chineseCount = countChineseChars(text);
      if (chineseCount === 0) {
        warnings.push('未检测到中文字符，请确认内容语言或来源');
      }

      return {
        ok: true,
        sourceType: 'pdf',
        text,
        metadata: { pageCount, charCount },
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      return {
        ok: false,
        sourceType: 'pdf',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// ── OcrConverter ──────────────────────────────────────────

export interface OcrConverterOptions {
  pythonPath?: string;
  timeoutMs?: number;
  workerPath?: string;
  tempRoot?: string;
  cacheRoot?: string;
}

export class OcrConverter {
  private readonly pythonPath: string;
  private readonly timeoutMs: number;
  private readonly workerPath: string;
  private readonly tempRoot: string;
  private readonly cacheRoot?: string;

  constructor(options: OcrConverterOptions = {}) {
    this.pythonPath = options.pythonPath ?? 'python';
    this.timeoutMs = options.timeoutMs ?? 60000;
    this.workerPath = options.workerPath ?? path.resolve(__dirname, '../scripts/ocr-worker.py');
    this.tempRoot = options.tempRoot ?? require('os').tmpdir();
    this.cacheRoot = options.cacheRoot;
  }

  async convert(input: Buffer | string): Promise<ConverterResult> {
    let tempPath: string | undefined;
    let imagePath: string;

    try {
      fs.mkdirSync(this.tempRoot, { recursive: true });
      if (this.cacheRoot) fs.mkdirSync(this.cacheRoot, { recursive: true });

      if (Buffer.isBuffer(input)) {
        tempPath = path.join(this.tempRoot, `studybuddy-ocr-${crypto.randomUUID()}.tmp`);
        fs.writeFileSync(tempPath, input);
        imagePath = tempPath;
      } else {
        imagePath = input;
      }

      const result = await this.runWorker(this.workerPath, imagePath);

      if (!result.ok) {
        return {
          ok: false,
          sourceType: 'image',
          error: result.error ?? 'OCR 处理失败',
        };
      }

      const text = typeof result.text === 'string' ? result.text : '';
      const charCount = typeof result.charCount === 'number' ? result.charCount : text.length;

      return {
        ok: true,
        sourceType: 'image',
        text,
        metadata: { charCount },
      };
    } catch (error) {
      return {
        ok: false,
        sourceType: 'image',
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (tempPath) {
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // 忽略清理失败
        }
      }
    }
  }

  private runWorker(
    workerPath: string,
    imagePath: string
  ): Promise<{ ok: boolean; text?: string; charCount?: number; error?: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.pythonPath, [workerPath, imagePath], {
        env: getOcrWorkerEnvironment({ tempRoot: this.tempRoot, cacheRoot: this.cacheRoot }),
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, this.timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(new Error(`OCR 子进程超时（${this.timeoutMs}ms）`));
          return;
        }
        if (code !== 0) {
          reject(new Error(`OCR 子进程退出码 ${code}：${stderr || 'unknown error'}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (error) {
          reject(new Error(`OCR 输出解析失败: ${stdout.slice(0, 200)}`));
        }
      });
    });
  }
}

// ── HTML 正文提取（供 TextConverter 与 UrlFetcher 复用）────────────────

export interface HtmlExtractResult {
  text: string;
  title?: string;
  warnings: string[];
}

export function extractTextFromHtml(html: string): HtmlExtractResult {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  for (const selector of ['script', 'style', 'noscript', 'iframe']) {
    for (const el of Array.from(document.querySelectorAll(selector))) {
      el.remove();
    }
  }

  const reader = new Readability(document);
  const article = reader.parse();

  const warnings: string[] = [];
  if (article && article.textContent && article.textContent.trim().length > 0) {
    return {
      text: article.textContent.trim(),
      title: article.title || undefined,
      warnings,
    };
  }

  const bodyText = document.body ? document.body.textContent || '' : '';
  if (bodyText.trim().length > 0) {
    warnings.push('Readability 提取正文失败，已 fallback 到 body 文本');
    return {
      text: bodyText.trim(),
      title: document.title || undefined,
      warnings,
    };
  }

  return { text: '', warnings: ['未能从 HTML 中提取到正文'] };
}

// ── TextConverter ─────────────────────────────────────────

export class TextConverter {
  private detectHtml(buffer: Buffer): boolean {
    // 取前 4KB 做简单判断，避免大文件性能问题
    const sample = buffer.slice(0, 4096).toString('utf-8').trim().toLowerCase();
    return sample.startsWith('<!doctype html') || sample.startsWith('<html');
  }

  async convert(input: Buffer | string, declaredSourceType?: 'text' | 'html'): Promise<ConverterResult> {
    try {
      const buffer = typeof input === 'string' ? readFileToBuffer(input) : input;
      const isHtml = declaredSourceType === 'html' || this.detectHtml(buffer);

      if (isHtml) {
        const html = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        const { text, title, warnings } = extractTextFromHtml(html);

        if (!text || text.length === 0) {
          return {
            ok: false,
            sourceType: 'html',
            metadata: { charCount: 0 },
            warnings: warnings.length > 0 ? warnings : undefined,
            error: '未能从 HTML 中提取到正文',
          };
        }

        const metadata: ConverterResult['metadata'] = { charCount: text.length };
        if (title) metadata.title = title;

        return {
          ok: true,
          sourceType: 'html',
          text,
          metadata,
          warnings: warnings.length > 0 ? warnings : undefined,
        };
      }

      const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      const charCount = text.length;

      return {
        ok: true,
        sourceType: 'text',
        text,
        metadata: { charCount },
      };
    } catch (error) {
      return {
        ok: false,
        sourceType: declaredSourceType === 'html' ? 'html' : 'text',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// ── 新格式转换器 re-export ─────────────────────────────────

export { DocxConverter, PptxConverter, UrlFetcher };
export type { UrlFetcherOptions } from './url-fetcher';

// ── 统一路由分派 ────────────────────────────────────────────

export interface DispatchConverterInput {
  buffer?: Buffer;
  url?: string;
  filename?: string;
  declaredMimeType?: string;
}

export type RejectedExtensionReason =
  | 'doc 为旧版 Word 格式，请另存为 DOCX 或 PDF 后重新上传'
  | 'ppt 为旧版 PowerPoint 格式，请另存为 PPTX 或 PDF 后重新上传'
  | 'Excel 表格暂不支持，请另存为 PDF 或 CSV 后重新上传'
  | 'OpenDocument 格式暂不支持，请另存为 DOCX/PPTX/PDF 后重新上传'
  | 'RTF 格式暂不支持，请转换为 DOCX 或 PDF 后重新上传'
  | 'EPUB 格式暂不支持，请转换为 PDF 后重新上传'
  | '压缩包格式暂不支持，请解压后上传内部文件'
  | '邮件格式暂不支持，请导出正文为 PDF 或文本后上传';

const REJECTED_EXTENSIONS = new Map<string, RejectedExtensionReason>([
  ['.doc', 'doc 为旧版 Word 格式，请另存为 DOCX 或 PDF 后重新上传'],
  ['.ppt', 'ppt 为旧版 PowerPoint 格式，请另存为 PPTX 或 PDF 后重新上传'],
  ['.xls', 'Excel 表格暂不支持，请另存为 PDF 或 CSV 后重新上传'],
  ['.xlsx', 'Excel 表格暂不支持，请另存为 PDF 或 CSV 后重新上传'],
  ['.odt', 'OpenDocument 格式暂不支持，请另存为 DOCX/PPTX/PDF 后重新上传'],
  ['.ods', 'OpenDocument 格式暂不支持，请另存为 DOCX/PPTX/PDF 后重新上传'],
  ['.odp', 'OpenDocument 格式暂不支持，请另存为 DOCX/PPTX/PDF 后重新上传'],
  ['.rtf', 'RTF 格式暂不支持，请转换为 DOCX 或 PDF 后重新上传'],
  ['.epub', 'EPUB 格式暂不支持，请转换为 PDF 后重新上传'],
  ['.zip', '压缩包格式暂不支持，请解压后上传内部文件'],
  ['.rar', '压缩包格式暂不支持，请解压后上传内部文件'],
  ['.7z', '压缩包格式暂不支持，请解压后上传内部文件'],
  ['.tar', '压缩包格式暂不支持，请解压后上传内部文件'],
  ['.gz', '压缩包格式暂不支持，请解压后上传内部文件'],
  ['.eml', '邮件格式暂不支持，请导出正文为 PDF 或文本后上传'],
  ['.msg', '邮件格式暂不支持，请导出正文为 PDF 或文本后上传'],
]);

function getFileExtension(filename: string): string {
  const base = path.basename(filename).toLowerCase();
  // 处理 .tar.gz 这类双扩展名
  if (base.endsWith('.tar.gz')) return '.tar.gz';
  return path.extname(base).toLowerCase();
}

function inferSourceType(
  filename: string,
  declaredMimeType?: string
): { sourceType: ConverterResult['sourceType']; reason?: RejectedExtensionReason } | null {
  const ext = getFileExtension(filename);

  if (REJECTED_EXTENSIONS.has(ext)) {
    return { sourceType: 'text', reason: REJECTED_EXTENSIONS.get(ext) };
  }

  switch (ext) {
    case '.pdf':
      return { sourceType: 'pdf' };
    case '.jpg':
    case '.jpeg':
    case '.png':
    case '.gif':
    case '.webp':
    case '.bmp':
      return { sourceType: 'image' };
    case '.txt':
    case '.md':
    case '.csv':
    case '.json':
      return { sourceType: 'text' };
    case '.html':
    case '.htm':
      return { sourceType: 'html' };
    case '.docx':
      return { sourceType: 'docx' };
    case '.pptx':
      return { sourceType: 'pptx' };
    default:
      // MIME 仅作辅助，不信任客户端
      if (declaredMimeType) {
        const mime = declaredMimeType.split(';')[0].trim().toLowerCase();
        if (mime === 'text/html' || mime === 'application/xhtml+xml') {
          return { sourceType: 'html' };
        }
        if (mime === 'text/plain') {
          return { sourceType: 'text' };
        }
      }
      return null;
  }
}

export async function dispatchConverter(
  input: DispatchConverterInput,
  options: { ocr?: OcrConverterOptions } = {}
): Promise<ConverterResult> {
  const { buffer, url, filename, declaredMimeType } = input;

  if (url !== undefined && url.length > 0) {
    const fetcher = new UrlFetcher();
    return fetcher.fetch(url);
  }

  if (!buffer) {
    return {
      ok: false,
      sourceType: 'text',
      error: '必须提供 buffer 或 url',
    };
  }

  if (!filename) {
    return {
      ok: false,
      sourceType: 'text',
      error: '缺少 filename，无法判断文件格式',
    };
  }

  const inferred = inferSourceType(filename, declaredMimeType);
  if (!inferred) {
    return {
      ok: false,
      sourceType: 'text',
      error: `不支持的文件格式：${path.extname(filename).toLowerCase() || '无扩展名'}，请上传 PDF、DOCX、PPTX、HTML、图片或文本文件`,
    };
  }

  if (inferred.reason) {
    return {
      ok: false,
      sourceType: inferred.sourceType,
      error: inferred.reason,
    };
  }

  switch (inferred.sourceType) {
    case 'pdf':
      return new PdfConverter().convert(buffer);
    case 'image':
      return new OcrConverter(options.ocr).convert(buffer);
    case 'text':
      return new TextConverter().convert(buffer, 'text');
    case 'html':
      return new TextConverter().convert(buffer, 'html');
    case 'docx':
      return new DocxConverter().convert(buffer);
    case 'pptx':
      return new PptxConverter().convert(buffer);
    default:
      return {
        ok: false,
        sourceType: inferred.sourceType,
        error: `不支持的文件格式：${inferred.sourceType}`,
      };
  }
}

export type { ConverterResult };

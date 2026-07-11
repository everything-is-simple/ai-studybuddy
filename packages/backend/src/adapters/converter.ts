// ============================================================
// 格式转换层 — Phase 0.8 T04
// PdfConverter / OcrConverter / TextConverter
// 统一返回 @ai-studybuddy/shared 的 ConverterResult
// ============================================================

import { spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { TextDecoder } from "util";
import type { ConverterResult } from "@ai-studybuddy/shared";
import { PDFParse } from "pdf-parse";

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
    const buffer = typeof input === "string" ? readFileToBuffer(input) : input;

    try {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      const text = typeof result.text === "string" ? result.text : "";
      const pageCount = typeof result.total === "number" ? result.total : 0;
      const charCount = text.length;

      const warnings: string[] = [];
      if (!isTextNotEmpty(text)) {
        return {
          ok: false,
          sourceType: "pdf",
          text,
          metadata: { pageCount, charCount },
          error: "未能提取到文本，可能是扫描版 PDF，建议走 OCR 路径",
        };
      }

      const chineseCount = countChineseChars(text);
      if (chineseCount === 0) {
        warnings.push("未检测到中文字符，请确认内容语言或来源");
      }

      return {
        ok: true,
        sourceType: "pdf",
        text,
        metadata: { pageCount, charCount },
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      return {
        ok: false,
        sourceType: "pdf",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// ── OcrConverter ──────────────────────────────────────────

export interface OcrConverterOptions {
  pythonPath?: string;
  timeoutMs?: number;
}

export class OcrConverter {
  private pythonPath: string;
  private timeoutMs: number;

  constructor(options: OcrConverterOptions = {}) {
    this.pythonPath = options.pythonPath ?? "python";
    this.timeoutMs = options.timeoutMs ?? 60000;
  }

  async convert(input: Buffer | string): Promise<ConverterResult> {
    let tempPath: string | undefined;
    let imagePath: string;

    try {
      if (Buffer.isBuffer(input)) {
        tempPath = path.join(
          require("os").tmpdir(),
          `studybuddy-ocr-${crypto.randomUUID()}.tmp`
        );
        fs.writeFileSync(tempPath, input);
        imagePath = tempPath;
      } else {
        imagePath = input;
      }

      const workerPath = path.resolve(__dirname, "../scripts/ocr-worker.py");

      const result = await this.runWorker(workerPath, imagePath);

      if (!result.ok) {
        return {
          ok: false,
          sourceType: "image",
          error: result.error ?? "OCR 处理失败",
        };
      }

      const text = typeof result.text === "string" ? result.text : "";
      const charCount = typeof result.charCount === "number" ? result.charCount : text.length;

      return {
        ok: true,
        sourceType: "image",
        text,
        metadata: { charCount },
      };
    } catch (error) {
      return {
        ok: false,
        sourceType: "image",
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
      const process = spawn(this.pythonPath, [workerPath, imagePath], {
        timeout: this.timeoutMs,
      });

      let stdout = "";
      let stderr = "";

      process.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });

      process.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      process.on("error", (error) => {
        reject(error);
      });

      process.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`OCR 子进程退出码 ${code}：${stderr || "unknown error"}`));
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

// ── TextConverter ─────────────────────────────────────────

export class TextConverter {
  async convert(input: Buffer | string): Promise<ConverterResult> {
    try {
      const buffer = typeof input === "string" ? readFileToBuffer(input) : input;
      const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      const charCount = text.length;

      return {
        ok: true,
        sourceType: "text",
        text,
        metadata: { charCount },
      };
    } catch (error) {
      return {
        ok: false,
        sourceType: "text",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export type { ConverterResult };

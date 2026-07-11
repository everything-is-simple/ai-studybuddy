// ============================================================
// 本地文件存储适配器 StorageAdapter
// 逻辑 storage_key 唯一标识文件，业务数据不保存绝对路径。
// ============================================================

import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Readable } from "stream";
import { pipeline } from "stream/promises";
import { resolveStorageKeyToPath } from "../db/paths";

export class StoragePathEscapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoragePathEscapeError";
  }
}

export class StorageKeyNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageKeyNotFoundError";
  }
}

export interface PutFileInput {
  semesterId: string;
  courseId?: string; // 可选，归属课程；未指定时落到 files/common
  originalName: string; // 仅用于推断扩展名
  data: Buffer | Readable;
}

export interface PutFileResult {
  storageKey: string;
  size: number;
}

export interface GetFileResult {
  stream: Readable;
  size: number;
  lastModified: Date;
}

export class StorageAdapter {
  async put(input: PutFileInput): Promise<PutFileResult> {
    const ext = path.extname(input.originalName).toLowerCase() || "";
    const fileName = `${crypto.randomUUID()}${ext}`;

    const storageKey = input.courseId
      ? `semesters/${input.semesterId}/files/${input.courseId}/${fileName}`
      : `semesters/${input.semesterId}/files/common/${fileName}`;

    const absolutePath = this.resolvePath(storageKey);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

    if (Buffer.isBuffer(input.data)) {
      fs.writeFileSync(absolutePath, input.data);
    } else {
      const writeStream = fs.createWriteStream(absolutePath);
      try {
        await pipeline(input.data, writeStream);
      } catch (error) {
        // 写入失败时清理半成品文件
        try {
          fs.unlinkSync(absolutePath);
        } catch {
          // 忽略清理失败
        }
        throw error;
      }
    }

    const stat = fs.statSync(absolutePath);
    return { storageKey, size: stat.size };
  }

  async get(storageKey: string): Promise<GetFileResult> {
    const absolutePath = this.resolvePath(storageKey);
    if (!fs.existsSync(absolutePath)) {
      throw new StorageKeyNotFoundError(`STORAGE_KEY_NOT_FOUND ${storageKey}`);
    }

    const stat = fs.statSync(absolutePath);
    return {
      stream: fs.createReadStream(absolutePath),
      size: stat.size,
      lastModified: stat.mtime,
    };
  }

  async delete(storageKey: string): Promise<void> {
    const absolutePath = this.resolvePath(storageKey);
    if (!fs.existsSync(absolutePath)) {
      throw new StorageKeyNotFoundError(`STORAGE_KEY_NOT_FOUND ${storageKey}`);
    }
    fs.unlinkSync(absolutePath);
  }

  exists(storageKey: string): boolean {
    return fs.existsSync(this.resolvePath(storageKey));
  }

  resolvePath(storageKey: string): string {
    try {
      return resolveStorageKeyToPath(storageKey);
    } catch (error) {
      throw new StoragePathEscapeError(
        `STORAGE_PATH_ESCAPE ${storageKey}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

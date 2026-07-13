// ============================================================
// 数据库路径生成与逃逸防护 — 后端开发规范第 3 节
// 业务代码不自行拼接路径，统一从此模块获取。
// ============================================================

import path from 'path';
import { config } from '../config/env';

const APP_DATA_ROOT = config.appDataRoot;

/**
 * 校验路径必须在 APP_DATA_ROOT 内，拒绝路径逃逸。
 */
function resolveAppDataPath(relativePath: string): string {
  // 先 normalize，消除 .. 与 \\ 等可折叠片段
  const normalized = path.normalize(relativePath);

  // 拒绝包含 .. 的路径段
  const segments = normalized.split(/[\\/]/);
  if (segments.some((s) => s === '..')) {
    throw new Error(`[PATH] ESCAPE_DETECTED relativePath="${relativePath}"`);
  }

  const resolved = path.resolve(APP_DATA_ROOT, normalized);

  // 最终 resolved 必须在 APP_DATA_ROOT 内
  if (!resolved.startsWith(APP_DATA_ROOT + path.sep) && resolved !== APP_DATA_ROOT) {
    throw new Error(`[PATH] ESCAPE_DETECTED resolved="${resolved}"`);
  }

  return resolved;
}

// ── 全局库 ──────────────────────────────────────────────────
export function getGlobalDbPath(): string {
  return resolveAppDataPath('studybuddy.db');
}

// ── 学期库 ──────────────────────────────────────────────────
export function getSemesterDir(semesterId: string): string {
  return resolveAppDataPath(path.join('semesters', semesterId));
}

export function getSemesterDbPath(semesterId: string): string {
  return resolveAppDataPath(path.join('semesters', semesterId, 'semester.db'));
}

export function getSemesterFilesDir(semesterId: string): string {
  return resolveAppDataPath(path.join('semesters', semesterId, 'files'));
}

export function getSemesterTmpDir(semesterId: string): string {
  return resolveAppDataPath(path.join('semesters', semesterId, 'tmp'));
}

// ── 学期文件目录 ────────────────────────────────────────────
export function getSemesterCourseFilesDir(semesterId: string, courseId: string): string {
  return resolveAppDataPath(path.join('semesters', semesterId, 'files', courseId));
}

export function getSemesterCommonFilesDir(semesterId: string): string {
  return resolveAppDataPath(path.join('semesters', semesterId, 'files', 'common'));
}

// ── storage_key 解析 ────────────────────────────────────────
export function resolveStorageKeyToPath(storageKey: string): string {
  const normalizedKey = storageKey.replace(/\\/g, '/');
  const segments = normalizedKey.split('/');

  if (
    segments.length !== 5 ||
    segments[0] !== 'semesters' ||
    !segments[1] ||
    segments[2] !== 'files' ||
    !segments[3] ||
    !segments[4] ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:\.[^\\/]+)?$/i.test(segments[4]) ||
    segments.some((segment) => segment === '.' || segment === '..')
  ) {
    throw new Error(`[PATH] INVALID_STORAGE_KEY storageKey="${storageKey}"`);
  }

  return resolveAppDataPath(path.join(...segments));
}

// ── 公共目录 ────────────────────────────────────────────────
export function getTmpDir(): string {
  return resolveAppDataPath('tmp');
}

export function getBackupsDir(): string {
  return resolveAppDataPath('backups');
}

// ── 供测试或诊断使用 ────────────────────────────────────────
export function getAppDataRoot(): string {
  return APP_DATA_ROOT;
}

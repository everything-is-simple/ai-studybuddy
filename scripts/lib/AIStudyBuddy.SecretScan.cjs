'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MAX_TEXT_FILE_BYTES = 512 * 1024;
const TEXT_EXTENSIONS = new Set([
  '.bat',
  '.cjs',
  '.cmd',
  '.conf',
  '.ini',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.properties',
  '.ps1',
  '.psm1',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);
const SENSITIVE_BASENAMES = new Set(['.env.local', 'production.env']);
const RULES = [
  {
    id: 'ASB-CREDENTIAL-ASSIGNMENT',
    category: 'credential-assignment',
    pattern:
      /(?:^|[\s;])(?:[A-Z][A-Z0-9_]*(?:TOKEN|SECRET|API_KEY|PASSWORD|AUTH_CODE|WEBHOOK_URL)|API_KEY|SECRET|TOKEN|PASSWORD|AUTH_CODE|WEBHOOK_URL|(?:api|secret|access)[_-]?key)\s*[:=]\s*(?:"[^"]{16,}"|'[^']{16,}'|[^\s#]{16,})/i,
  },
];

function createBoundaryError(code) {
  const error = new Error(code);
  error.code = code;
  error.stack = undefined;
  return error;
}

function toRelativePath(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0 || candidate.includes('\0')) {
    throw createBoundaryError('SECRET_SCAN_INVALID_INPUT');
  }
  const normalized = candidate.replace(/\\/g, '/');
  if (
    path.isAbsolute(normalized) ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized === '..'
  ) {
    throw createBoundaryError('SECRET_SCAN_INVALID_INPUT');
  }
  return normalized.replace(/^\.\//, '');
}

function isSensitivePath(relativePath) {
  return SENSITIVE_BASENAMES.has(path.posix.basename(relativePath).toLowerCase());
}

function isTextCandidate(relativePath) {
  return TEXT_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase());
}

function resolveCandidate(rootDir, relativePath) {
  const root = path.resolve(rootDir);
  const absolute = path.resolve(root, ...relativePath.split('/'));
  const relative = path.relative(root, absolute);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw createBoundaryError('SECRET_SCAN_INVALID_INPUT');
  }
  return absolute;
}

function createFinding(relativePath, rule, lineNumber) {
  const fingerprint = crypto
    .createHash('sha256')
    .update(`${rule.id}:${relativePath}:${lineNumber}`)
    .digest('hex')
    .slice(0, 12);
  return { path: relativePath, ruleId: rule.id, category: rule.category, line: lineNumber, fingerprint };
}

function findLineFindings(relativePath, text) {
  const findings = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    for (const rule of RULES) {
      if (rule.pattern.test(line)) findings.push(createFinding(relativePath, rule, index + 1));
    }
  }
  return findings;
}

function createEmptySkipped() {
  return { sensitive: 0, nonText: 0, symlink: 0, oversize: 0 };
}

async function safelyAccessFile(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error?.code?.startsWith('SECRET_SCAN_')) throw error;
    throw createBoundaryError('SECRET_SCAN_FILE_ACCESS_FAILED');
  }
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function normalizeFinding(finding) {
  const knownRule = RULES.find((rule) => rule.id === finding?.ruleId && rule.category === finding?.category);
  if (
    !knownRule ||
    !isNonNegativeInteger(finding?.line) ||
    finding.line === 0 ||
    typeof finding?.fingerprint !== 'string' ||
    !/^[a-f0-9]{12}$/.test(finding.fingerprint)
  ) {
    throw createBoundaryError('SECRET_SCAN_INVALID_REPORT');
  }
  return {
    path: toRelativePath(finding.path),
    ruleId: knownRule.id,
    category: knownRule.category,
    line: finding.line,
    fingerprint: finding.fingerprint,
  };
}

function normalizeSkipped(skipped) {
  const keys = ['sensitive', 'nonText', 'symlink', 'oversize'];
  if (!skipped || keys.some((key) => !isNonNegativeInteger(skipped[key]))) {
    throw createBoundaryError('SECRET_SCAN_INVALID_REPORT');
  }
  return Object.fromEntries(keys.map((key) => [key, skipped[key]]));
}

async function scanSecretBoundary({
  rootDir,
  trackedFiles,
  readFile = fs.readFile,
  lstat = fs.lstat,
  stat = fs.stat,
  maxBytes = MAX_TEXT_FILE_BYTES,
} = {}) {
  if (!rootDir || !Array.isArray(trackedFiles) || !Number.isInteger(maxBytes) || maxBytes <= 0) {
    throw createBoundaryError('SECRET_SCAN_INVALID_INPUT');
  }

  const skipped = createEmptySkipped();
  const findings = [];
  const seen = new Set();
  let scannedFiles = 0;

  for (const candidate of trackedFiles) {
    const relativePath = toRelativePath(candidate);
    if (seen.has(relativePath)) continue;
    seen.add(relativePath);
    if (isSensitivePath(relativePath)) {
      skipped.sensitive += 1;
      continue;
    }
    if (!isTextCandidate(relativePath)) {
      skipped.nonText += 1;
      continue;
    }

    const absolutePath = resolveCandidate(rootDir, relativePath);
    const linkInfo = await safelyAccessFile(() => lstat(absolutePath));
    if (linkInfo.isSymbolicLink()) {
      skipped.symlink += 1;
      continue;
    }
    const fileInfo = await safelyAccessFile(() => stat(absolutePath));
    if (!fileInfo.isFile() || fileInfo.size > maxBytes) {
      skipped.oversize += 1;
      continue;
    }
    const text = await safelyAccessFile(() => readFile(absolutePath, 'utf8'));
    if (typeof text !== 'string') throw createBoundaryError('SECRET_SCAN_FILE_ACCESS_FAILED');

    scannedFiles += 1;
    findings.push(...findLineFindings(relativePath, text));
  }

  return { status: 'ok', scannedFiles, findingCount: findings.length, skipped, findings };
}

function listGitTrackedFiles(rootDir, { runGit = spawnSync } = {}) {
  if (!rootDir) throw createBoundaryError('SECRET_SCAN_INVALID_INPUT');
  let result;
  try {
    result = runGit('git', ['-C', rootDir, 'ls-files', '-z'], { encoding: 'buffer', windowsHide: true });
  } catch {
    throw createBoundaryError('SECRET_SCAN_TRACKED_FILE_LIST_FAILED');
  }
  if (result?.status !== 0 || !Buffer.isBuffer(result?.stdout)) {
    throw createBoundaryError('SECRET_SCAN_TRACKED_FILE_LIST_FAILED');
  }
  return result.stdout.toString('utf8').split('\0').filter(Boolean).map(toRelativePath);
}

function formatScanSummary(report) {
  if (
    !report ||
    report.status !== 'ok' ||
    !isNonNegativeInteger(report.scannedFiles) ||
    !Array.isArray(report.findings)
  ) {
    throw createBoundaryError('SECRET_SCAN_INVALID_REPORT');
  }
  const findings = report.findings.map(normalizeFinding);
  if (!isNonNegativeInteger(report.findingCount) || report.findingCount !== findings.length) {
    throw createBoundaryError('SECRET_SCAN_INVALID_REPORT');
  }
  return JSON.stringify({
    status: 'ok',
    scannedFiles: report.scannedFiles,
    findingCount: report.findingCount,
    skipped: normalizeSkipped(report.skipped),
    findings,
  });
}

module.exports = { MAX_TEXT_FILE_BYTES, formatScanSummary, listGitTrackedFiles, scanSecretBoundary };

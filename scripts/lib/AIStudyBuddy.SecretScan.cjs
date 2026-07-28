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



const CONTROLLED_READONLY_CONTRACT_VERSION = 'phase3-p1-controlled-readonly-v1';
const CONTROLLED_SYNTHETIC_READERS = new WeakSet();
const CONTROLLED_SYNTHETIC_FAILURE_MODES = new Set(['read-failure', 'replacement']);

function createControlledError(code) {
  return createBoundaryError(code);
}

function requireFullHex(value, code, lengths = [64]) {
  if (typeof value !== 'string' || !lengths.includes(value.length) || !/^[a-f0-9]+$/.test(value)) {
    throw createControlledError(code);
  }
  return value;
}

function normalizeControlledTrackedFiles(trackedFiles) {
  if (!Array.isArray(trackedFiles) || trackedFiles.length === 0) {
    throw createControlledError('R1_TRACKED_LIST_UNAVAILABLE');
  }
  const values = [...new Set(trackedFiles.map(toRelativePath))].sort();
  if (values.length !== trackedFiles.length) throw createControlledError('R1_TRACKED_LIST_UNAVAILABLE');
  return values;
}

function calculateControlledTrackedScopeIdentity(trackedFiles) {
  const values = normalizeControlledTrackedFiles(trackedFiles);
  return crypto.createHash('sha256').update(values.join('\0'), 'utf8').digest('hex');
}

function normalizeControlledCandidates(candidates, errorCode) {
  if (!Array.isArray(candidates) || candidates.length === 0) throw createControlledError(errorCode);
  const seen = new Set();
  const result = [];
  for (const candidate of candidates) {
    try {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw createControlledError(errorCode);
      const relativePath = toRelativePath(candidate.relativePath);
      if (seen.has(relativePath) || typeof candidate.locator !== 'string' || candidate.locator.length === 0) {
        throw createControlledError(errorCode);
      }
      seen.add(relativePath);
      result.push(Object.freeze({ relativePath, locator: candidate.locator }));
    } catch (error) {
      if (error?.code) throw error;
      throw createControlledError(errorCode);
    }
  }
  return result;
}

function equalStringSets(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizeControlledApproval(approval, trackedFiles, packageIdentityBefore, packageIdentityAfter) {
  try {
    if (!approval || typeof approval !== 'object' || Array.isArray(approval)) throw createControlledError('P1_APPROVAL_MISSING');
    requireFullHex(approval.fullCommit, 'P1_APPROVAL_MISSING', [40, 64]);
    if (typeof approval.windowId !== 'string' || !/^[A-Za-z0-9_-]{12,128}$/.test(approval.windowId)) {
      throw createControlledError('P1_APPROVAL_MISSING');
    }
    const trackedIdentity = calculateControlledTrackedScopeIdentity(trackedFiles);
    if (approval.trackedScopeIdentity !== trackedIdentity) throw createControlledError('R1_TRACKED_LIST_UNAVAILABLE');
    const approvedPackageIdentity = requireFullHex(approval.packageContentIdentity, 'R1_PACKAGE_IDENTITY_INVALID');
    if (
      requireFullHex(packageIdentityBefore, 'R1_PACKAGE_IDENTITY_INVALID') !== approvedPackageIdentity ||
      requireFullHex(packageIdentityAfter, 'R1_PACKAGE_IDENTITY_INVALID') !== approvedPackageIdentity
    ) {
      throw createControlledError('R1_PACKAGE_IDENTITY_INVALID');
    }
    return Object.freeze({ fullCommit: approval.fullCommit, windowId: approval.windowId });
  } catch (error) {
    if (error?.code) throw error;
    throw createControlledError('P1_APPROVAL_MISSING');
  }
}

function createControlledSyntheticReader({ content = 'synthetic-content', failureMode } = {}) {
  if (typeof content !== 'string' && !Buffer.isBuffer(content)) throw createControlledError('R1_NOFOLLOW_RISK');
  if (failureMode !== undefined && !CONTROLLED_SYNTHETIC_FAILURE_MODES.has(failureMode)) {
    throw createControlledError('R1_NOFOLLOW_RISK');
  }

  const source = Buffer.from(content);
  let openedCount = 0;
  let readCount = 0;
  let closeCount = 0;
  const reader = Object.freeze({
    openVerifiedPath() {
      openedCount += 1;
      return Object.freeze({ syntheticHandle: openedCount });
    },
    readVerifiedFile({ opened, maxBytes }) {
      readCount += 1;
      try {
        if (!opened || !Number.isSafeInteger(maxBytes) || maxBytes < 0) {
          throw createControlledError('NOFOLLOW_READ_FAILED');
        }
        if (failureMode === 'read-failure') throw createControlledError('NOFOLLOW_READ_FAILED');
        if (failureMode === 'replacement') throw createControlledError('NOFOLLOW_HANDLE_IDENTITY_CHANGED');
        if (source.length > maxBytes) throw createControlledError('NOFOLLOW_READ_LIMIT_EXCEEDED');
        return Buffer.from(source);
      } finally {
        closeCount += 1;
      }
    },
  });
  CONTROLLED_SYNTHETIC_READERS.add(reader);
  return Object.freeze({
    reader,
    getMetrics() {
      return Object.freeze({ openedCount, readCount, closeCount });
    },
  });
}

function assertControlledReader(reader) {
  if (!reader || typeof reader !== 'object' || !CONTROLLED_SYNTHETIC_READERS.has(reader)) {
    throw createControlledError('R1_NOFOLLOW_RISK');
  }
  return reader;
}

function rethrowControlledNoFollow(error) {
  if (error?.code === 'R1_NOFOLLOW_RISK') throw error;
  // No reader-provided message or code may cross the controlled R1 boundary.
  throw createControlledError('R1_NOFOLLOW_RISK');
}

function createControlledArtifactId() {
  return crypto.randomBytes(18).toString('hex');
}

function normalizeControlledSkipped(skipped) {
  return Object.freeze({
    sensitive: skipped.sensitive,
    nonText: skipped.nonText,
    oversize: skipped.oversize,
  });
}

function createControlledRuleCounts(findings) {
  const counts = new Map();
  for (const finding of findings) {
    const key = `${finding.ruleId}\0${finding.category}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.freeze([...counts.entries()]
    .map(([key, count]) => {
      const [ruleId, category] = key.split('\0');
      return Object.freeze({ ruleId, category, count });
    })
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId)));
}

function normalizeControlledReport(report) {
  if (!report || typeof report !== 'object' || report.status !== 'ok' || report.contractVersion !== CONTROLLED_READONLY_CONTRACT_VERSION) {
    throw createControlledError('R1_OUTPUT_REDACTION_FAILED');
  }
  if (!isNonNegativeInteger(report.scannedFiles) || !isNonNegativeInteger(report.findingCount) || typeof report.artifactId !== 'string' || !/^[a-f0-9]{36}$/.test(report.artifactId)) {
    throw createControlledError('R1_OUTPUT_REDACTION_FAILED');
  }
  if (!report.skipped || ['sensitive', 'nonText', 'oversize'].some((key) => !isNonNegativeInteger(report.skipped[key]))) {
    throw createControlledError('R1_OUTPUT_REDACTION_FAILED');
  }
  if (!Array.isArray(report.ruleCounts) || report.ruleCounts.some((item) => !RULES.some((rule) => rule.id === item?.ruleId && rule.category === item?.category) || !isNonNegativeInteger(item?.count) || item.count === 0)) {
    throw createControlledError('R1_OUTPUT_REDACTION_FAILED');
  }
  return Object.freeze({
    status: 'ok',
    contractVersion: report.contractVersion,
    artifactId: report.artifactId,
    scannedFiles: report.scannedFiles,
    findingCount: report.findingCount,
    skipped: normalizeControlledSkipped(report.skipped),
    ruleCounts: Object.freeze(report.ruleCounts.map((item) => Object.freeze({ ruleId: item.ruleId, category: item.category, count: item.count }))),
  });
}

function formatControlledScanSummary(report) {
  return JSON.stringify(normalizeControlledReport(report));
}

async function scanControlledSecretBoundary({
  approval,
  trackedFiles,
  repositoryCandidates,
  packageCandidates,
  packageIdentityBefore,
  packageIdentityAfter,
  reader,
  maxBytes = MAX_TEXT_FILE_BYTES,
} = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw createControlledError('R1_NOFOLLOW_RISK');
  const normalizedTrackedFiles = normalizeControlledTrackedFiles(trackedFiles);
  normalizeControlledApproval(approval, normalizedTrackedFiles, packageIdentityBefore, packageIdentityAfter);
  const normalizedRepositoryCandidates = normalizeControlledCandidates(repositoryCandidates, 'R1_TRACKED_LIST_UNAVAILABLE');
  const normalizedPackageCandidates = normalizeControlledCandidates(packageCandidates, 'R1_PACKAGE_IDENTITY_INVALID');
  if (!equalStringSets(normalizedTrackedFiles, normalizedRepositoryCandidates.map((candidate) => candidate.relativePath).sort())) {
    throw createControlledError('R1_UNTRACKED_OR_OUT_OF_SCOPE');
  }
  const verifiedReader = assertControlledReader(reader);
  const skipped = { sensitive: 0, nonText: 0, oversize: 0 };
  const findings = [];
  let scannedFiles = 0;

  for (const candidate of [...normalizedRepositoryCandidates, ...normalizedPackageCandidates]) {
    if (isSensitivePath(candidate.relativePath)) {
      skipped.sensitive += 1;
      continue;
    }
    if (!isTextCandidate(candidate.relativePath)) {
      skipped.nonText += 1;
      continue;
    }
    let opened;
    let bytes;
    try {
      opened = verifiedReader.openVerifiedPath({ locator: candidate.locator, expectedKind: 'file' });
      bytes = verifiedReader.readVerifiedFile({ opened, maxBytes });
      if (!Buffer.isBuffer(bytes)) throw createControlledError('R1_NOFOLLOW_RISK');
      const text = bytes.toString('utf8');
      findings.push(...findLineFindings(candidate.relativePath, text));
      scannedFiles += 1;
    } catch (error) {
      // The no-follow reader owns the handle lifecycle and closes it on every read outcome.
      rethrowControlledNoFollow(error);
    } finally {
      if (Buffer.isBuffer(bytes)) bytes.fill(0);
    }
  }

  return normalizeControlledReport({
    status: 'ok',
    contractVersion: CONTROLLED_READONLY_CONTRACT_VERSION,
    artifactId: createControlledArtifactId(),
    scannedFiles,
    findingCount: findings.length,
    skipped,
    ruleCounts: createControlledRuleCounts(findings),
  });
}

module.exports = {
  CONTROLLED_READONLY_CONTRACT_VERSION,
  MAX_TEXT_FILE_BYTES,
  calculateControlledTrackedScopeIdentity,
  createControlledSyntheticReader,
  formatControlledScanSummary,
  formatScanSummary,
  listGitTrackedFiles,
  scanControlledSecretBoundary,
  scanSecretBoundary,
};

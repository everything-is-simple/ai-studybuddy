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


const SIGNOFF_SCANNER_VERSION = 't02-r1-signoff-v1';
const FULL_COMMIT_RE = /^[a-f0-9]{40}$/;
const SHORT_HEX_RE = /^[a-f0-9]{12}$/;
const ARTIFACT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{7,63}$/;
const APPROVAL_WINDOW_RE = /^[A-Z][A-Z0-9_-]{7,31}$/;
const PACKAGE_MANIFEST_NAME = 'deployment-manifest.json';

function normalizeSignoffMetadata({ artifactId, approvedCommit, packageFingerprint, approvalWindowId } = {}) {
  if (
    typeof artifactId !== 'string' || !ARTIFACT_ID_RE.test(artifactId) ||
    typeof approvedCommit !== 'string' || !FULL_COMMIT_RE.test(approvedCommit) ||
    typeof packageFingerprint !== 'string' || !SHORT_HEX_RE.test(packageFingerprint) ||
    typeof approvalWindowId !== 'string' || !APPROVAL_WINDOW_RE.test(approvalWindowId)
  ) {
    throw createBoundaryError('SECRET_SCAN_SIGNOFF_METADATA_INVALID');
  }
  return { artifactId, approvedCommit, packageFingerprint, approvalWindowId };
}

function runSilentGit(rootDir, args, runGit) {
  let result;
  try {
    result = runGit('git', ['-C', rootDir, ...args], {
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch {
    throw createBoundaryError('SECRET_SCAN_GIT_STATE_UNVERIFIABLE');
  }
  if (!result || typeof result.status !== 'number') {
    throw createBoundaryError('SECRET_SCAN_GIT_STATE_UNVERIFIABLE');
  }
  return result;
}

function verifyApprovedGitState(rootDir, approvedCommit, { runGit = spawnSync } = {}) {
  if (!rootDir || typeof approvedCommit !== 'string' || !FULL_COMMIT_RE.test(approvedCommit)) {
    throw createBoundaryError('SECRET_SCAN_SIGNOFF_METADATA_INVALID');
  }
  const verified = runSilentGit(rootDir, ['rev-parse', '--verify', `${approvedCommit}^{commit}`], runGit);
  const head = runSilentGit(rootDir, ['rev-parse', '--verify', 'HEAD'], runGit);
  if (verified.status !== 0 || head.status !== 0 || !Buffer.isBuffer(head.stdout)) {
    throw createBoundaryError('SECRET_SCAN_GIT_STATE_UNVERIFIABLE');
  }
  if (head.stdout.toString('utf8').trim() !== approvedCommit) {
    throw createBoundaryError('SECRET_SCAN_APPROVED_COMMIT_MISMATCH');
  }
  const staged = runSilentGit(rootDir, ['diff', '--quiet', '--cached', approvedCommit, '--'], runGit);
  const unstaged = runSilentGit(rootDir, ['diff', '--quiet', approvedCommit, '--'], runGit);
  if (staged.status === 1 || unstaged.status === 1) {
    throw createBoundaryError('SECRET_SCAN_TRACKED_CHANGES_PRESENT');
  }
  if (staged.status !== 0 || unstaged.status !== 0) {
    throw createBoundaryError('SECRET_SCAN_GIT_STATE_UNVERIFIABLE');
  }
}

function getBlockedReason(report) {
  for (const key of ['sensitive', 'nonText', 'symlink', 'oversize']) {
    if (report.skipped[key] === 1) return key;
  }
  return null;
}

function createEmptyBlocked() {
  return { sensitive: 0, nonText: 0, symlink: 0, oversize: 0, unreadable: 0 };
}

function createEmptyRuleCounts() {
  return Object.fromEntries(RULES.map((rule) => [rule.id, 0]));
}

async function scanSecretSignoffBoundary({ rootDir, candidates, ...options } = {}) {
  if (!rootDir || !Array.isArray(candidates)) {
    throw createBoundaryError('SECRET_SCAN_INVALID_INPUT');
  }
  const normalizedCandidates = candidates.map(toRelativePath);
  if (new Set(normalizedCandidates).size !== normalizedCandidates.length) {
    throw createBoundaryError('SECRET_SCAN_INVALID_INPUT');
  }
  const blocked = createEmptyBlocked();
  const ruleCounts = createEmptyRuleCounts();
  let scannedFiles = 0;
  let findingCount = 0;
  for (const candidate of normalizedCandidates) {
    try {
      const report = await scanSecretBoundary({ rootDir, trackedFiles: [candidate], ...options });
      const reason = getBlockedReason(report);
      if (reason) {
        blocked[reason] += 1;
        continue;
      }
      if (report.scannedFiles !== 1) throw createBoundaryError('SECRET_SCAN_INVALID_REPORT');
      scannedFiles += 1;
      findingCount += report.findingCount;
      for (const finding of report.findings) ruleCounts[finding.ruleId] += 1;
    } catch (error) {
      if (error?.code === 'SECRET_SCAN_FILE_ACCESS_FAILED') {
        blocked.unreadable += 1;
        continue;
      }
      throw error;
    }
  }
  const blockedInputCount = Object.values(blocked).reduce((sum, value) => sum + value, 0);
  if (scannedFiles + blockedInputCount !== normalizedCandidates.length) {
    throw createBoundaryError('SECRET_SCAN_INVALID_REPORT');
  }
  return {
    inputCount: normalizedCandidates.length,
    scannedFiles,
    blockedInputCount,
    blocked,
    findingCount,
    ruleCounts,
  };
}

function normalizeSignoffScanReport(report) {
  const blockedKeys = ['sensitive', 'nonText', 'symlink', 'oversize', 'unreadable'];
  if (
    !report ||
    !isNonNegativeInteger(report.inputCount) ||
    !isNonNegativeInteger(report.scannedFiles) ||
    !isNonNegativeInteger(report.blockedInputCount) ||
    !isNonNegativeInteger(report.findingCount) ||
    !report.blocked ||
    !report.ruleCounts ||
    blockedKeys.some((key) => !isNonNegativeInteger(report.blocked[key])) ||
    RULES.some((rule) => !isNonNegativeInteger(report.ruleCounts[rule.id]))
  ) {
    throw createBoundaryError('SECRET_SCAN_INVALID_REPORT');
  }
  const calculatedBlocked = blockedKeys.reduce((sum, key) => sum + report.blocked[key], 0);
  const calculatedFindings = RULES.reduce((sum, rule) => sum + report.ruleCounts[rule.id], 0);
  if (
    calculatedBlocked !== report.blockedInputCount ||
    calculatedFindings !== report.findingCount ||
    report.inputCount !== report.scannedFiles + report.blockedInputCount
  ) {
    throw createBoundaryError('SECRET_SCAN_INVALID_REPORT');
  }
  return {
    inputCount: report.inputCount,
    scannedFiles: report.scannedFiles,
    blockedInputCount: report.blockedInputCount,
    findingCount: report.findingCount,
    blocked: Object.fromEntries(blockedKeys.map((key) => [key, report.blocked[key]])),
    ruleCounts: Object.fromEntries(RULES.map((rule) => [rule.id, report.ruleCounts[rule.id]])),
  };
}

function createSecretSignoffSummary({ metadata, repositoryReport, packageReport } = {}) {
  const safeMetadata = normalizeSignoffMetadata(metadata);
  const repository = normalizeSignoffScanReport(repositoryReport);
  const packageScan = normalizeSignoffScanReport(packageReport);
  const allReports = [repository, packageScan];
  const findingCount = allReports.reduce((sum, report) => sum + report.findingCount, 0);
  const blockedInputCount = allReports.reduce((sum, report) => sum + report.blockedInputCount, 0);
  const resultCode = repository.inputCount === 0 || packageScan.inputCount === 0
    ? 'SECRET_SCAN_INPUT_EMPTY'
    : findingCount > 0
      ? 'T02_P0_SECRET_SCAN_HIT'
      : blockedInputCount > 0
        ? 'BLOCKED_UNSCANNED_INPUT'
        : 'SECRET_SCAN_SIGNOFF_PASSED';
  return {
    scannerVersion: SIGNOFF_SCANNER_VERSION,
    artifactId: safeMetadata.artifactId,
    approvedCommitShort: safeMetadata.approvedCommit.slice(0, 12),
    packageFingerprint: safeMetadata.packageFingerprint,
    approvalWindowId: safeMetadata.approvalWindowId,
    resultCode,
    repository,
    package: packageScan,
  };
}

function isPathEqualOrDescendant(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function listApprovedPackageFiles({ packageRoot, repositoryRoot, opendir = fs.opendir, lstat = fs.lstat } = {}) {
  if (!packageRoot || !repositoryRoot) throw createBoundaryError('SECRET_SCAN_INVALID_INPUT');
  const root = path.resolve(packageRoot);
  const repo = path.resolve(repositoryRoot);
  if (isPathEqualOrDescendant(root, repo) || isPathEqualOrDescendant(repo, root)) {
    throw createBoundaryError('SECRET_SCAN_PACKAGE_ROOT_INVALID');
  }
  let rootInfo;
  try { rootInfo = await lstat(root); } catch { throw createBoundaryError('SECRET_SCAN_PACKAGE_ROOT_INVALID'); }
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw createBoundaryError('SECRET_SCAN_PACKAGE_ROOT_INVALID');
  }
  const pending = [''];
  const candidates = [];
  while (pending.length > 0) {
    const relativeDirectory = pending.pop();
    const absoluteDirectory = relativeDirectory ? resolveCandidate(root, relativeDirectory) : root;
    let directory;
    try { directory = await opendir(absoluteDirectory); } catch { throw createBoundaryError('SECRET_SCAN_PACKAGE_LIST_FAILED'); }
    for await (const entry of directory) {
      const relativePath = toRelativePath(relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        pending.push(relativePath);
      } else {
        candidates.push(relativePath);
      }
    }
  }
  return candidates.sort();
}

async function readApprovedPackageManifest({ packageRoot, approvedCommit, packageFingerprint, readFile = fs.readFile, lstat = fs.lstat } = {}) {
  if (!packageRoot || typeof approvedCommit !== 'string' || !FULL_COMMIT_RE.test(approvedCommit) || typeof packageFingerprint !== 'string' || !SHORT_HEX_RE.test(packageFingerprint)) {
    throw createBoundaryError('SECRET_SCAN_SIGNOFF_METADATA_INVALID');
  }
  const manifestPath = resolveCandidate(packageRoot, PACKAGE_MANIFEST_NAME);
  let info;
  let raw;
  try {
    info = await lstat(manifestPath);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('unsafe');
    raw = await readFile(manifestPath, 'utf8');
  } catch {
    throw createBoundaryError('SECRET_SCAN_PACKAGE_MANIFEST_INVALID');
  }
  let manifest;
  try { manifest = JSON.parse(raw); } catch { throw createBoundaryError('SECRET_SCAN_PACKAGE_MANIFEST_INVALID'); }
  if (manifest?.buildCommit !== approvedCommit || manifest?.packageFingerprint !== packageFingerprint) {
    throw createBoundaryError('SECRET_SCAN_PACKAGE_MANIFEST_MISMATCH');
  }
}

async function executeSecretScanSignoff({ repositoryRoot, packageRoot, metadata, runGit = spawnSync } = {}) {
  const safeMetadata = normalizeSignoffMetadata(metadata);
  verifyApprovedGitState(repositoryRoot, safeMetadata.approvedCommit, { runGit });
  await readApprovedPackageManifest({
    packageRoot,
    approvedCommit: safeMetadata.approvedCommit,
    packageFingerprint: safeMetadata.packageFingerprint,
  });
  const repositoryCandidates = listGitTrackedFiles(repositoryRoot, { runGit });
  const packageCandidates = await listApprovedPackageFiles({ packageRoot, repositoryRoot });
  const repositoryReport = await scanSecretSignoffBoundary({ rootDir: repositoryRoot, candidates: repositoryCandidates });
  const packageReport = await scanSecretSignoffBoundary({ rootDir: packageRoot, candidates: packageCandidates });
  return createSecretSignoffSummary({ metadata: safeMetadata, repositoryReport, packageReport });
}

module.exports = {
  MAX_TEXT_FILE_BYTES,
  SIGNOFF_SCANNER_VERSION,
  createSecretSignoffSummary,
  executeSecretScanSignoff,
  formatScanSummary,
  listApprovedPackageFiles,
  listGitTrackedFiles,
  normalizeSignoffMetadata,
  scanSecretBoundary,
  scanSecretSignoffBoundary,
  verifyApprovedGitState,
};

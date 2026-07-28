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
const APPROVAL_RECORD_SCHEMA = 'ai-studybuddy-t02-r1-approval-v1';

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
      if (typeof options.candidateGuard === 'function') await options.candidateGuard(candidate);
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
      if (error?.code === 'SECRET_SCAN_PACKAGE_REPARSE_RISK') {
        blocked.symlink += 1;
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

function isLocalAbsolutePath(candidate) {
  return typeof candidate === 'string' && path.isAbsolute(candidate) && !candidate.startsWith('\\\\') && !candidate.startsWith('//');
}

async function assertApprovedPackageRoot({ packageRoot, repositoryRoot, lstat = fs.lstat, realpath = fs.realpath } = {}) {
  if (!isLocalAbsolutePath(packageRoot) || !isLocalAbsolutePath(repositoryRoot)) {
    throw createBoundaryError('SECRET_SCAN_PACKAGE_ROOT_INVALID');
  }
  const root = path.resolve(packageRoot);
  const repo = path.resolve(repositoryRoot);
  if (isPathEqualOrDescendant(root, repo) || isPathEqualOrDescendant(repo, root)) {
    throw createBoundaryError('SECRET_SCAN_PACKAGE_ROOT_INVALID');
  }
  let rootInfo;
  let realRoot;
  let realRepositoryRoot;
  try {
    rootInfo = await lstat(root);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('unsafe');
    realRoot = await realpath(root);
    realRepositoryRoot = await realpath(repo);
  } catch {
    throw createBoundaryError('SECRET_SCAN_PACKAGE_ROOT_INVALID');
  }
  if (isPathEqualOrDescendant(realRoot, realRepositoryRoot) || isPathEqualOrDescendant(realRepositoryRoot, realRoot)) {
    throw createBoundaryError('SECRET_SCAN_PACKAGE_ROOT_INVALID');
  }
  return { root, realRoot };
}

function parseApprovalRecord(raw, { now = Date.now } = {}) {
  let record;
  try { record = JSON.parse(raw); } catch { throw createBoundaryError('SECRET_SCAN_APPROVAL_RECORD_INVALID'); }
  const expectedKeys = new Set([
    'schema', 'artifactId', 'approvedCommit', 'packageFingerprint', 'approvalWindowId',
    'windowStartsAtUtc', 'windowEndsAtUtc', 'packageRoot',
  ]);
  if (
    !record || typeof record !== 'object' || Array.isArray(record) ||
    Object.keys(record).length !== expectedKeys.size || Object.keys(record).some((key) => !expectedKeys.has(key)) ||
    record.schema !== APPROVAL_RECORD_SCHEMA || !isLocalAbsolutePath(record.packageRoot)
  ) {
    throw createBoundaryError('SECRET_SCAN_APPROVAL_RECORD_INVALID');
  }
  const startsAt = Date.parse(record.windowStartsAtUtc);
  const endsAt = Date.parse(record.windowEndsAtUtc);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt || now() < startsAt || now() > endsAt) {
    throw createBoundaryError('SECRET_SCAN_APPROVAL_WINDOW_INVALID');
  }
  return { packageRoot: path.resolve(record.packageRoot), metadata: normalizeSignoffMetadata(record) };
}

async function readApprovedSignoffRecord({ approvalRecordPath, repositoryRoot, readFile = fs.readFile, lstat = fs.lstat, realpath = fs.realpath, now = Date.now } = {}) {
  if (!isLocalAbsolutePath(approvalRecordPath) || !isLocalAbsolutePath(repositoryRoot)) {
    throw createBoundaryError('SECRET_SCAN_APPROVAL_RECORD_INVALID');
  }
  const recordPath = path.resolve(approvalRecordPath);
  const repo = path.resolve(repositoryRoot);
  if (isPathEqualOrDescendant(recordPath, repo)) throw createBoundaryError('SECRET_SCAN_APPROVAL_RECORD_INVALID');
  let info;
  let realRecordPath;
  let realRepositoryRoot;
  let raw;
  try {
    info = await lstat(recordPath);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('unsafe');
    realRecordPath = await realpath(recordPath);
    realRepositoryRoot = await realpath(repo);
    if (isPathEqualOrDescendant(realRecordPath, realRepositoryRoot)) throw new Error('unsafe');
    raw = await readFile(recordPath, 'utf8');
  } catch {
    throw createBoundaryError('SECRET_SCAN_APPROVAL_RECORD_INVALID');
  }
  const approval = parseApprovalRecord(raw, { now });
  if (isPathEqualOrDescendant(realRecordPath, approval.packageRoot) || isPathEqualOrDescendant(approval.packageRoot, realRecordPath)) {
    throw createBoundaryError('SECRET_SCAN_APPROVAL_RECORD_INVALID');
  }
  return approval;
}

async function assertApprovedPackageEntry({ approvedPackageRoot, relativePath, expectedDirectory, lstat = fs.lstat, realpath = fs.realpath } = {}) {
  if (!approvedPackageRoot?.root || !approvedPackageRoot?.realRoot) {
    throw createBoundaryError('SECRET_SCAN_PACKAGE_ROOT_INVALID');
  }
  const absolutePath = resolveCandidate(approvedPackageRoot.root, relativePath);
  let info;
  let physicalPath;
  try {
    info = await lstat(absolutePath);
    if (info.isSymbolicLink() || (expectedDirectory && !info.isDirectory())) throw new Error('unsafe');
    physicalPath = await realpath(absolutePath);
  } catch {
    throw createBoundaryError('SECRET_SCAN_PACKAGE_REPARSE_RISK');
  }
  if (!isPathEqualOrDescendant(physicalPath, approvedPackageRoot.realRoot)) {
    throw createBoundaryError('SECRET_SCAN_PACKAGE_REPARSE_RISK');
  }
  return { absolutePath, info };
}

async function listApprovedPackageFiles({ packageRoot, repositoryRoot, approvedPackageRoot, opendir = fs.opendir, lstat = fs.lstat, realpath = fs.realpath } = {}) {
  const approved = approvedPackageRoot || await assertApprovedPackageRoot({ packageRoot, repositoryRoot, lstat, realpath });
  const pending = [''];
  const candidates = [];
  while (pending.length > 0) {
    const relativeDirectory = pending.pop();
    const directoryEntry = relativeDirectory
      ? await assertApprovedPackageEntry({ approvedPackageRoot: approved, relativePath: relativeDirectory, expectedDirectory: true, lstat, realpath })
      : { absolutePath: approved.root };
    let directory;
    try { directory = await opendir(directoryEntry.absolutePath); } catch { throw createBoundaryError('SECRET_SCAN_PACKAGE_LIST_FAILED'); }
    for await (const entry of directory) {
      const relativePath = toRelativePath(relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name);
      let entryInfo;
      try { entryInfo = await lstat(resolveCandidate(approved.root, relativePath)); } catch { throw createBoundaryError('SECRET_SCAN_PACKAGE_LIST_FAILED'); }
      if (entryInfo.isDirectory() && !entryInfo.isSymbolicLink()) {
        await assertApprovedPackageEntry({ approvedPackageRoot: approved, relativePath, expectedDirectory: true, lstat, realpath });
        pending.push(relativePath);
      } else {
        candidates.push(relativePath);
      }
    }
  }
  return candidates.sort();
}

async function readApprovedPackageManifest({ approvedPackageRoot, approvedCommit, packageFingerprint, readFile = fs.readFile, lstat = fs.lstat, realpath = fs.realpath } = {}) {
  if (!approvedPackageRoot || typeof approvedCommit !== 'string' || !FULL_COMMIT_RE.test(approvedCommit) || typeof packageFingerprint !== 'string' || !SHORT_HEX_RE.test(packageFingerprint)) {
    throw createBoundaryError('SECRET_SCAN_SIGNOFF_METADATA_INVALID');
  }
  let manifestPath;
  let info;
  let raw;
  try {
    ({ absolutePath: manifestPath, info } = await assertApprovedPackageEntry({
      approvedPackageRoot,
      relativePath: PACKAGE_MANIFEST_NAME,
      expectedDirectory: false,
      lstat,
      realpath,
    }));
    if (!info.isFile()) throw new Error('unsafe');
    raw = await readFile(manifestPath, 'utf8');
  } catch (error) {
    if (error?.code === 'SECRET_SCAN_PACKAGE_REPARSE_RISK') throw error;
    throw createBoundaryError('SECRET_SCAN_PACKAGE_MANIFEST_INVALID');
  }
  let manifest;
  try { manifest = JSON.parse(raw); } catch { throw createBoundaryError('SECRET_SCAN_PACKAGE_MANIFEST_INVALID'); }
  if (manifest?.buildCommit !== approvedCommit || manifest?.packageFingerprint !== packageFingerprint) {
    throw createBoundaryError('SECRET_SCAN_PACKAGE_MANIFEST_MISMATCH');
  }
}

async function executeSecretScanSignoff({
  repositoryRoot,
  approvalRecordPath,
  runGit = spawnSync,
  packageLstat = fs.lstat,
  approvalRecordReadFile = fs.readFile,
  packageReadFile = fs.readFile,
  packageOpendir = fs.opendir,
  packageRealpath = fs.realpath,
  now = Date.now,
} = {}) {
  const approval = await readApprovedSignoffRecord({
    approvalRecordPath,
    repositoryRoot,
    readFile: approvalRecordReadFile,
    lstat: packageLstat,
    realpath: packageRealpath,
    now,
  });
  const safeMetadata = approval.metadata;
  verifyApprovedGitState(repositoryRoot, safeMetadata.approvedCommit, { runGit });
  const approvedPackageRoot = await assertApprovedPackageRoot({
    packageRoot: approval.packageRoot,
    repositoryRoot,
    lstat: packageLstat,
    realpath: packageRealpath,
  });
  await readApprovedPackageManifest({
    approvedPackageRoot,
    approvedCommit: safeMetadata.approvedCommit,
    packageFingerprint: safeMetadata.packageFingerprint,
    readFile: packageReadFile,
    lstat: packageLstat,
    realpath: packageRealpath,
  });
  const repositoryCandidates = listGitTrackedFiles(repositoryRoot, { runGit });
  const packageCandidates = await listApprovedPackageFiles({
    approvedPackageRoot,
    opendir: packageOpendir,
    lstat: packageLstat,
    realpath: packageRealpath,
  });
  const repositoryReport = await scanSecretSignoffBoundary({ rootDir: repositoryRoot, candidates: repositoryCandidates });
  const packageReport = await scanSecretSignoffBoundary({
    rootDir: approvedPackageRoot.root,
    candidates: packageCandidates,
    candidateGuard: async (relativePath) => assertApprovedPackageEntry({
      approvedPackageRoot,
      relativePath,
      expectedDirectory: false,
      lstat: packageLstat,
      realpath: packageRealpath,
    }),
  });
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
  assertApprovedPackageRoot,
  parseApprovalRecord,
  readApprovedSignoffRecord,
  verifyApprovedGitState,
};

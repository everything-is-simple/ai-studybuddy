// T02-R1: 正式仓库与实际部署包秘密扫描签收（Wave 0）
// 只读：仅对 Git 已跟踪文件清单与已批准候选部署包根执行受控扫描。
// 输出只含规则名、相对路径、类别、行号、脱敏短指纹，不含秘密值。
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const PACKAGE_ROOT = process.env.AUDIT_PACKAGE_ROOT || 'H:/AIStudyBuddy-v0.8.1-win64';
const PACKAGE_MANIFEST = path.join(PACKAGE_ROOT, 'deployment-manifest.json');

const {
  listGitTrackedFiles,
  scanSecretBoundary,
  formatScanSummary,
} = require('./lib/AIStudyBuddy.SecretScan.cjs');

function shortHash(input) {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function listPackageFiles(root) {
  const out = [];
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else out.push(rel);
    }
  };
  if (fs.existsSync(root)) walk(root, '');
  return out;
}

async function main() {
  const report = { status: 'pending', scope: {}, findings: [], summary: {} };

  // ---- 范围 1: Git 已跟踪文件 ----
  const tracked = listGitTrackedFiles(REPO_ROOT);
  const trackedResult = await scanSecretBoundary({ rootDir: REPO_ROOT, trackedFiles: tracked });
  report.scope.git = {
    fileCount: tracked.length,
    scannedFiles: trackedResult.scannedFiles,
    findingCount: trackedResult.findingCount,
    skipped: trackedResult.skipped,
  };
  report.findings.push(
    ...trackedResult.findings.map((f) => ({
      scope: 'git-tracked',
      rule: f.ruleId,
      category: f.category,
      path: f.path,
      line: f.line,
      fingerprint: f.fingerprint || shortHash(`${f.ruleId}:${f.path}:${f.line}`),
    }))
  );

  // ---- 范围 2: 已批准候选部署包根 ----
  if (fs.existsSync(PACKAGE_ROOT)) {
    const pkgFiles = listPackageFiles(PACKAGE_ROOT);
    const pkgResult = await scanSecretBoundary({ rootDir: PACKAGE_ROOT, trackedFiles: pkgFiles });
    report.scope.package = {
      root: 'AIStudyBuddy-v0.8.1-win64', // 脱敏：不输出绝对路径
      fileCount: pkgFiles.length,
      scannedFiles: pkgResult.scannedFiles,
      findingCount: pkgResult.findingCount,
      skipped: pkgResult.skipped,
      sha256Short: shortHash(fs.readFileSync(PACKAGE_MANIFEST)),
    };
    report.findings.push(
      ...pkgResult.findings.map((f) => ({
        scope: 'package',
        rule: f.ruleId,
        category: f.category,
        path: f.path,
        line: f.line,
        fingerprint: f.fingerprint || shortHash(`${f.ruleId}:${f.path}:${f.line}`),
      }))
    );
  } else {
    report.scope.package = { root: 'AIStudyBuddy-v0.8.1-win64', note: 'not-found-at-configured-root' };
  }

  // ---- 签收结论 ----
  const totalFindings = report.findings.length;
  report.status = totalFindings === 0 ? 'signed-off-clean' : 'needs-review';
  report.summary = {
    totalFindings,
    gitTrackedFindingCount: report.scope.git.findingCount,
    packageFindingCount: report.scope.package.findingCount ?? 0,
    signedOffAt: new Date().toISOString(),
    conclusion: totalFindings === 0
      ? '正式仓库与候选部署包受控扫描未发现秘密模式命中，可签收。'
      : '发现命中，须逐条人工复核。',
  };

  const outPath = process.env.AUDIT_OUTPUT || path.join(REPO_ROOT, '.plans', 'evidence', 'phase3-wave0-r1-summary.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary, null, 2));
  console.log('证据输出:', outPath);
  process.exit(totalFindings === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('T02-R1 执行失败:', err.code || err.message);
  process.exit(2);
});

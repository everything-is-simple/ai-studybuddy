'use strict';

const path = require('node:path');
const { executeSecretScanSignoff } = require('./lib/AIStudyBuddy.SecretScan.cjs');

function fixedResult(resultCode) {
  process.stdout.write(`${JSON.stringify({ resultCode })}\n`);
}

function parseArguments(argv) {
  const values = new Map();
  const allowed = new Set(['--approval-record']);
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || typeof value !== 'string' || values.has(key)) {
      throw new Error('SECRET_SCAN_SIGNOFF_ARGUMENTS_INVALID');
    }
    values.set(key, value);
  }
  if (argv.length !== allowed.size * 2 || values.size !== allowed.size) {
    throw new Error('SECRET_SCAN_SIGNOFF_ARGUMENTS_INVALID');
  }
  return values;
}

async function main() {
  let values;
  try {
    values = parseArguments(process.argv.slice(2));
    const summary = await executeSecretScanSignoff({
      repositoryRoot: path.resolve(__dirname, '..'),
      approvalRecordPath: values.get('--approval-record'),
    });
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    process.exitCode = summary.resultCode === 'SECRET_SCAN_SIGNOFF_PASSED' ? 0 : 2;
  } catch (error) {
    fixedResult(typeof error?.code === 'string' ? error.code : 'SECRET_SCAN_SIGNOFF_FAILED');
    process.exitCode = 2;
  }
}

main();

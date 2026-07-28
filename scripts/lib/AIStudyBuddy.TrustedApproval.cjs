'use strict';

const crypto = require('node:crypto');
const { requireTrustedVerifierIntegrity } = require('./AIStudyBuddy.VerifierIntegrity.cjs');

const RESERVED_KEY_ID = 'asb-phase3-t02-approval-ed25519-v1';
const FIELD_NAMES = Object.freeze([
  'format',
  'keyId',
  'policyId',
  'purpose',
  'fullCommit',
  'contractVersion',
  'notBeforeEpochMs',
  'notAfterEpochMs',
  'approvalId',
  'scopeBinding',
  'artifactContentIdentity',
]);
const MAX_RECORD_BYTES = 2048;
const MAX_WINDOW_MS = 900000;
const MAX_EPOCH_MS = 253402300799999;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  error.stack = undefined;
  throw error;
}

function verifyTrustedApproval(_input) {
  requireTrustedVerifierIntegrity({ requiredContractVersion: '1' });
  return fail('TRUSTED_VERIFIER_INTEGRITY_UNPROVEN');
}

function isAscii(bytes) {
  for (const byte of bytes) {
    if (byte > 0x7f) return false;
  }
  return true;
}

function isCanonicalDecimal(value) {
  return /^(?:0|[1-9][0-9]*)$/.test(value);
}

function assertExactRecordBytes(recordBytes) {
  if (!Buffer.isBuffer(recordBytes) || recordBytes.length < 1 || recordBytes.length > MAX_RECORD_BYTES) {
    return fail('TRUSTED_APPROVAL_RECORD_INVALID');
  }
  if (!isAscii(recordBytes) || recordBytes.includes(0) || recordBytes.includes(13)) {
    return fail('TRUSTED_APPROVAL_RECORD_INVALID');
  }
  for (const byte of recordBytes) {
    if (byte < 0x20 && byte !== 0x0a) return fail('TRUSTED_APPROVAL_RECORD_INVALID');
  }
  if (recordBytes[recordBytes.length - 1] !== 0x0a) return fail('TRUSTED_APPROVAL_CANONICALIZATION_INVALID');

  const text = recordBytes.toString('ascii');
  const lines = text.slice(0, -1).split('\n');
  if (lines.length !== FIELD_NAMES.length || lines.some((line) => line.length === 0)) {
    return fail('TRUSTED_APPROVAL_SCHEMA_INVALID');
  }

  const values = Object.create(null);
  for (let index = 0; index < FIELD_NAMES.length; index += 1) {
    const line = lines[index];
    const separator = line.indexOf('=');
    if (separator < 1 || line.indexOf('=', separator + 1) !== -1) {
      return fail('TRUSTED_APPROVAL_SCHEMA_INVALID');
    }
    const name = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (name !== FIELD_NAMES[index] || Object.hasOwn(values, name)) {
      return fail('TRUSTED_APPROVAL_SCHEMA_INVALID');
    }
    values[name] = value;
  }

  if (values.keyId !== RESERVED_KEY_ID) return fail('TRUSTED_APPROVAL_KEY_UNTRUSTED');
  if (
    values.format !== 'ASB-TA1' ||
    !/^[A-Za-z0-9._-]{1,96}$/.test(values.policyId) ||
    !/^(?:T02-R1|T02-R2)$/.test(values.purpose) ||
    !/^[a-f0-9]{40}$/.test(values.fullCommit) ||
    !/^[A-Za-z0-9_-]{16,64}$/.test(values.approvalId) ||
    !/^sha256:[a-f0-9]{64}$/.test(values.scopeBinding) ||
    !/^sha256:[a-f0-9]{64}$/.test(values.artifactContentIdentity)
  ) {
    return fail('TRUSTED_APPROVAL_SCHEMA_INVALID');
  }

  for (const name of ['contractVersion', 'notBeforeEpochMs', 'notAfterEpochMs']) {
    if (!isCanonicalDecimal(values[name])) return fail('TRUSTED_APPROVAL_SCHEMA_INVALID');
  }

  const contractVersion = Number(values.contractVersion);
  const notBeforeEpochMs = Number(values.notBeforeEpochMs);
  const notAfterEpochMs = Number(values.notAfterEpochMs);
  if (
    !Number.isSafeInteger(contractVersion) ||
    contractVersion < 1 ||
    !Number.isSafeInteger(notBeforeEpochMs) ||
    !Number.isSafeInteger(notAfterEpochMs) ||
    notBeforeEpochMs > MAX_EPOCH_MS ||
    notAfterEpochMs > MAX_EPOCH_MS ||
    notBeforeEpochMs >= notAfterEpochMs ||
    notAfterEpochMs - notBeforeEpochMs > MAX_WINDOW_MS
  ) {
    return fail('TRUSTED_APPROVAL_SCHEMA_INVALID');
  }

  const canonical = Buffer.from(`${FIELD_NAMES.map((name) => `${name}=${values[name]}`).join('\n')}\n`, 'ascii');
  if (!crypto.timingSafeEqual(recordBytes, canonical)) {
    return fail('TRUSTED_APPROVAL_CANONICALIZATION_INVALID');
  }
  return Object.freeze({ values: Object.freeze(values), recordBytes: Buffer.from(recordBytes) });
}

function assertExpected(expected, record) {
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
    return fail('TRUSTED_APPROVAL_RECORD_INVALID');
  }
  const values = record.values;
  const checks = [
    ['policyId', 'TRUSTED_APPROVAL_POLICY_MISMATCH'],
    ['purpose', 'TRUSTED_APPROVAL_PURPOSE_MISMATCH'],
    ['fullCommit', 'TRUSTED_APPROVAL_COMMIT_MISMATCH'],
    ['contractVersion', 'TRUSTED_APPROVAL_CONTRACT_MISMATCH'],
    ['scopeBinding', 'TRUSTED_APPROVAL_SCOPE_MISMATCH'],
    ['artifactContentIdentity', 'TRUSTED_APPROVAL_CONTENT_IDENTITY_MISMATCH'],
  ];
  for (const [name, code] of checks) {
    if (String(expected[name]) !== values[name]) return fail(code);
  }
  const nowEpochMs = expected.nowEpochMs;
  if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < Number(values.notBeforeEpochMs) || nowEpochMs > Number(values.notAfterEpochMs)) {
    return fail('TRUSTED_APPROVAL_TIME_WINDOW_INVALID');
  }
}

function createCapability() {
  return Object.freeze({ [Symbol('trusted-approval')]: true });
}

function readSyntheticInput(input) {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('TRUSTED_APPROVAL_RECORD_INVALID');
    return {
      algorithm: input.algorithm,
      signatureBytes: input.signatureBytes,
      recordBytes: input.recordBytes,
      expected: input.expected,
    };
  } catch {
    return fail('TRUSTED_APPROVAL_RECORD_INVALID');
  }
}

function rethrowFixedApprovalError(error, fallbackCode) {
  if (error instanceof Error && typeof error.code === 'string' && error.code.startsWith('TRUSTED_APPROVAL_')) {
    throw error;
  }
  return fail(fallbackCode);
}

function __TEST_ONLY_createTrustedApprovalVerifier(options) {
  let publicKey;
  let testKeyId;
  let integrity;
  try {
    publicKey = options?.publicKey;
    testKeyId = options?.testKeyId;
    integrity = options?.integrity;
  } catch {
    return fail('TRUSTED_APPROVAL_KEY_UNTRUSTED');
  }
  try {
    if (
      publicKey?.type !== 'public' ||
      publicKey?.asymmetricKeyType !== 'ed25519' ||
      typeof testKeyId !== 'string' ||
      !/^asb-test-[a-z0-9-]+$/.test(testKeyId) ||
      testKeyId === RESERVED_KEY_ID
    ) {
      return fail('TRUSTED_APPROVAL_KEY_UNTRUSTED');
    }
  } catch {
    return fail('TRUSTED_APPROVAL_KEY_UNTRUSTED');
  }
  if (!integrity || typeof integrity.requireTrustedVerifierIntegrity !== 'function') {
    return fail('TRUSTED_VERIFIER_INTEGRITY_UNPROVEN');
  }

  return Object.freeze({
    verifyTrustedApproval(input) {
      integrity.requireTrustedVerifierIntegrity({ requiredContractVersion: '1' });
      const fields = readSyntheticInput(input);
      if (fields.algorithm !== 'Ed25519') return fail('TRUSTED_APPROVAL_KEY_UNTRUSTED');
      if (!Buffer.isBuffer(fields.signatureBytes) || fields.signatureBytes.length !== 64) {
        return fail('TRUSTED_APPROVAL_SIGNATURE_INVALID');
      }
      const record = assertExactRecordBytes(fields.recordBytes);
      try {
        if (!crypto.verify(null, record.recordBytes, publicKey, fields.signatureBytes)) {
          return fail('TRUSTED_APPROVAL_SIGNATURE_INVALID');
        }
      } catch {
        return fail('TRUSTED_APPROVAL_SIGNATURE_INVALID');
      }
      try {
        assertExpected(fields.expected, record);
      } catch (error) {
        return rethrowFixedApprovalError(error, 'TRUSTED_APPROVAL_RECORD_INVALID');
      }
      return createCapability();
    },
  });
}

module.exports = {
  verifyTrustedApproval,
  __TEST_ONLY_createTrustedApprovalVerifier,
};

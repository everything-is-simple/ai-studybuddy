import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';

const require = createRequire(import.meta.url);
const { __TEST_ONLY_createTrustedApprovalVerifier } = require('../../../../scripts/lib/AIStudyBuddy.TrustedApproval.cjs');
const { __TEST_ONLY_createVerifierIntegrity } = require('../../../../scripts/lib/AIStudyBuddy.VerifierIntegrity.cjs');
const { __TEST_ONLY_createTrustedApprovalAnchor, __TEST_ONLY_describeTrustedApprovalAnchor } = require('../../../../scripts/lib/AIStudyBuddy.TrustAnchor.cjs');
const { __TEST_ONLY_createNoFollowReader } = require('../../../../scripts/lib/AIStudyBuddy.NoFollow.cjs');

const DEFAULT_TEST_KEY_ID = 'asb-test-fixture-key';

export function createSentinel() {
  return randomBytes(18).toString('hex');
}

export function createRecord(overrides = {}) {
  const values = {
    format: 'ASB-TA1',
    keyId: DEFAULT_TEST_KEY_ID,
    policyId: 'phase3.t02.approval',
    purpose: 'T02-R1',
    fullCommit: '0123456789abcdef0123456789abcdef01234567',
    contractVersion: '1',
    notBeforeEpochMs: '1000',
    notAfterEpochMs: '900000',
    approvalId: 'approval_token_1234',
    scopeBinding: `sha256:${'a'.repeat(64)}`,
    artifactContentIdentity: `sha256:${'b'.repeat(64)}`,
    ...overrides,
  };
  const names = [
    'format', 'keyId', 'policyId', 'purpose', 'fullCommit', 'contractVersion', 'notBeforeEpochMs', 'notAfterEpochMs', 'approvalId', 'scopeBinding', 'artifactContentIdentity',
  ];
  return Buffer.from(`${names.map((name) => `${name}=${values[name]}`).join('\n')}\n`, 'ascii');
}

export function createTrustAnchorFixture(overrides = {}) {
  const generated = generateKeyPairSync('ed25519');
  const publicKey = overrides.publicKey ?? generated.publicKey;
  const privateKey = overrides.privateKey ?? generated.privateKey;
  let fingerprint;
  try {
    const spkiDer = publicKey.export({ format: 'der', type: 'spki' });
    fingerprint = createHash('sha256').update(spkiDer).digest('hex');
  } catch {
    fingerprint = '0'.repeat(64);
  }
  const anchor = __TEST_ONLY_createTrustedApprovalAnchor({
    publicKey,
    keyId: overrides.testKeyId ?? DEFAULT_TEST_KEY_ID,
    fingerprint: overrides.anchorFingerprint ?? fingerprint,
    metadataVersion: overrides.anchorMetadataVersion ?? 'asb-test-anchor-v1',
    releaseIdentity: overrides.releaseIdentity ?? 'asb-test-release-v1',
    contractVersion: overrides.anchorContractVersion ?? '1',
  });
  return { publicKey, privateKey, anchor, binding: __TEST_ONLY_describeTrustedApprovalAnchor(anchor) };
}

export function createApprovalFixture(overrides = {}) {
  const anchorFixture = overrides.anchorFixture ?? createTrustAnchorFixture(overrides);
  const integrity = overrides.integrity ?? __TEST_ONLY_createVerifierIntegrity({
    contractVersion: '1',
    anchorKeyId: anchorFixture.binding.keyId,
    anchorFingerprint: anchorFixture.binding.fingerprint,
    anchorMetadataVersion: anchorFixture.binding.metadataVersion,
    releaseIdentity: anchorFixture.binding.releaseIdentity,
    provider: overrides.provider,
  });
  const verifier = __TEST_ONLY_createTrustedApprovalVerifier({
    trustAnchor: overrides.trustAnchor ?? anchorFixture.anchor,
    integrity,
  });
  const recordBytes = createRecord({ keyId: anchorFixture.binding.keyId, ...(overrides.record ?? {}) });
  const signatureBytes = sign(null, recordBytes, anchorFixture.privateKey);
  const expected = {
    policyId: 'phase3.t02.approval',
    purpose: 'T02-R1',
    fullCommit: '0123456789abcdef0123456789abcdef01234567',
    contractVersion: '1',
    nowEpochMs: 1000,
    scopeBinding: `sha256:${'a'.repeat(64)}`,
    artifactContentIdentity: `sha256:${'b'.repeat(64)}`,
    ...(overrides.expected ?? {}),
  };
  return { verifier, recordBytes, signatureBytes, expected, anchorFixture, integrity };
}

export function createInvalidKeyFactoryAttempt() {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return () => createTrustAnchorFixture({ publicKey });
}

export function createShapedKeyFactoryAttempt() {
  return () => createTrustAnchorFixture({ publicKey: { type: 'public', asymmetricKeyType: 'ed25519' } });
}

export function createFingerprintMismatchAttempt() {
  return () => createTrustAnchorFixture({ anchorFingerprint: '0'.repeat(64) });
}

export function createIntegrityBindingMismatchAttempt() {
  const anchorFixture = createTrustAnchorFixture();
  const integrity = __TEST_ONLY_createVerifierIntegrity({
    contractVersion: '1',
    anchorKeyId: anchorFixture.binding.keyId,
    anchorFingerprint: '0'.repeat(64),
    anchorMetadataVersion: anchorFixture.binding.metadataVersion,
    releaseIdentity: anchorFixture.binding.releaseIdentity,
  });
  return () => __TEST_ONLY_createTrustedApprovalVerifier({ trustAnchor: anchorFixture.anchor, integrity });
}

export function createTransparentProxyApprovalFixture() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return createApprovalFixture({ publicKey: new Proxy(publicKey, {}), privateKey });
}

export function createMemoryBackend(options = {}) {
  const state = {
    metadata: {
      volumeKind: 'local-fixed',
      reparse: false,
      kind: 'file',
      objectId: 'object-1',
      parentId: 'parent-1',
      contentVersion: 'version-1',
      ...(options.metadata ?? {}),
    },
    content: Buffer.from(options.content ?? 'synthetic-content', 'utf8'),
    descriptor: Buffer.from(options.descriptor ?? 'synthetic-descriptor', 'utf8'),
    verifyCalls: 0,
    closed: [],
    openCalls: 0,
  };
  const backend = {
    open() {
      state.openCalls += 1;
      return { handle: { id: 'synthetic-handle' }, metadata: { ...state.metadata } };
    },
    verify() {
      state.verifyCalls += 1;
      if (typeof options.onVerify === 'function') options.onVerify(state);
      return { ...state.metadata };
    },
    readFile() {
      if (typeof options.onReadFile === 'function') options.onReadFile(state);
      return Buffer.from(state.content);
    },
    readDirectorySecurityDescriptor() {
      if (typeof options.onReadDescriptor === 'function') options.onReadDescriptor(state);
      return Buffer.from(state.descriptor);
    },
    close(handle) {
      state.closed.push(handle);
    },
  };
  return { state, backend };
}

export function createSyntheticReader(options = {}) {
  const { state, backend } = createMemoryBackend(options);
  return { state, reader: __TEST_ONLY_createNoFollowReader({ backend }) };
}

export function assertFixedError(error, code, sentinel) {
  assert.equal(error.code, code);
  assert.equal(error.message, code);
  assert.equal(error.stack, undefined);
  if (sentinel) assert.equal(JSON.stringify({ code: error.code, message: error.message }).includes(sentinel), false);
  return true;
}

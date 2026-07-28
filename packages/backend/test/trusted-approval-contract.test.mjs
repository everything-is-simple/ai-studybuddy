import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createApprovalFixture, createInvalidKeyFactoryAttempt, createShapedKeyFactoryAttempt, createRecord, createSentinel, assertFixedError } from './helpers/trusted-approval-fixture.mjs';

const require = createRequire(import.meta.url);
const { verifyTrustedApproval } = require('../../../scripts/lib/AIStudyBuddy.TrustedApproval.cjs');

test('production approval verifier fails closed before touching caller input', () => {
  let touched = false;
  const input = new Proxy({}, { get() { touched = true; throw new Error('sentinel'); } });
  assert.throws(() => verifyTrustedApproval(input), (error) => assertFixedError(error, 'TRUSTED_VERIFIER_INTEGRITY_UNPROVEN'));
  assert.equal(touched, false);
});

test('synthetic Ed25519 approval verifies canonical bytes and returns an opaque frozen capability', () => {
  const fixture = createApprovalFixture();
  const capability = fixture.verifier.verifyTrustedApproval({
    algorithm: 'Ed25519',
    recordBytes: fixture.recordBytes,
    signatureBytes: fixture.signatureBytes,
    expected: fixture.expected,
  });
  assert.equal(Object.isFrozen(capability), true);
  assert.equal(Object.getOwnPropertySymbols(capability).length, 1);
});

test('synthetic verifier rejects tampering and binding mismatch without echoing a sentinel', () => {
  const sentinel = createSentinel();
  const fixture = createApprovalFixture();
  const changedSignature = Buffer.from(fixture.signatureBytes);
  changedSignature[0] ^= 1;
  assert.throws(
    () => fixture.verifier.verifyTrustedApproval({ algorithm: 'Ed25519', recordBytes: fixture.recordBytes, signatureBytes: changedSignature, expected: fixture.expected }),
    (error) => assertFixedError(error, 'TRUSTED_APPROVAL_SIGNATURE_INVALID', sentinel)
  );
  assert.throws(
    () => fixture.verifier.verifyTrustedApproval({ algorithm: 'Ed25519', recordBytes: fixture.recordBytes, signatureBytes: fixture.signatureBytes, expected: { ...fixture.expected, purpose: 'T02-R2', sentinel } }),
    (error) => assertFixedError(error, 'TRUSTED_APPROVAL_PURPOSE_MISMATCH', sentinel)
  );
});

test('strict record parser rejects CRLF, duplicate-like schema and invalid signature length', () => {
  const fixture = createApprovalFixture();
  const crlf = Buffer.from(fixture.recordBytes.toString('ascii').replaceAll('\n', '\r\n'), 'ascii');
  assert.throws(
    () => fixture.verifier.verifyTrustedApproval({ algorithm: 'Ed25519', recordBytes: crlf, signatureBytes: fixture.signatureBytes, expected: fixture.expected }),
    (error) => assertFixedError(error, 'TRUSTED_APPROVAL_RECORD_INVALID')
  );
  const badRecord = createRecord({ keyId: 'asb-test-fixture-key' });
  assert.throws(
    () => fixture.verifier.verifyTrustedApproval({ algorithm: 'Ed25519', recordBytes: badRecord, signatureBytes: fixture.signatureBytes, expected: fixture.expected }),
    (error) => assertFixedError(error, 'TRUSTED_APPROVAL_KEY_UNTRUSTED')
  );
  assert.throws(
    () => fixture.verifier.verifyTrustedApproval({ algorithm: 'Ed25519', recordBytes: fixture.recordBytes, signatureBytes: Buffer.alloc(63), expected: fixture.expected }),
    (error) => assertFixedError(error, 'TRUSTED_APPROVAL_SIGNATURE_INVALID')
  );
});

test('test factory requires a real Ed25519 KeyObject and synthetic input getters remain redacted', () => {
  const sentinel = createSentinel();
  assert.throws(() => createInvalidKeyFactoryAttempt()(), (error) => assertFixedError(error, 'TRUSTED_APPROVAL_KEY_UNTRUSTED', sentinel));
  assert.throws(() => createShapedKeyFactoryAttempt()(), (error) => assertFixedError(error, 'TRUSTED_APPROVAL_KEY_UNTRUSTED', sentinel));
  const fixture = createApprovalFixture();
  const input = new Proxy({}, { get() { throw new Error(sentinel); } });
  assert.throws(() => fixture.verifier.verifyTrustedApproval(input), (error) => assertFixedError(error, 'TRUSTED_APPROVAL_RECORD_INVALID', sentinel));
});

test('synthetic verifier recreates fixed errors for expected and integrity Proxy failures', () => {
  const expectedSentinel = createSentinel();
  const expectedFixture = createApprovalFixture();
  const hostileExpected = new Proxy(expectedFixture.expected, {
    get() {
      const error = new Error(expectedSentinel);
      error.code = 'TRUSTED_APPROVAL_POLICY_MISMATCH';
      throw error;
    },
  });
  assert.throws(
    () => expectedFixture.verifier.verifyTrustedApproval({
      algorithm: 'Ed25519', recordBytes: expectedFixture.recordBytes, signatureBytes: expectedFixture.signatureBytes, expected: hostileExpected,
    }),
    (error) => assertFixedError(error, 'TRUSTED_APPROVAL_RECORD_INVALID', expectedSentinel)
  );

  const getterSentinel = createSentinel();
  const hostileIntegrity = new Proxy({}, { get() { throw new Error(getterSentinel); } });
  assert.throws(() => createApprovalFixture({ integrity: hostileIntegrity }), (error) => assertFixedError(error, 'TRUSTED_VERIFIER_INTEGRITY_UNPROVEN', getterSentinel));

  const methodSentinel = createSentinel();
  const methodFixture = createApprovalFixture({
    integrity: Object.freeze({
      requireTrustedVerifierIntegrity() {
        throw new Error(methodSentinel);
      },
    }),
  });
  assert.throws(
    () => methodFixture.verifier.verifyTrustedApproval({
      algorithm: 'Ed25519', recordBytes: methodFixture.recordBytes, signatureBytes: methodFixture.signatureBytes, expected: methodFixture.expected,
    }),
    (error) => assertFixedError(error, 'TRUSTED_VERIFIER_INTEGRITY_UNPROVEN', methodSentinel)
  );
});

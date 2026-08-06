import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createApprovalFixture, assertFixedError } from './helpers/trusted-approval-fixture.mjs';

const require = createRequire(import.meta.url);
const { verifyTrustedApproval } = require('../../../scripts/lib/AIStudyBuddy.TrustedApproval.cjs');

test('production integrity gate ignores forged symbols, frozen objects and throwing getters', () => {
  let getterCalls = 0;
  const input = Object.freeze({
    get recordBytes() {
      getterCalls += 1;
      throw new Error('not allowed');
    },
    [Symbol('integrity')]: true,
  });
  assert.throws(
    () => verifyTrustedApproval(input),
    (error) => assertFixedError(error, 'TRUSTED_VERIFIER_INTEGRITY_UNPROVEN')
  );
  assert.equal(getterCalls, 0);
});

test('test integrity contract mismatch fails without provider detail leakage', () => {
  const fixture = createApprovalFixture({ provider: () => ({ raw: 'do-not-echo' }) });
  assert.throws(
    () =>
      fixture.verifier.verifyTrustedApproval({
        algorithm: 'Ed25519',
        recordBytes: fixture.recordBytes,
        signatureBytes: fixture.signatureBytes,
        expected: { ...fixture.expected, contractVersion: '2' },
      }),
    (error) => assertFixedError(error, 'TRUSTED_APPROVAL_CONTRACT_MISMATCH')
  );
});

test('test integrity provider failure remains fail closed without provider detail leakage', () => {
  let failProvider = false;
  const fixture = createApprovalFixture({
    provider: () => {
      if (failProvider) throw new Error('provider secret');
    },
  });
  failProvider = true;
  assert.throws(
    () =>
      fixture.verifier.verifyTrustedApproval({
        algorithm: 'Ed25519',
        recordBytes: fixture.recordBytes,
        signatureBytes: fixture.signatureBytes,
        expected: fixture.expected,
      }),
    (error) => assertFixedError(error, 'TRUSTED_VERIFIER_INTEGRITY_UNPROVEN', 'provider secret')
  );
});

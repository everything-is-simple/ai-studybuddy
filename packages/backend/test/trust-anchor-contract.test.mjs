
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createApprovalFixture, createSentinel, assertFixedError } from './helpers/trusted-approval-fixture.mjs';

const require = createRequire(import.meta.url);
const { requireTrustedApprovalAnchor } = require('../../../scripts/lib/AIStudyBuddy.TrustAnchor.cjs');

test('production trust-anchor boundary is fixed fail-closed before touching caller input', () => {
  let touched = false;
  const input = new Proxy({}, {
    get() {
      touched = true;
      throw new Error('must not read production input');
    },
  });
  assert.throws(() => requireTrustedApprovalAnchor(input), (error) => assertFixedError(error, 'TRUSTED_ANCHOR_UNAVAILABLE'));
  assert.equal(touched, false);
});

test('synthetic anchor and integrity assertion are not serializable verifier output', () => {
  const sentinel = createSentinel();
  const fixture = createApprovalFixture();
  const capability = fixture.verifier.verifyTrustedApproval({
    algorithm: 'Ed25519',
    recordBytes: fixture.recordBytes,
    signatureBytes: fixture.signatureBytes,
    expected: fixture.expected,
  });
  assert.equal(Object.isFrozen(capability), true);
  assert.equal(JSON.stringify(capability).includes(sentinel), false);
  assert.equal(Object.keys(capability).length, 0);
});

'use strict';

const crypto = require('node:crypto');

const TEST_ANCHORS = new WeakMap();

function fail(code) {
  const error = new Error(code);
  error.code = code;
  error.stack = undefined;
  throw error;
}

function requireTrustedApprovalAnchor(_input) {
  return fail('TRUSTED_ANCHOR_UNAVAILABLE');
}

function isTestIdentifier(value, prefix) {
  return typeof value === 'string' && new RegExp(`^${prefix}[a-z0-9-]{1,64}$`).test(value);
}

function __TEST_ONLY_createTrustedApprovalAnchor(options) {
  let publicKey;
  let keyId;
  let fingerprint;
  let metadataVersion;
  let releaseIdentity;
  let contractVersion;
  try {
    if (!options || typeof options !== 'object' || Array.isArray(options)) return fail('TRUSTED_ANCHOR_INVALID');
    publicKey = options.publicKey;
    keyId = options.keyId;
    fingerprint = options.fingerprint;
    metadataVersion = options.metadataVersion;
    releaseIdentity = options.releaseIdentity;
    contractVersion = options.contractVersion;
  } catch {
    return fail('TRUSTED_ANCHOR_INVALID');
  }

  try {
    if (
      !(publicKey instanceof crypto.KeyObject) ||
      publicKey.type !== 'public' ||
      publicKey.asymmetricKeyType !== 'ed25519' ||
      !isTestIdentifier(keyId, 'asb-test-') ||
      !isTestIdentifier(metadataVersion, 'asb-test-anchor-') ||
      !isTestIdentifier(releaseIdentity, 'asb-test-release-') ||
      contractVersion !== '1' ||
      typeof fingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/.test(fingerprint)
    ) {
      return fail('TRUSTED_ANCHOR_INVALID');
    }
  } catch {
    return fail('TRUSTED_ANCHOR_INVALID');
  }

  let verificationKey;
  let actualFingerprint;
  try {
    const spkiDer = publicKey.export({ format: 'der', type: 'spki' });
    verificationKey = crypto.createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });
    actualFingerprint = crypto.createHash('sha256').update(spkiDer).digest('hex');
    if (
      !(verificationKey instanceof crypto.KeyObject) ||
      verificationKey.type !== 'public' ||
      verificationKey.asymmetricKeyType !== 'ed25519' ||
      !crypto.timingSafeEqual(Buffer.from(fingerprint, 'ascii'), Buffer.from(actualFingerprint, 'ascii'))
    ) {
      return fail('TRUSTED_ANCHOR_INVALID');
    }
  } catch {
    return fail('TRUSTED_ANCHOR_INVALID');
  }

  const anchor = Object.freeze(Object.create(null));
  TEST_ANCHORS.set(
    anchor,
    Object.freeze({
      verificationKey,
      keyId,
      fingerprint: actualFingerprint,
      metadataVersion,
      releaseIdentity,
      contractVersion,
    })
  );
  return anchor;
}

function __TEST_ONLY_describeTrustedApprovalAnchor(anchor) {
  const state = TEST_ANCHORS.get(anchor);
  if (!state) return fail('TRUSTED_RELEASE_EVIDENCE_UNPROVEN');
  return Object.freeze({
    keyId: state.keyId,
    fingerprint: state.fingerprint,
    metadataVersion: state.metadataVersion,
    releaseIdentity: state.releaseIdentity,
    contractVersion: state.contractVersion,
  });
}

function __TEST_ONLY_acquireTrustedApprovalAnchor(anchor, input) {
  const state = TEST_ANCHORS.get(anchor);
  if (!state) return fail('TRUSTED_RELEASE_EVIDENCE_UNPROVEN');

  let requiredContractVersion;
  let requiredKeyId;
  let requiredFingerprint;
  let requiredMetadataVersion;
  let requiredReleaseIdentity;
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('TRUSTED_RELEASE_EVIDENCE_UNPROVEN');
    requiredContractVersion = input.requiredContractVersion;
    requiredKeyId = input.requiredKeyId;
    requiredFingerprint = input.requiredFingerprint;
    requiredMetadataVersion = input.requiredMetadataVersion;
    requiredReleaseIdentity = input.requiredReleaseIdentity;
  } catch {
    return fail('TRUSTED_RELEASE_EVIDENCE_UNPROVEN');
  }

  if (requiredContractVersion !== state.contractVersion) return fail('TRUSTED_VERIFIER_CONTRACT_MISMATCH');
  if (
    requiredKeyId !== state.keyId ||
    requiredFingerprint !== state.fingerprint ||
    requiredMetadataVersion !== state.metadataVersion ||
    requiredReleaseIdentity !== state.releaseIdentity
  ) {
    return fail('TRUSTED_ANCHOR_BINDING_MISMATCH');
  }

  return Object.freeze({
    keyId: state.keyId,
    fingerprint: state.fingerprint,
    metadataVersion: state.metadataVersion,
    releaseIdentity: state.releaseIdentity,
    verify(recordBytes, signatureBytes) {
      try {
        return crypto.verify(null, recordBytes, state.verificationKey, signatureBytes);
      } catch {
        return false;
      }
    },
  });
}

module.exports = {
  requireTrustedApprovalAnchor,
  __TEST_ONLY_createTrustedApprovalAnchor,
  __TEST_ONLY_describeTrustedApprovalAnchor,
  __TEST_ONLY_acquireTrustedApprovalAnchor,
};

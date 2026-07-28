'use strict';

const TEST_ASSERTIONS = new WeakMap();

function fail(code) {
  const error = new Error(code);
  error.code = code;
  error.stack = undefined;
  throw error;
}

function requireTrustedVerifierIntegrity(_input) {
  return fail('TRUSTED_VERIFIER_INTEGRITY_UNPROVEN');
}

function isTestIdentifier(value, prefix) {
  return typeof value === 'string' && new RegExp(`^${prefix}[a-z0-9-]{1,64}$`).test(value);
}

function __TEST_ONLY_createVerifierIntegrity(options) {
  let contractVersion;
  let anchorKeyId;
  let anchorFingerprint;
  let anchorMetadataVersion;
  let releaseIdentity;
  let provider;
  try {
    if (!options || typeof options !== 'object' || Array.isArray(options)) return fail('TRUSTED_VERIFIER_INTEGRITY_UNPROVEN');
    contractVersion = options.contractVersion;
    anchorKeyId = options.anchorKeyId;
    anchorFingerprint = options.anchorFingerprint;
    anchorMetadataVersion = options.anchorMetadataVersion;
    releaseIdentity = options.releaseIdentity;
    provider = options.provider;
  } catch {
    return fail('TRUSTED_VERIFIER_INTEGRITY_UNPROVEN');
  }

  if (
    contractVersion !== '1' ||
    !isTestIdentifier(anchorKeyId, 'asb-test-') ||
    !/^[a-f0-9]{64}$/.test(anchorFingerprint) ||
    !isTestIdentifier(anchorMetadataVersion, 'asb-test-anchor-') ||
    !isTestIdentifier(releaseIdentity, 'asb-test-release-') ||
    (provider !== undefined && typeof provider !== 'function')
  ) {
    return fail('TRUSTED_VERIFIER_INTEGRITY_UNPROVEN');
  }

  const assertion = Object.freeze(Object.create(null));
  TEST_ASSERTIONS.set(assertion, Object.freeze({
    contractVersion,
    anchorKeyId,
    anchorFingerprint,
    anchorMetadataVersion,
    releaseIdentity,
    provider,
  }));
  return assertion;
}

function __TEST_ONLY_requireTrustedVerifierIntegrity(assertion, input) {
  const state = TEST_ASSERTIONS.get(assertion);
  if (!state) return fail('TRUSTED_VERIFIER_INTEGRITY_UNPROVEN');

  let requiredContractVersion;
  let anchorKeyId;
  let anchorFingerprint;
  let anchorMetadataVersion;
  let releaseIdentity;
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('TRUSTED_VERIFIER_INTEGRITY_UNPROVEN');
    requiredContractVersion = input.requiredContractVersion;
    anchorKeyId = input.anchorKeyId;
    anchorFingerprint = input.anchorFingerprint;
    anchorMetadataVersion = input.anchorMetadataVersion;
    releaseIdentity = input.releaseIdentity;
  } catch {
    return fail('TRUSTED_VERIFIER_INTEGRITY_UNPROVEN');
  }

  if (requiredContractVersion !== state.contractVersion) return fail('TRUSTED_VERIFIER_CONTRACT_MISMATCH');
  if (
    anchorKeyId !== state.anchorKeyId ||
    anchorFingerprint !== state.anchorFingerprint ||
    anchorMetadataVersion !== state.anchorMetadataVersion ||
    releaseIdentity !== state.releaseIdentity
  ) {
    return fail('TRUSTED_ANCHOR_BINDING_MISMATCH');
  }
  if (typeof state.provider === 'function') {
    try {
      state.provider();
    } catch {
      return fail('TRUSTED_VERIFIER_INTEGRITY_UNPROVEN');
    }
  }
  return Object.freeze(Object.create(null));
}

module.exports = {
  requireTrustedVerifierIntegrity,
  __TEST_ONLY_createVerifierIntegrity,
  __TEST_ONLY_requireTrustedVerifierIntegrity,
};

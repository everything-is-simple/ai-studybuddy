'use strict';

function fail(code) {
  const error = new Error(code);
  error.code = code;
  error.stack = undefined;
  throw error;
}

function requireTrustedVerifierIntegrity(_input) {
  return fail('TRUSTED_VERIFIER_INTEGRITY_UNPROVEN');
}

function __TEST_ONLY_createVerifierIntegrity(options) {
  const contractVersion = options?.contractVersion;
  const provider = options?.provider;

  return Object.freeze({
    requireTrustedVerifierIntegrity(input) {
      const requiredContractVersion = input?.requiredContractVersion;
      if (typeof provider === 'function') {
        try {
          provider();
        } catch {
          return fail('TRUSTED_VERIFIER_INTEGRITY_UNPROVEN');
        }
      }
      if (contractVersion !== requiredContractVersion) {
        return fail('TRUSTED_VERIFIER_CONTRACT_MISMATCH');
      }
      return Object.freeze(Object.create(null));
    },
  });
}

module.exports = {
  requireTrustedVerifierIntegrity,
  __TEST_ONLY_createVerifierIntegrity,
};

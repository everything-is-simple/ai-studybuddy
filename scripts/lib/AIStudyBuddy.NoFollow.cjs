'use strict';

const REMOTE_VOLUME_KINDS = new Set([
  'remote',
  'unc',
  'mapped-remote',
  'subst',
  'mup',
  'lanmanredirector',
  'webdavredirector',
  'rdbss',
]);
const UNPROVEN_VOLUME_KINDS = new Set(['removable', 'cdrom', 'ram', 'unknown', 'mount-point']);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  error.stack = undefined;
  throw error;
}

function unsupported(_input) {
  return fail('NOFOLLOW_HANDLE_UNSUPPORTED');
}

function createNoFollowReader() {
  return Object.freeze({
    openVerifiedPath(input) {
      return unsupported(input);
    },
    readVerifiedFile(input) {
      return unsupported(input);
    },
    readVerifiedDirectorySecurityDescriptor(input) {
      return unsupported(input);
    },
    closeVerifiedHandle(input) {
      return unsupported(input);
    },
  });
}

function assertMetadata(metadata, expectedKind) {
  if (!metadata || typeof metadata !== 'object') return fail('NOFOLLOW_LOCAL_VOLUME_UNPROVEN');
  const volumeKind = metadata.volumeKind;
  if (REMOTE_VOLUME_KINDS.has(volumeKind)) return fail('NOFOLLOW_REMOTE_OR_UNPROVEN_VOLUME');
  if (UNPROVEN_VOLUME_KINDS.has(volumeKind) || volumeKind !== 'local-fixed')
    return fail('NOFOLLOW_LOCAL_VOLUME_UNPROVEN');
  if (metadata.reparse === true) return fail('NOFOLLOW_REPARSE_RISK');
  if (
    metadata.kind !== expectedKind ||
    typeof metadata.objectId !== 'string' ||
    typeof metadata.parentId !== 'string' ||
    typeof metadata.contentVersion !== 'string'
  ) {
    return fail('NOFOLLOW_OBJECT_KIND_MISMATCH');
  }
  return metadata;
}

function sameIdentity(before, after) {
  return (
    before.objectId === after.objectId &&
    before.parentId === after.parentId &&
    before.contentVersion === after.contentVersion
  );
}

function closeQuietly(backend, handle) {
  try {
    backend.close(handle);
  } catch {
    // The fixed failure code below must not expose backend failures.
  }
}

function __TEST_ONLY_createNoFollowReader(options) {
  const backend = options?.backend;
  if (
    !backend ||
    typeof backend.open !== 'function' ||
    typeof backend.verify !== 'function' ||
    typeof backend.close !== 'function'
  ) {
    return fail('NOFOLLOW_HANDLE_UNSUPPORTED');
  }

  function openVerifiedPath(input) {
    if (!input || typeof input !== 'object') return fail('NOFOLLOW_LOCAL_VOLUME_UNPROVEN');
    let opened;
    try {
      opened = backend.open(input.locator);
      const metadata = assertMetadata(opened?.metadata, input.expectedKind ?? 'file');
      return Object.freeze({ handle: opened.handle, metadata: Object.freeze({ ...metadata }) });
    } catch (error) {
      if (opened?.handle) closeQuietly(backend, opened.handle);
      if (error?.code) throw error;
      return fail('NOFOLLOW_READ_FAILED');
    }
  }

  function readComplete(input, expectedKind, readMethod) {
    if (
      !input ||
      typeof input !== 'object' ||
      !input.opened ||
      !Number.isSafeInteger(input.maxBytes) ||
      input.maxBytes < 0
    ) {
      return fail('NOFOLLOW_READ_FAILED');
    }
    const handle = input.opened.handle;
    let privateBuffer = null;
    try {
      const before = assertMetadata(backend.verify(handle), expectedKind);
      const value = readMethod(handle);
      if (!Buffer.isBuffer(value)) return fail('NOFOLLOW_READ_FAILED');
      privateBuffer = Buffer.from(value);
      if (privateBuffer.length > input.maxBytes) return fail('NOFOLLOW_READ_LIMIT_EXCEEDED');
      const after = assertMetadata(backend.verify(handle), expectedKind);
      if (!sameIdentity(before, after)) return fail('NOFOLLOW_HANDLE_IDENTITY_CHANGED');
      const result = Buffer.from(privateBuffer);
      privateBuffer.fill(0);
      privateBuffer = null;
      closeQuietly(backend, handle);
      return result;
    } catch (error) {
      if (privateBuffer) privateBuffer.fill(0);
      closeQuietly(backend, handle);
      if (error?.code) throw error;
      return fail('NOFOLLOW_READ_FAILED');
    }
  }

  return Object.freeze({
    openVerifiedPath,
    readVerifiedFile(input) {
      return readComplete(input, 'file', (handle) => backend.readFile(handle));
    },
    readVerifiedDirectorySecurityDescriptor(input) {
      return readComplete(input, 'directory', (handle) => backend.readDirectorySecurityDescriptor(handle));
    },
    closeVerifiedHandle(input) {
      if (!input || typeof input !== 'object') return fail('NOFOLLOW_READ_FAILED');
      try {
        backend.close(input.handle);
        return undefined;
      } catch {
        return fail('NOFOLLOW_READ_FAILED');
      }
    },
  });
}

module.exports = {
  createNoFollowReader,
  __TEST_ONLY_createNoFollowReader,
};

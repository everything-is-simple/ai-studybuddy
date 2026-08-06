import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createSyntheticReader, createSentinel, assertFixedError } from './helpers/trusted-approval-fixture.mjs';

const require = createRequire(import.meta.url);
const { createNoFollowReader } = require('../../../scripts/lib/AIStudyBuddy.NoFollow.cjs');

test('production no-follow reader rejects before touching Proxy input', () => {
  const reader = createNoFollowReader();
  let touched = false;
  const input = new Proxy(
    {},
    {
      get() {
        touched = true;
        throw new Error('not allowed');
      },
    }
  );
  for (const method of [
    'openVerifiedPath',
    'readVerifiedFile',
    'readVerifiedDirectorySecurityDescriptor',
    'closeVerifiedHandle',
  ]) {
    assert.throws(
      () => reader[method](input),
      (error) => assertFixedError(error, 'NOFOLLOW_HANDLE_UNSUPPORTED')
    );
  }
  assert.equal(touched, false);
});

test('synthetic reader accepts local fixed objects and returns an independent complete buffer', () => {
  const { reader, state } = createSyntheticReader({ content: 'synthetic-content' });
  const opened = reader.openVerifiedPath({ locator: 'synthetic', expectedKind: 'file' });
  const bytes = reader.readVerifiedFile({ opened, maxBytes: 1024 });
  assert.equal(bytes.toString('utf8'), 'synthetic-content');
  bytes[0] = 0;
  assert.equal(state.content.toString('utf8'), 'synthetic-content');
  assert.equal(state.closed.length, 1);
});

test('synthetic reader rejects remote/reparse and replacement races with zero delivery', () => {
  const sentinel = createSentinel();
  const remoteKinds = [
    'remote',
    'unc',
    'mapped-remote',
    'subst',
    'mup',
    'lanmanredirector',
    'webdavredirector',
    'rdbss',
  ];
  const unprovenKinds = ['removable', 'cdrom', 'ram', 'unknown', 'mount-point'];
  for (const volumeKind of remoteKinds) {
    const { reader } = createSyntheticReader({ metadata: { volumeKind } });
    assert.throws(
      () => reader.openVerifiedPath({ locator: sentinel, expectedKind: 'file' }),
      (error) => assertFixedError(error, 'NOFOLLOW_REMOTE_OR_UNPROVEN_VOLUME', sentinel)
    );
  }
  for (const volumeKind of unprovenKinds) {
    const { reader } = createSyntheticReader({ metadata: { volumeKind } });
    assert.throws(
      () => reader.openVerifiedPath({ locator: sentinel, expectedKind: 'file' }),
      (error) => assertFixedError(error, 'NOFOLLOW_LOCAL_VOLUME_UNPROVEN', sentinel)
    );
  }
  const reparse = createSyntheticReader({ metadata: { reparse: true } });
  assert.throws(
    () => reparse.reader.openVerifiedPath({ locator: sentinel, expectedKind: 'file' }),
    (error) => assertFixedError(error, 'NOFOLLOW_REPARSE_RISK', sentinel)
  );

  for (const field of ['objectId', 'parentId', 'contentVersion']) {
    const { reader, state } = createSyntheticReader({
      onVerify(current) {
        if (current.verifyCalls === 2) current.metadata[field] = `${field}-changed`;
      },
    });
    const opened = reader.openVerifiedPath({ locator: 'synthetic', expectedKind: 'file' });
    assert.throws(
      () => reader.readVerifiedFile({ opened, maxBytes: 1024 }),
      (error) => assertFixedError(error, 'NOFOLLOW_HANDLE_IDENTITY_CHANGED')
    );
    assert.equal(state.closed.length, 1);
  }
});

test('synthetic reader rejects read limits and supports directory descriptor contract only', () => {
  const file = createSyntheticReader({ content: 'too-long' });
  const opened = file.reader.openVerifiedPath({ locator: 'synthetic', expectedKind: 'file' });
  assert.throws(
    () => file.reader.readVerifiedFile({ opened, maxBytes: 1 }),
    (error) => assertFixedError(error, 'NOFOLLOW_READ_LIMIT_EXCEEDED')
  );
  assert.equal(file.state.closed.length, 1);

  const directory = createSyntheticReader({ metadata: { kind: 'directory' }, descriptor: 'descriptor' });
  const openedDirectory = directory.reader.openVerifiedPath({ locator: 'synthetic', expectedKind: 'directory' });
  const descriptor = directory.reader.readVerifiedDirectorySecurityDescriptor({
    opened: openedDirectory,
    maxBytes: 1024,
  });
  assert.equal(descriptor.toString('utf8'), 'descriptor');
});

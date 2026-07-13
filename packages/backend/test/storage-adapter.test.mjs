import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

async function createAdapter(tmpDir) {
  process.env.APP_DATA_ROOT = tmpDir;
  const { StorageAdapter, StorageKeyNotFoundError, StoragePathEscapeError } =
    await import('../dist/adapters/storage.js');
  return { adapter: new StorageAdapter(), StorageKeyNotFoundError, StoragePathEscapeError };
}

test('StorageAdapter put/get/delete roundtrip', async (t) => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t03-storage-'));
  t.after(() => rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

  const { adapter } = await createAdapter(dataRoot);
  const content = Buffer.from('Hello T03 文件存储', 'utf8');

  const result = await adapter.put({
    semesterId: 'sem-01',
    courseId: 'course-01',
    originalName: 'hello.txt',
    data: content,
  });

  assert.ok(result.storageKey.startsWith('semesters/sem-01/files/course-01/'));
  assert.equal(result.size, content.length);
  assert.ok(!path.isAbsolute(result.storageKey));

  const absolutePath = adapter.resolvePath(result.storageKey);
  assert.ok(absolutePath.startsWith(dataRoot));
  assert.equal(existsSync(absolutePath), true);

  const got = await adapter.get(result.storageKey);
  const chunks = [];
  for await (const chunk of got.stream) {
    chunks.push(chunk);
  }
  assert.equal(Buffer.concat(chunks).toString('utf8'), content.toString('utf8'));
  assert.equal(got.size, content.length);

  await adapter.delete(result.storageKey);
  assert.equal(adapter.exists(result.storageKey), false);
});

test('StorageAdapter falls back to common directory when courseId is omitted', async (t) => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t03-common-'));
  t.after(() => rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

  const { adapter } = await createAdapter(dataRoot);
  const result = await adapter.put({
    semesterId: 'sem-02',
    originalName: 'note.md',
    data: Buffer.from('# note'),
  });

  assert.ok(result.storageKey.startsWith('semesters/sem-02/files/common/'));
  assert.equal(adapter.exists(result.storageKey), true);
});

test('StorageAdapter rejects path escape attempts', async (t) => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t03-escape-'));
  t.after(() => rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

  const { adapter, StoragePathEscapeError } = await createAdapter(dataRoot);

  assert.throws(() => adapter.exists('../etc/passwd'), StoragePathEscapeError);
  assert.throws(() => adapter.resolvePath('semesters/xxx/../../../../outside'), StoragePathEscapeError);
  assert.throws(() => adapter.resolvePath('C:\\Windows\\system32'), StoragePathEscapeError);
});

test('StorageAdapter throws when getting or deleting a missing key', async (t) => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t03-missing-'));
  t.after(() => rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

  const { adapter, StorageKeyNotFoundError } = await createAdapter(dataRoot);

  await assert.rejects(
    adapter.get('semesters/missing/files/common/00000000-0000-4000-8000-000000000000.txt'),
    StorageKeyNotFoundError
  );
  await assert.rejects(
    adapter.delete('semesters/missing/files/common/00000000-0000-4000-8000-000000000000.txt'),
    StorageKeyNotFoundError
  );
});

test('StorageAdapter supports Readable streams', async (t) => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t03-stream-'));
  t.after(() => rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

  const { Readable } = await import('node:stream');
  const { adapter } = await createAdapter(dataRoot);

  const readable = Readable.from(['stream ', 'content'], { objectMode: false });
  const result = await adapter.put({
    semesterId: 'sem-03',
    courseId: 'course-03',
    originalName: 'data.bin',
    data: readable,
  });

  assert.equal(adapter.exists(result.storageKey), true);
  const got = await adapter.get(result.storageKey);
  const chunks = [];
  for await (const chunk of got.stream) {
    chunks.push(chunk);
  }
  assert.equal(Buffer.concat(chunks).toString('utf8'), 'stream content');
});

test('StorageAdapter rejects keys outside the managed files layout', async (t) => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'studybuddy-t03-key-layout-'));
  t.after(() => rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

  await writeFile(path.join(dataRoot, 'sensitive.txt'), 'must stay inaccessible');
  const { adapter, StoragePathEscapeError } = await createAdapter(dataRoot);

  assert.throws(() => adapter.resolvePath('sensitive.txt'), StoragePathEscapeError);
  assert.throws(() => adapter.exists('studybuddy.db'), StoragePathEscapeError);
});

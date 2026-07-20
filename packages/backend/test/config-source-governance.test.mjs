import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(backendRoot, 'src');

async function listTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listTypeScriptFiles(entryPath));
    if (entry.isFile() && entry.name.endsWith('.ts')) files.push(entryPath);
  }
  return files;
}

test('production source reads environment variables only through config/env.ts', async () => {
  const offenders = [];
  for (const filePath of await listTypeScriptFiles(sourceRoot)) {
    const relativePath = path.relative(sourceRoot, filePath).replaceAll('\\', '/');
    if (relativePath === 'config/env.ts') continue;
    const source = await readFile(filePath, 'utf8');
    if (/\bprocess\.env\b/.test(source)) offenders.push(relativePath);
  }

  assert.deepEqual(offenders, []);
});

const fs = require("node:fs");
const path = require("node:path");

function assertStorageKey(storageKey) {
  if (!storageKey || path.isAbsolute(storageKey) || storageKey.includes("\0")) throw new Error("Invalid storage key");
  const normalized = path.posix.normalize(storageKey.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) throw new Error("Storage key escapes root");
  return normalized;
}

function resolveStorageKey(root, storageKey) {
  const safeKey = assertStorageKey(storageKey);
  const target = path.resolve(root, ...safeKey.split("/"));
  const rootPath = path.resolve(root) + path.sep;
  if (!target.startsWith(rootPath)) throw new Error("Storage key escapes root");
  return target;
}

function writeFile(root, storageKey, content) {
  const target = resolveStorageKey(root, storageKey);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) throw new Error("Storage key already exists");
  fs.writeFileSync(target, content);
  return storageKey;
}
function readFile(root, storageKey) { return fs.readFileSync(resolveStorageKey(root, storageKey)); }
function deleteFile(root, storageKey) { fs.rmSync(resolveStorageKey(root, storageKey), { force: true }); }
function cleanTmp(root) { fs.rmSync(path.join(root, "tmp"), { recursive: true, force: true }); }
module.exports = { assertStorageKey, resolveStorageKey, writeFile, readFile, deleteFile, cleanTmp };

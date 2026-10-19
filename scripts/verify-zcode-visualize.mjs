import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../third_party/zcode');
const commit = '0a1fc56d279fd1001f78387bd81aec1c26767411';
const skillTree = '87f38506cdda363267e0a73bfb2f20b4632134e1';
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
const digest = (data, algorithm = 'sha256') => createHash(algorithm).update(data).digest('hex');
const gitHash = (type, data) => digest(Buffer.concat([Buffer.from(`${type} ${data.length}\0`), data]), 'sha1');
assert.equal(manifest.commit, commit, 'Unexpected upstream revision');
assert.equal(manifest.skillGitTree, skillTree, 'Unexpected upstream skill tree');
assert.equal(manifest.skillFileCount, 24, 'Expected all 24 upstream skill files');

async function inventory(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), `Symlink is not an upstream file: ${prefix}${entry.name}`);
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) result.push(...await inventory(join(directory, entry.name), `${path}/`));
    else {
      assert(entry.isFile(), `Not a regular upstream file: ${path}`);
      result.push(path);
    }
  }
  return result.sort();
}

const paths = new Set();
for (const file of manifest.files) {
  assert(!paths.has(file.path), `Duplicate manifest path: ${file.path}`);
  paths.add(file.path);
  assert(!file.path.startsWith('/') && !file.path.split('/').includes('..'), 'Unsafe manifest path');
  const absolute = join(root, file.path);
  const info = await lstat(absolute);
  assert(info.isFile() && !info.isSymbolicLink(), `Not a regular upstream file: ${file.path}`);
  const bytes = await readFile(absolute);
  assert.equal(bytes.length, file.bytes, `Size mismatch: ${file.path}`);
  assert.equal(digest(bytes), file.sha256, `SHA-256 mismatch: ${file.path}`);
  assert.equal(gitHash('blob', bytes), file.gitBlobSha1, `Git blob mismatch: ${file.path}`);
}
for (const directory of ['skills/visualize', 'runtime', 'upstream']) {
  const actual = await inventory(join(root, directory), `${directory}/`);
  const expected = manifest.files.filter(file => file.path.startsWith(`${directory}/`)).map(file => file.path).sort();
  assert.deepEqual(actual, expected, `Missing or unexpected ${directory} files`);
}
const skill = manifest.files.filter(file => file.kind === 'skill');
assert.equal(skill.length, 24);

// Rebuild the Git tree, so replacing both a file and its manifest hashes cannot
// silently redefine the pinned 24-file skill as a different upstream source.
function treeHash(entries, prefix = '') {
  const children = new Map();
  for (const entry of entries) {
    const relative = entry.path.slice('skills/visualize/'.length + prefix.length);
    const name = relative.split('/')[0];
    if (relative.includes('/')) children.set(`${name}/`, { name, directory: true });
    else children.set(name, { name, entry });
  }
  const encoded = [...children.entries()].sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b))).map(([, item]) => {
    const nextPrefix = `${prefix}${item.name}/`;
    const hash = item.directory
      ? treeHash(entries.filter(entry => entry.path.startsWith(`skills/visualize/${nextPrefix}`)), nextPrefix)
      : item.entry.gitBlobSha1;
    const mode = item.directory ? '40000' : item.entry.gitMode;
    assert(['40000', '100644', '100755'].includes(mode), 'Unexpected Git mode');
    return Buffer.concat([Buffer.from(`${mode} ${item.name}\0`), Buffer.from(hash, 'hex')]);
  });
  return gitHash('tree', Buffer.concat(encoded));
}
assert.equal(treeHash(skill), skillTree, 'The skill differs from the fixed upstream Git tree');
const assets = join(root, 'skills/visualize/assets');
const runtime = JSON.parse(await readFile(join(assets, 'runtime-manifest.json'), 'utf8'));
for (const [name, expected] of Object.entries(runtime.files)) {
  const path = name === 'tweak.js' ? join(root, 'runtime/tweak.js') : join(assets, name);
  assert.equal(digest(await readFile(path)), expected.sha256, `Runtime manifest mismatch: ${name}`);
}
const vendor = JSON.parse(await readFile(join(assets, 'vendor/manifest.json'), 'utf8'));
for (const resource of vendor.resources) {
  assert.equal(digest(await readFile(join(assets, 'vendor', resource.file))), resource.sha256, `Vendor mismatch: ${resource.file}`);
  assert.equal(digest(await readFile(join(assets, 'vendor', resource.licenseFile))), resource.licenseSha256, `Vendor license mismatch: ${resource.licenseFile}`);
}
console.log(JSON.stringify({ commit, skillTree, skillFiles: skill.length, verifiedFiles: manifest.files.length, runtimeFiles: Object.keys(runtime.files).length, vendorLibraries: vendor.resources.length, status: 'passed' }, null, 2));

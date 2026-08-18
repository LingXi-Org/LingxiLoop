/**
 * Unit tests for the native FS tools: read_file / write_file / edit_file.
 *
 * Each tool takes (args, ns) where `ns` is an FsNamespace pointing at the
 * agent's per-turn working directory. In production that's the /workspace
 * FUSE mount; for tests we point it at a fresh per-test temp dir under
 * the OS tmpdir so there's no shared state between cases.
 *
 * The tests pin every error path the agent surfaces back to the model —
 * if any of these regress, agents get a confusing "tool failed" with the
 * wrong wording and have a harder time recovering.
 *
 * Run: node --import tsx --test server/src/__tests__/agents-fs-tools.test.ts
 */
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { FsNamespace } from '../agents/runtime/fs-namespace.js'
import { tReadFile, tWriteFile, tEditFile } from '../agents/runtime/native-tools.js'

let tmpRoot = ''
let ns: FsNamespace

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'cumora-fs-test-'))
  ns = {
    agentId: 'test-agent',
    runId: 'test-run',
    rootDir: tmpRoot,
    baseline: new Map(),
  }
})

afterEach(async () => {
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true }).catch(() => {})
})

// ── tReadFile ──────────────────────────────────────────────────────────────

test('read_file: reads an existing file relative to the namespace root', async () => {
  await writeFile(join(tmpRoot, 'hello.txt'), 'world', 'utf8')
  const r = await tReadFile({ path: 'hello.txt' }, ns)
  assert.equal(r.ok, true)
  const out = r.output as { detail: string }
  assert.equal(out.detail, 'world')
})

test('read_file: nested path resolves under rootDir', async () => {
  await mkdir(join(tmpRoot, 'a/b'), { recursive: true })
  await writeFile(join(tmpRoot, 'a/b/note.md'), '# hi', 'utf8')
  const r = await tReadFile({ path: 'a/b/note.md' }, ns)
  assert.equal(r.ok, true)
  const out = r.output as { detail: string }
  assert.equal(out.detail, '# hi')
})

test('read_file: missing file → ok:false with "no such file" wording', async () => {
  const r = await tReadFile({ path: 'nope.txt' }, ns)
  assert.equal(r.ok, false)
  assert.match(String(r.error ?? ''), /no such file/i)
})

test('read_file: oversized files get truncated with a marker', async () => {
  // We don't know MAX_READ_BYTES from the test side, so just produce
  // something far above any reasonable cap (~10MB) and assert that
  // the response carries a truncation marker.
  const huge = 'X'.repeat(10 * 1024 * 1024)
  await writeFile(join(tmpRoot, 'big.bin'), huge, 'utf8')
  const r = await tReadFile({ path: 'big.bin' }, ns)
  assert.equal(r.ok, true)
  const out = r.output as { detail: string }
  assert.ok(out.detail.length < huge.length, 'detail shrunk relative to file')
  assert.match(out.detail, /\[\.\.\.truncated at \d+ bytes; original size \d+\]/)
})

test('read_file: empty path argument is rejected', async () => {
  const r = await tReadFile({ path: '' }, ns)
  assert.equal(r.ok, false)
})

// ── tWriteFile ─────────────────────────────────────────────────────────────

test('write_file: creates the file and any missing parent dirs', async () => {
  const r = await tWriteFile({ path: 'memory/notes/2026-05-18.md', content: 'hello' }, ns)
  assert.equal(r.ok, true)
  const written = await readFile(join(tmpRoot, 'memory/notes/2026-05-18.md'), 'utf8')
  assert.equal(written, 'hello')
})

test('write_file: overwrites an existing file', async () => {
  await writeFile(join(tmpRoot, 'note.txt'), 'old', 'utf8')
  const r = await tWriteFile({ path: 'note.txt', content: 'new' }, ns)
  assert.equal(r.ok, true)
  const after = await readFile(join(tmpRoot, 'note.txt'), 'utf8')
  assert.equal(after, 'new')
})

test('write_file: empty content writes an empty file (legitimate use)', async () => {
  // E.g. `cumora memory note ""` from a misbehaving CLI invocation —
  // we still write the row but with empty content.
  const r = await tWriteFile({ path: 'empty.txt', content: '' }, ns)
  assert.equal(r.ok, true)
  const after = await readFile(join(tmpRoot, 'empty.txt'), 'utf8')
  assert.equal(after, '')
})

test('write_file: oversized content is rejected (does NOT touch disk)', async () => {
  // 100MB is well above MAX_WRITE_BYTES.
  const content = 'A'.repeat(100 * 1024 * 1024)
  const r = await tWriteFile({ path: 'oversized.txt', content }, ns)
  assert.equal(r.ok, false)
  assert.match(String(r.error ?? ''), /too large/i)
  // No file was created.
  await assert.rejects(readFile(join(tmpRoot, 'oversized.txt'), 'utf8'))
})

// ── tEditFile ──────────────────────────────────────────────────────────────

test('edit_file: replaces a unique match in an existing file', async () => {
  await writeFile(join(tmpRoot, 'doc.md'), 'hello world\nfoo bar\n', 'utf8')
  const r = await tEditFile({ path: 'doc.md', old_string: 'foo bar', new_string: 'foo BAZ' }, ns)
  assert.equal(r.ok, true)
  const after = await readFile(join(tmpRoot, 'doc.md'), 'utf8')
  assert.equal(after, 'hello world\nfoo BAZ\n')
})

test('edit_file: multi-line replacement preserves the rest of the file', async () => {
  const content = `# Title

Section A
old1
old2

Section B
`
  await writeFile(join(tmpRoot, 'doc.md'), content, 'utf8')
  const r = await tEditFile({
    path: 'doc.md',
    old_string: 'Section A\nold1\nold2',
    new_string: 'Section A\nNEW',
  }, ns)
  assert.equal(r.ok, true)
  const after = await readFile(join(tmpRoot, 'doc.md'), 'utf8')
  assert.match(after, /Section A\nNEW\n/)
  assert.match(after, /Section B/)
})

test('edit_file: missing file → "no such file"', async () => {
  const r = await tEditFile({ path: 'nope.md', old_string: 'x', new_string: 'y' }, ns)
  assert.equal(r.ok, false)
  assert.match(String(r.error ?? ''), /no such file/i)
})

test('edit_file: empty `old_string` is rejected (would otherwise insert at position 0)', async () => {
  await writeFile(join(tmpRoot, 'doc.md'), 'content', 'utf8')
  const r = await tEditFile({ path: 'doc.md', old_string: '', new_string: 'PREFIX-' }, ns)
  assert.equal(r.ok, false)
  assert.match(String(r.error ?? ''), /old_string.*cannot be empty/i)
})

test('edit_file: ambiguous match (old_string appears twice) is rejected', async () => {
  await writeFile(join(tmpRoot, 'doc.md'), 'foo bar\nfoo baz\nfoo qux\n', 'utf8')
  const r = await tEditFile({ path: 'doc.md', old_string: 'foo ', new_string: 'XX-' }, ns)
  assert.equal(r.ok, false)
  assert.match(String(r.error ?? ''), /multiple times/i)
  // File is unchanged.
  const after = await readFile(join(tmpRoot, 'doc.md'), 'utf8')
  assert.equal(after, 'foo bar\nfoo baz\nfoo qux\n')
})

test('edit_file: old_string not present → instructive error mentioning context', async () => {
  await writeFile(join(tmpRoot, 'doc.md'), 'hello world\n', 'utf8')
  const r = await tEditFile({ path: 'doc.md', old_string: 'goodbye', new_string: 'farewell' }, ns)
  assert.equal(r.ok, false)
  assert.match(String(r.error ?? ''), /not found/i)
  assert.match(String(r.error ?? ''), /context/i, 'agent should be told to add context')
})

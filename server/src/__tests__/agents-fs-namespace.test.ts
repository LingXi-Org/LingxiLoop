/**
 * Unit tests for the FUSE-layer adapter's path validators.
 *
 * `isSafePath` is the ONLY gate guarding the /runtime/fs/* endpoints:
 *   - /fs/list (LIKE prefix query on the agent's own workspace)
 *   - /fs/read (exact-match read)
 *   - /fs/write (upsert into agent_workspace)
 *   - /fs/unlink (delete by exact match)
 *   - /fs/stat (LIKE prefix query for "is this a directory?")
 *
 * Each endpoint passes the user-supplied `path` through `isSafePath`
 * before binding it into a parameterized SQL query. The SQL is
 * cross-agent-safe because the WHERE clause pins `agent_id = $1`
 * from the JWT, but the validator still has to enforce:
 *   - no path traversal (../foo escapes the workspace conceptually)
 *   - no absolute paths (which the FUSE mount would not handle)
 *   - no NUL / control bytes (rendering / log-injection hazards)
 *   - no SQL LIKE wildcards (% / _ would match unexpected prefixes
 *     in the list/stat queries)
 *   - no Windows-reserved characters (cross-platform sanity)
 *
 * `isPersistedPath` is a smaller classifier — decides which paths
 * count as "real persisted state" vs scratch. Less security-critical
 * but still worth pinning the contract.
 *
 * Run: node --import tsx --test server/src/__tests__/agents-fs-namespace.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSafePath, isPersistedPath, likeEscape } from '../agents/runtime/fs-namespace.js'

// ── isSafePath: positive cases ─────────────────────────────────────────

test('isSafePath: simple filename is safe', () => {
  assert.equal(isSafePath('notes.md'), true)
})

test('isSafePath: nested path is safe', () => {
  assert.equal(isSafePath('memory/notes/2026/may.md'), true)
})

test('isSafePath: filename with allowed punctuation (dash, dot, underscore)', () => {
  assert.equal(isSafePath('foo-bar.txt'), true)
  assert.equal(isSafePath('foo.bar.baz'), true)
  // Underscore is allowed in paths even though it's a SQL LIKE
  // wildcard — fs-endpoints escapes it via likeEscape at the SQL site.
  assert.equal(isSafePath('my_notes.md'), true)
})

test('isSafePath: filename with Unicode (CJK) is safe', () => {
  // CJK characters are above the control-char range; nothing in our
  // rule set blocks them.
  assert.equal(isSafePath('memory/笔记.md'), true)
  assert.equal(isSafePath('skills/中文/技能.md'), true)
})

test('isSafePath: filename with emoji is safe', () => {
  assert.equal(isSafePath('memory/🚀.md'), true)
})

test('isSafePath: max length (512 bytes) is safe', () => {
  const p = 'a'.repeat(512)
  assert.equal(p.length, 512)
  assert.equal(isSafePath(p), true)
})

// ── isSafePath: empty / size ───────────────────────────────────────────

test('isSafePath: empty string is NOT safe (no path = use special "" sentinel for root)', () => {
  assert.equal(isSafePath(''), false)
})

test('isSafePath: 513-byte path is rejected (just over limit)', () => {
  const p = 'a'.repeat(513)
  assert.equal(isSafePath(p), false)
})

// ── isSafePath: traversal ──────────────────────────────────────────────

test('isSafePath: bare ".." is rejected', () => {
  assert.equal(isSafePath('..'), false)
})

test('isSafePath: ".." as a path segment is rejected', () => {
  assert.equal(isSafePath('foo/../bar'), false)
  assert.equal(isSafePath('../foo'), false)
  assert.equal(isSafePath('foo/..'), false)
})

test('isSafePath: bare "." is rejected (no current-dir indirection)', () => {
  assert.equal(isSafePath('.'), false)
})

test('isSafePath: "." as a path segment is rejected', () => {
  assert.equal(isSafePath('foo/./bar'), false)
})

test('isSafePath: hidden dotfiles ARE allowed (.gitignore style)', () => {
  // Filenames that START with a dot but aren't just "." are fine —
  // they're a real Unix convention agents may legitimately use.
  assert.equal(isSafePath('.gitignore'), true)
  assert.equal(isSafePath('memory/.cache'), true)
  // ".." has its own rule that wins over this.
  assert.equal(isSafePath('..foo'), true)  // a real (weird) filename
})

// ── isSafePath: absolute paths ─────────────────────────────────────────

test('isSafePath: leading slash (Unix absolute) is rejected', () => {
  assert.equal(isSafePath('/etc/passwd'), false)
})

test('isSafePath: leading backslash (Windows absolute) is rejected', () => {
  assert.equal(isSafePath('\\Windows\\System32'), false)
})

// ── isSafePath: control / NUL bytes ────────────────────────────────────

test('isSafePath: NUL byte anywhere is rejected', () => {
  assert.equal(isSafePath('foo\0bar'), false)
})

test('isSafePath: ANSI escape (ESC) is rejected', () => {
  // Otherwise an agent could write a path that looks different in
  // terminal logs (color-code injection).
  assert.equal(isSafePath('foo\x1bbar'), false)
})

test('isSafePath: tab is rejected', () => {
  assert.equal(isSafePath('foo\tbar'), false)
})

test('isSafePath: newline is rejected', () => {
  assert.equal(isSafePath('foo\nbar'), false)
  assert.equal(isSafePath('foo\rbar'), false)
})

test('isSafePath: DEL (0x7f) is rejected', () => {
  assert.equal(isSafePath('foo\x7fbar'), false)
})

// ── isSafePath: SQL LIKE wildcards (escaped at SQL site, allowed here) ─

test('isSafePath: percent sign is ALLOWED here (SQL LIKE wildcards escaped at the query site)', () => {
  // The fs-endpoints `/list` and `/stat` queries use `ESCAPE '\\'`
  // with likeEscape() on the bind value, so `%` is safe in agent paths.
  assert.equal(isSafePath('foo%bar'), true)
})

test('isSafePath: underscore is ALLOWED here (common Unix filename style)', () => {
  assert.equal(isSafePath('foo_bar'), true)
})

// ── isSafePath: empty / multi-slash segments ──────────────────────────

test('isSafePath: trailing slash is rejected (empty trailing segment)', () => {
  assert.equal(isSafePath('foo/'), false)
})

test('isSafePath: double-slash is rejected (empty middle segment)', () => {
  assert.equal(isSafePath('foo//bar'), false)
})

// ── isSafePath: Windows-reserved chars in segments ────────────────────

test('isSafePath: Windows reserved chars in segments are rejected', () => {
  assert.equal(isSafePath('foo<bar'), false)
  assert.equal(isSafePath('foo>bar'), false)
  assert.equal(isSafePath('foo:bar'), false)
  assert.equal(isSafePath('foo"bar'), false)
  assert.equal(isSafePath('foo|bar'), false)
  assert.equal(isSafePath('foo?bar'), false)
  assert.equal(isSafePath('foo*bar'), false)
})

// ── likeEscape ────────────────────────────────────────────────────────

test('likeEscape: passes plain alphanumeric paths through unchanged', () => {
  assert.equal(likeEscape('memory/notes.md'), 'memory/notes.md')
})

test('likeEscape: escapes a literal % so LIKE matches only the literal char', () => {
  // Without escape, `foo%bar` would LIKE-match `fooanybar`.
  // After escape: `foo\%bar` matches only `foo%bar` (paired with ESCAPE '\\').
  assert.equal(likeEscape('foo%bar'), 'foo\\%bar')
})

test('likeEscape: escapes a literal _ so LIKE matches only the literal char', () => {
  assert.equal(likeEscape('foo_bar'), 'foo\\_bar')
})

test('likeEscape: escapes the escape character itself (\\)', () => {
  // Without this, an attacker-controlled path containing `\\%` would
  // produce `\%` after escape and LIKE-interpret % as a wildcard.
  assert.equal(likeEscape('foo\\bar'), 'foo\\\\bar')
})

test('likeEscape: handles all three escapeable chars together', () => {
  assert.equal(likeEscape('a%b_c\\d'), 'a\\%b\\_c\\\\d')
})

test('likeEscape: empty string is a no-op', () => {
  assert.equal(likeEscape(''), '')
})

test('likeEscape: leaves Unicode and other punctuation alone', () => {
  assert.equal(likeEscape('memory/笔记-2026.md'), 'memory/笔记-2026.md')
})

// ── isPersistedPath ───────────────────────────────────────────────────

test('isPersistedPath: SOUL.md and IDENTITY.md are persisted', () => {
  assert.equal(isPersistedPath('SOUL.md'), true)
  assert.equal(isPersistedPath('IDENTITY.md'), true)
})

test('isPersistedPath: memory/* is persisted', () => {
  assert.equal(isPersistedPath('memory/notes.md'), true)
  assert.equal(isPersistedPath('memory/2026/may.md'), true)
  assert.equal(isPersistedPath('memory/'), true)  // edge: trailing slash still counts as memory dir
})

test('isPersistedPath: skills/* is persisted', () => {
  assert.equal(isPersistedPath('skills/code-review.md'), true)
})

test('isPersistedPath: random scratch paths are NOT persisted', () => {
  assert.equal(isPersistedPath('tmp/scratch.txt'), false)
  assert.equal(isPersistedPath('build/output'), false)
})

test('isPersistedPath: similar-but-not prefixes are NOT persisted', () => {
  // Defense against "memorial" or "memory-bank" sneaking through as
  // "starts with memory" — startsWith is prefix-only, no segment boundary.
  // Actually, the current impl uses startsWith('memory/') which DOES
  // require the slash. So these should be false:
  assert.equal(isPersistedPath('memorial.md'), false)
  assert.equal(isPersistedPath('memorybank/foo'), false)
})

test('isPersistedPath: exact name vs path prefix distinction', () => {
  // SOUL.md is matched EXACTLY; SOUL.md.bak is not.
  assert.equal(isPersistedPath('SOUL.md'), true)
  assert.equal(isPersistedPath('SOUL.md.bak'), false)
  assert.equal(isPersistedPath('soul.md'), false)  // case-sensitive
})

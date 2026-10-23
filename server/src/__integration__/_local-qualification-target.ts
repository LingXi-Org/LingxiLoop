import assert from 'node:assert/strict'

/** Fail before migrations/reset when the opt-in fixture points elsewhere. */
export function assertLocalQualificationTarget(raw: string): void {
  const database = new URL(raw)
  assert.ok(database.protocol === 'postgres:' || database.protocol === 'postgresql:')
  assert.equal(database.hostname, '127.0.0.1')
  // pg-connection-string gives query host/port overrides precedence over the
  // URL authority. No query option is needed by this isolated fixture.
  assert.equal(database.search, '')
  assert.equal(database.hash, '')
  assert.match(database.pathname, /^\/runtime342_[a-z0-9_]*test$/)
}

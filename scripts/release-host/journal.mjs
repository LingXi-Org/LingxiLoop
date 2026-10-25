import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export const canonical = value => JSON.stringify(sort(value))
function sort(value) {
  if (Array.isArray(value)) return value.map(sort)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]))
  return value
}
export const hash = value => `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`
export function fault(code, message, status = 409) { return Object.assign(new Error(message), { code, status }) }
export const operationKey = request => `${request.releaseId}:${request.target}:${request.phase}`
const phases = new Set(['prepare', 'apply', 'observe', 'verify', 'recover', 'drain', 'undrain', 'backup', 'restore-verify', 'migrate', 'recovery-drain', 'recovery-undrain', 'source-drain', 'restore-source', 'source-undrain'])
export const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value) && !value.includes('..')
export function validateRequest(request) {
  if (!request || Object.keys(request).some(key => !['releaseId','target','phase','generation','manifestHash','parameters'].includes(key)) ||
    !identifier(request.releaseId) || !identifier(request.target) || !phases.has(request.phase) ||
    !Number.isSafeInteger(request.generation) || request.generation < (request.phase === 'prepare' ? 0 : 1) || !/^sha256:[a-f0-9]{64}$/.test(request.manifestHash ?? '') ||
    !request.parameters || Array.isArray(request.parameters) || typeof request.parameters !== 'object' || Object.keys(request.parameters).length) {
    throw fault('INVALID_REQUEST', 'Only the fixed operation wire and empty parameters are supported', 400)
  }
}

/** SQLite owns deduplication, fences, intents and resource reservations in one FULL transaction. */
export class Journal {
  constructor(path) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(path)
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS manifests (release_id TEXT PRIMARY KEY, hash TEXT NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS fences (resource TEXT PRIMARY KEY, generation INTEGER NOT NULL, release_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reservations (resource TEXT PRIMARY KEY, operation_key TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS operations (key TEXT PRIMARY KEY, id TEXT UNIQUE NOT NULL, request_hash TEXT NOT NULL,
        body TEXT NOT NULL, status TEXT NOT NULL, result TEXT, errors TEXT NOT NULL, steps TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS node_state (target TEXT PRIMARY KEY, body TEXT NOT NULL);`)
  }
  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE')
    try { const result = fn(); this.db.exec('COMMIT'); return result }
    catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  register(manifest, manifestHash) {
    return this.tx(() => {
      const existing = this.db.prepare('SELECT * FROM manifests WHERE release_id=?').get(manifest.releaseId)
      if (existing && existing.hash !== manifestHash) throw fault('MANIFEST_CONFLICT', 'Release manifest is immutable')
      this.db.prepare('INSERT OR IGNORE INTO manifests VALUES (?,?,?)').run(manifest.releaseId, manifestHash, canonical(manifest))
      return { releaseId: manifest.releaseId, manifestHash }
    })
  }
  manifest(id, expectedHash) {
    const row = this.db.prepare('SELECT * FROM manifests WHERE release_id=?').get(id)
    if (!row || row.hash !== expectedHash) throw fault('MANIFEST_REQUIRED', 'Register the exact immutable manifest first')
    return JSON.parse(row.body)
  }
  get(key) {
    const row = this.db.prepare('SELECT * FROM operations WHERE key=?').get(key)
    if (!row) return null
    return { key: row.key, operationKey: row.key, operationId: row.id, ...JSON.parse(row.body), status: row.status,
      result: row.result ? JSON.parse(row.result) : null, errors: JSON.parse(row.errors), steps: JSON.parse(row.steps),
      createdAt: row.created_at, updatedAt: row.updated_at }
  }
  accept(request, resources) {
    validateRequest(request)
    return this.tx(() => {
      const key = operationKey(request), requestHash = hash(request)
      const existing = this.db.prepare('SELECT * FROM operations WHERE key=?').get(key)
      if (existing && existing.request_hash !== requestHash) throw fault('OPERATION_CONFLICT', 'Operation key already has different parameters, manifest or generation')
      if (request.phase !== 'prepare') for (const resource of resources) {
        const fence = this.db.prepare('SELECT generation,release_id FROM fences WHERE resource=?').get(resource)
        if (fence && (fence.generation > request.generation || fence.generation === request.generation && fence.release_id !== request.releaseId)) throw fault('STALE_GENERATION', 'A newer execution generation owns this resource')
      }
      if (existing) return { operation: this.get(key), created: false }
      if (request.phase !== 'observe') for (const resource of resources) {
        const lock = this.db.prepare('SELECT operation_key FROM reservations WHERE resource=?').get(resource)
        if (lock) throw fault('RESOURCE_BUSY', `Resource has an unresolved operation: ${lock.operation_key}`)
      }
      const now = new Date().toISOString()
      this.db.prepare('INSERT INTO operations VALUES (?,?,?,?,?,?,?,?,?,?)').run(key, randomUUID(), requestHash, canonical(request), 'intent', null,
        canonical({ forward: null, recovery: null, cleanup: [] }), '[]', now, now)
      if (request.phase !== 'observe') for (const resource of resources) {
        if (request.phase !== 'prepare') this.db.prepare('INSERT INTO fences VALUES (?,?,?) ON CONFLICT(resource) DO UPDATE SET generation=excluded.generation,release_id=excluded.release_id').run(resource, request.generation,request.releaseId)
        this.db.prepare('INSERT INTO reservations VALUES (?,?)').run(resource, key)
      }
      return { operation: this.get(key), created: true }
    })
  }
  assertFence(key, resources) {
    const op = this.get(key)
    for (const resource of resources) {
      const fence = this.db.prepare('SELECT generation,release_id FROM fences WHERE resource=?').get(resource)
      const lock = this.db.prepare('SELECT operation_key FROM reservations WHERE resource=?').get(resource)
      if ((op.phase !== 'prepare' && fence?.generation !== op.generation) || lock?.operation_key !== key) throw fault('STALE_GENERATION', 'Resource fence or reservation lost')
    }
  }
  patch(key, changes) {
    return this.tx(() => {
      const op = this.get(key)
      for (const field of ['status','result','errors','steps']) if (Object.hasOwn(changes, field)) {
        this.db.prepare(`UPDATE operations SET ${field}=?,updated_at=? WHERE key=?`).run(field === 'status' ? changes[field] : canonical(changes[field]), new Date().toISOString(), key)
      }
      return this.get(key)
    })
  }
  finish(key, status, result, errors = this.get(key).errors) {
    return this.tx(() => {
      this.db.prepare('UPDATE operations SET status=?,result=?,errors=?,updated_at=? WHERE key=?')
        .run(status, canonical(result), canonical(errors), new Date().toISOString(), key)
      if (['succeeded','failed'].includes(status)) this.db.prepare('DELETE FROM reservations WHERE operation_key=?').run(key)
      return this.get(key)
    })
  }
  unresolved() { return this.db.prepare("SELECT key FROM operations WHERE status IN ('intent','running','uncertain') ORDER BY created_at").all().map(row => this.get(row.key)) }
  state(target) { const row = this.db.prepare('SELECT body FROM node_state WHERE target=?').get(target); return row ? JSON.parse(row.body) : {} }
  setState(target, state) { this.db.prepare('INSERT INTO node_state VALUES (?,?) ON CONFLICT(target) DO UPDATE SET body=excluded.body').run(target, canonical(state)) }
  close() { this.db.close() }
}

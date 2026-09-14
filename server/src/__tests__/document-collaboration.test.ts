import assert from 'node:assert/strict'
import { afterEach, beforeEach, mock, test } from 'node:test'
import { ContextScopedPermissionService } from '../modules/access/application.js'
import * as Y from 'yjs'
import type { Queryable } from '../db/queryable.js'
import {
  createDocumentCollaborationApplication,
} from '../modules/documents/collaboration-application.js'
import type { DocumentAwarenessEvent, DocumentUpdateEvent } from '../modules/documents/contracts.js'
import { listProjectDocumentIds } from '../modules/documents/collaboration-repository.js'

afterEach(() => mock.restoreAll())
beforeEach(() => { mock.method(ContextScopedPermissionService.prototype, 'can', async () => ({ allowed: true })) })

function emptyDocumentDb() {
  const calls: Array<{ text: string; params: readonly unknown[] }> = []
  const db: Queryable = {
    query: async (text, params = []) => {
      calls.push({ text, params })
      if (text.includes('AS authorization')) return { rows: [{ authorization: '' }], rowCount: 1 } as never
      if (/SELECT id FROM documents[\s\S]*FOR UPDATE/.test(text)) {
        return { rows: [{ id: params[0] }], rowCount: 1 } as never
      }
      if (/LEFT JOIN document_snapshots/.test(text)) {
        return { rows: [{ state_bytes: null, snapshot_at_update_id: null }], rowCount: 1 } as never
      }
      if (/INSERT INTO document_updates/.test(text)) {
        return { rows: [{ document_id: params[0] }], rowCount: 1 } as never
      }
      return { rows: [], rowCount: 1 } as never
    },
  }
  return { db, calls }
}

function documentUpdate(text: string): Uint8Array {
  const doc = new Y.Doc()
  const paragraph = new Y.XmlElement('paragraph')
  const content = new Y.XmlText()
  content.insert(0, text)
  paragraph.insert(0, [content])
  doc.getXmlFragment('default').insert(0, [paragraph])
  return Y.encodeStateAsUpdate(doc)
}

test('document collaboration persists and publishes one local Yjs update with its true origin', async () => {
  const { db, calls } = emptyDocumentDb()
  const events: Array<DocumentUpdateEvent | DocumentAwarenessEvent> = []
  let transactions = 0
  const application = createDocumentCollaborationApplication({
    instanceId: 'instance-1',
    transaction: async (work) => {
      transactions++
      return work(db)
    },
    bus: {
      publish: async (event) => { events.push(event) },
      subscribe: async () => undefined,
    },
    imageStorage: {
      normalizeKey: () => null,
      keyFromPublicUrl: () => null,
      signedUrlExpiresSoon: () => false,
      publicUrl: async () => { throw new Error('no image URL expected') },
    },
  })
  let originEchoes = 0
  let peerUpdates = 0
  await application.subscribe('document-1', 'company-1', {
    originId: 'socket-1',
    onUpdate: () => { originEchoes++ },
    onAwareness: () => undefined,
  })
  await application.subscribe('document-1', 'company-1', {
    originId: 'socket-2',
    onUpdate: () => { peerUpdates++ },
    onAwareness: () => undefined,
  })

  await application.applyLocalUpdate(
    'document-1', 'company-1', 'socket-1', 'user-1', documentUpdate('hello'),
  )

  assert.equal(originEchoes, 0)
  assert.equal(peerUpdates, 1)
  assert.equal(transactions, 3)
  assert.deepEqual(events.map((event) => ({ type: event.type, originId: event.originId })), [
    { type: 'doc.update', originId: 'socket-1' },
  ])
  assert.equal(calls.filter((call) => /INSERT INTO document_updates/.test(call.text)).length, 1)
  assert.equal(calls.filter((call) => /UPDATE documents SET updated_at=NOW\(\)/.test(call.text)).length, 1)
  const snapshotRead = calls.find((call) => /LEFT JOIN document_snapshots/.test(call.text))
  assert.deepEqual(snapshotRead?.params, ['document-1', 'company-1'])
  const updateInsert = calls.find((call) => /INSERT INTO document_updates/.test(call.text))
  assert.match(updateInsert!.text, /document\.id=\$1 AND document\.company_id=\$2/)
  assert.equal(calls.filter((call) => /SELECT id FROM documents[\s\S]*FOR UPDATE/.test(call.text)).length, 2)
})

test('a warm document room cannot be reused under another tenant', async () => {
  const { db } = emptyDocumentDb()
  const application = createDocumentCollaborationApplication({
    instanceId: 'instance-1',
    transaction: (work) => work(db),
    bus: { publish: async () => undefined, subscribe: async () => undefined },
    imageStorage: {
      normalizeKey: () => null,
      keyFromPublicUrl: () => null,
      signedUrlExpiresSoon: () => false,
      publicUrl: async () => '',
    },
  })
  const subscriber = { originId: 'socket-1', onUpdate: () => undefined, onAwareness: () => undefined }
  await application.subscribe('document-1', 'company-1', subscriber)
  await assert.rejects(
    application.subscribe('document-1', 'company-2', subscriber),
    /tenant mismatch/,
  )
})

test('remote document updates are applied only to the matching tenant room', async () => {
  const { db } = emptyDocumentDb()
  let listener: ((event: DocumentUpdateEvent | DocumentAwarenessEvent) => void) | undefined
  let received = 0
  const application = createDocumentCollaborationApplication({
    instanceId: 'instance-1',
    transaction: (work) => work(db),
    bus: {
      publish: async () => undefined,
      subscribe: async (next) => { listener = next },
    },
    imageStorage: {
      normalizeKey: () => null,
      keyFromPublicUrl: () => null,
      signedUrlExpiresSoon: () => false,
      publicUrl: async () => '',
    },
  })
  await application.subscribe('document-1', 'company-1', {
    originId: 'socket-1',
    onUpdate: () => { received++ },
    onAwareness: () => undefined,
  })
  await application.boot()
  const updateB64 = Buffer.from(documentUpdate('remote')).toString('base64')
  listener?.({
    type: 'doc.update', companyId: 'company-2', documentId: 'document-1',
    updateB64, originId: 'instance:remote', authorId: 'user-2',
  })
  assert.equal(received, 0)
  listener?.({
    type: 'doc.update', companyId: 'company-1', documentId: 'document-1',
    updateB64, originId: 'instance:remote', authorId: 'user-2',
  })
  assert.equal(received, 1)
})

test('project document lookup carries company and project tenant predicates', async () => {
  const calls: Array<{ text: string; params: readonly unknown[] }> = []
  const db: Queryable = {
    query: async (text, params = []) => {
      calls.push({ text, params })
      return { rows: [{ id: 'document-1' }], rowCount: 1 } as never
    },
  }

  assert.deepEqual(await listProjectDocumentIds(db, 'company-1', 'project-1'), ['document-1'])
  assert.match(calls[0]!.text, /company_id=\$1 AND project_id=\$2/)
  assert.deepEqual(calls[0]!.params, ['company-1', 'project-1'])
})

test('failed persistence is retained, retries include dependent deltas, and durable replay heals missed fanout', async () => {
  const stored: Uint8Array[] = []
  let failSave = true
  let snapshot: Uint8Array | null = null
  let snapshotId = 0
  let failCompaction = true
  let publishes = 0
  const db: Queryable = {
    query: async (sql, params = []) => {
      if (sql.includes('AS authorization')) return { rows: [{ authorization: '' }], rowCount: 1 } as never
      if (sql.includes('LEFT JOIN document_snapshots')) return { rows: [{ state_bytes: snapshot, snapshot_at_update_id: String(snapshotId) }] } as never
      if (sql.includes('SELECT update_log.id,')) return { rows: stored.map((bytes, index) => ({ id: String(index + 1), update_bytes: bytes })).filter((row) => BigInt(row.id) > BigInt(String(params[2]))) } as never
      if (sql.includes('INSERT INTO document_updates')) {
        if (failSave) { failSave = false; throw new Error('database offline') }
        stored.push(new Uint8Array(params[3] as Buffer))
      }
      if (sql.includes('SELECT MAX(')) return { rows: [{ max_id: String(stored.length) }] } as never
      if (sql.includes('INSERT INTO document_snapshots')) {
        if (failCompaction) { failCompaction = false; throw new Error('compaction failed') }
        snapshot = new Uint8Array(params[2] as Buffer)
        snapshotId = Number(params[3])
      }
      return { rows: [{ id: 'doc', document_id: 'doc' }], rowCount: 1 } as never
    },
  }
  const makeApp = (instanceId: string) => createDocumentCollaborationApplication({
    instanceId, transaction: (work) => work(db),
    // Cover both a rejected publish and an indefinitely waiting Redis retry.
    bus: { publish: async () => {
      if (++publishes === 1) throw new Error('Redis offline')
      await new Promise(() => {})
    }, subscribe: async () => undefined },
    imageStorage: { normalizeKey: () => null, keyFromPublicUrl: () => null, signedUrlExpiresSoon: () => false, publicUrl: async () => '' },
  })
  const writer = makeApp('writer')
  const reader = makeApp('reader')
  const peer = new Y.Doc()
  await reader.subscribe('doc', 'tenant', {
    originId: 'peer', onUpdate: (update) => Y.applyUpdate(peer, update), onAwareness: () => undefined,
  })
  const client = new Y.Doc()
  let delta: Uint8Array = new Uint8Array()
  client.on('update', (update: Uint8Array) => { delta = update })
  client.getText('text').insert(0, 'first')
  await assert.rejects(writer.applyLocalUpdate('doc', 'tenant', 'client', 'user', delta), /database offline/)
  assert.equal(stored.length, 0)
  client.getText('text').insert(5, ' second')
  await writer.applyLocalUpdate('doc', 'tenant', 'client', 'user', delta)
  assert.equal(stored.length, 2)
  await reader.recover()
  assert.equal(peer.getText('text').toString(), 'first second')
  for (let index = 0; index < 198; index++) {
    client.getText('text').insert(client.getText('text').length, '.')
    await writer.applyLocalUpdate('doc', 'tenant', 'client', 'user', delta)
  }
  await writer.recover() // injected compaction failure must not affect confirmations
  client.getText('text').insert(client.getText('text').length, '!')
  await writer.applyLocalUpdate('doc', 'tenant', 'client', 'user', delta)
  await writer.recover()
  await reader.recover() // snapshot has overtaken the reader's cursor
  assert.equal(peer.getText('text').toString(), client.getText('text').toString())
  const restarted = new Y.Doc()
  const initial = await makeApp('restart').subscribe('doc', 'tenant', {
    originId: 'restart', onUpdate: () => undefined, onAwareness: () => undefined,
  })
  Y.applyUpdate(restarted, initial.initialState)
  assert.equal(restarted.getText('text').toString(), client.getText('text').toString())
})

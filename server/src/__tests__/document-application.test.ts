import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Queryable } from '../db/queryable.js'
import {
  DocumentsApplication,
  type DocumentAgentEditor,
} from '../modules/documents/application.js'
import type {
  AgentDocumentEditOperation,
  AgentDocumentEditResult,
  DocumentChangedEvent,
} from '../modules/documents/contracts.js'

const documentRow = {
  id: 'document-1',
  company_id: 'company-1',
  title: 'Launch notes',
  created_by: 'agent-1',
  conversation_id: null,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
}

function createHarness(result: AgentDocumentEditResult) {
  const queries: string[] = []
  const edits: AgentDocumentEditOperation[][] = []
  const events: DocumentChangedEvent[] = []
  const db: Queryable = {
    query: async (text) => {
      queries.push(text)
      if (/FROM documents/.test(text)) return { rows: [documentRow], rowCount: 1 } as never
      return { rows: [], rowCount: 0 } as never
    },
  }
  const editor: DocumentAgentEditor = {
    readText: async () => '',
    applyEdit: async (_documentId, _companyId, _agentId, operations) => {
      edits.push(operations)
      return result
    },
  }
  const application = new DocumentsApplication(db, {
    publish: async (event) => { events.push(event) },
  }, editor)
  return { application, edits, events, queries }
}

test('agent document create replay repairs an empty initial body without inserting a duplicate row', async () => {
  const harness = createHarness({
    replaced: 0, imagePlaced: null, imagesDeleted: 0, blocksReplaced: 0,
  })
  const result = await harness.application.createForAgent({
    companyId: 'company-1', projectId: 'project-1', userId: 'agent-1',
  }, {
    id: 'document-1', title: 'Launch notes', body: 'Initial body',
  })

  assert.equal(result.replayed, true)
  assert.deepEqual(harness.edits, [[{ kind: 'append', text: 'Initial body' }]])
  assert.equal(harness.queries.some((query) => /INSERT INTO documents/.test(query)), false)
  assert.deepEqual(harness.events.map((event) => event.kind), ['document.updated'])
})

test('agent document edit publishes only when the collaboration mutation changed state', async () => {
  const missed = createHarness({
    replaced: 0, imagePlaced: 'anchor-missed', imagesDeleted: 0, blocksReplaced: 0,
  })
  await missed.application.editForAgent({
    companyId: 'company-1', projectId: 'project-1', userId: 'agent-1',
  }, 'document-1', [{
    kind: 'image', src: 'https://assets.example/image.png', alt: null,
    placement: { mode: 'replace', anchorText: 'missing' },
  }])
  assert.deepEqual(missed.events, [])

  const changed = createHarness({
    replaced: 1, imagePlaced: null, imagesDeleted: 0, blocksReplaced: 0,
  })
  await changed.application.editForAgent({
    companyId: 'company-1', projectId: 'project-1', userId: 'agent-1',
  }, 'document-1', [{ kind: 'replace', find: 'old', replace: 'new' }])
  assert.deepEqual(changed.events.map((event) => event.kind), ['document.updated'])
})

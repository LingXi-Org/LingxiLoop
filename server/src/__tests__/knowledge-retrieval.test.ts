import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

test('retrieval numbers distinct chunks of one PDF and preserves Markdown after hybrid deduplication', async () => {
  const access = await import('../modules/access/public.js')
  const assertCan = mock.fn(async () => {})
  mock.module('../modules/access/public.js', { namedExports: { ...access, createPermissionService: () => ({ assertCan }) } })
  const { pool } = await import('../db/pool.js')
  const { openNotebookClient } = await import('../modules/knowledge/provider.js')
  const { retrieveKnowledge } = await import('../modules/knowledge/runtime.js')
  const previous = process.env.OPEN_NOTEBOOK_ENABLED
  process.env.OPEN_NOTEBOOK_ENABLED = 'true'
  const query = async (sql: string) => {
    if (sql.includes('FROM conversations')) return { rows: [{ project_id: 'project' }] }
    if (sql.includes('FROM knowledge_sources')) return { rows: [{ id: 'pdf', title: 'Understanding Attention',
      status: 'ready', external_source_id: 'external-pdf', original_url: null, excluded: false }] }
    if (sql.includes('FROM knowledge_notebook_bindings')) return { rows: [{ external_notebook_id: 'notebook', state: 'ready' }] }
    if (sql.includes('pg_advisory_')) return { rows: [] }
    throw new Error(`unexpected query: ${sql}`)
  }
  mock.method(pool, 'query', query)
  mock.method(pool, 'connect', async () => ({ query, release() {} }))
  const excerpts = ['**Attention** uses `Q`.', '```text\nK and V\n```', '> Third chunk']
  mock.method(openNotebookClient, 'search', async () => excerpts.map((content, index) => ({
    parent_id: 'external-pdf', id: `chunk-${index}`, content,
  })))
  try {
    const result = await retrieveKnowledge({ companyId: 'company', conversationId: 'room', authorizationUserId: 'human', query: 'attention' })
    assert.deepEqual(result, excerpts.map((excerpt, position) => ({ sourceId: 'pdf', sourceTitle: 'Understanding Attention',
      chunkId: `chunk-${position}`, excerpt, position, marker: `S${position + 1}` })))
    assert.equal(assertCan.mock.callCount(), 1)
  } finally {
    if (previous === undefined) delete process.env.OPEN_NOTEBOOK_ENABLED
    else process.env.OPEN_NOTEBOOK_ENABLED = previous
    mock.restoreAll()
  }
})

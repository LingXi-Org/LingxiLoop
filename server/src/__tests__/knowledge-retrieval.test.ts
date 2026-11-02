import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

test('retrieval numbers distinct chunks of one PDF and preserves Markdown after hybrid deduplication', async () => {
  const access = await import('../modules/access/public.js')
  const assertCan = mock.fn(async () => {})
  mock.module('../modules/access/public.js', { namedExports: { ...access, createPermissionService: () => ({ assertCan, can: async () => ({ allowed:false }) }) } })
  const { pool } = await import('../db/pool.js')
  const { openNotebookClient, OpenNotebookError } = await import('../modules/knowledge/provider.js')
  const { retrieveKnowledge, retrieveKnowledgeState } = await import('../modules/knowledge/runtime.js')
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
    assert.equal(assertCan.mock.callCount(), 2)
    mock.method(openNotebookClient, 'search', async (input: Parameters<typeof openNotebookClient.search>[0]) => {
      if (input.type === 'vector') throw new OpenNotebookError('Embedding provider returned HTTP 404: private upstream detail', 502)
      return [{ parent_id: 'external-pdf', id: 'chunk-0', content: excerpts[0] },
        { parent_id: 'external-private', id: 'private', content: 'PRIVATE' }]
    })
    const partial = await retrieveKnowledgeState({ companyId: 'company', conversationId: 'room', authorizationUserId: 'human', query: 'attention' })
    assert.equal(partial.status, 'degraded')
    assert.equal(partial.citations.length, 1)
    assert.equal(partial.citations[0].excerpt, excerpts[0])
    assert.deepEqual(partial.searchFailures, [{ type: 'vector', code: 'embedding_endpoint', status: 502 }])
    assert.doesNotMatch(JSON.stringify(partial), /private upstream|PRIVATE/)
    mock.method(openNotebookClient, 'search', async () => { throw new OpenNotebookError('secret provider detail', 503) })
    const unavailable = await retrieveKnowledgeState({ companyId: 'company', conversationId: 'room', authorizationUserId: 'human', query: 'attention' })
    assert.equal(unavailable.status, 'unavailable')
    assert.deepEqual(unavailable.citations, [])
    assert.equal(unavailable.searchFailures?.length, 2)
    mock.method(openNotebookClient, 'search', async () => { throw new Error('authorization boundary failed') })
    await assert.rejects(retrieveKnowledgeState({ companyId: 'company', conversationId: 'room', authorizationUserId: 'human', query: 'attention' }), /authorization boundary/)
    const controller = new AbortController()
    mock.method(openNotebookClient, 'search', async () => { controller.abort(); throw new OpenNotebookError('cancelled') })
    await assert.rejects(retrieveKnowledgeState({ companyId: 'company', conversationId: 'room', authorizationUserId: 'human', query: 'attention', signal: controller.signal }), { name: 'AbortError' })
  } finally {
    if (previous === undefined) delete process.env.OPEN_NOTEBOOK_ENABLED
    else process.env.OPEN_NOTEBOOK_ENABLED = previous
    mock.restoreAll()
  }
})

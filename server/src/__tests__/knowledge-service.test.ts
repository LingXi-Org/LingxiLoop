import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { Queryable } from '../db/queryable.js'
import {
  isKnowledgeAttachmentMime,
  KNOWLEDGE_ATTACHMENT_MIMES,
  MAX_SOURCE_BYTES,
  openNotebookEnabled,
  validateKnowledgeUrl,
} from '../modules/knowledge/policy.js'
import { fuseKnowledgeSearchHits, OpenNotebookClient } from '../modules/knowledge/provider.js'
import {
  findKnowledgeRetrievalProject,
  listKnowledgeRetrievalSources,
} from '../modules/knowledge/retrieval-repository.js'

const routerSource = readFileSync(new URL('../modules/knowledge/router.ts', import.meta.url), 'utf8')

test('hybrid retrieval fuses duplicate ranks and caps each source at three chunks', () => {
  const hit = (parent_id: string, id: string) => ({ parent_id, id, content: id })
  const fused = fuseKnowledgeSearchHits([
    [hit('source-a', 'a1'), hit('source-a', 'a2'), hit('source-a', 'a3'), hit('source-a', 'a4')],
    [hit('source-a', 'a2'), hit('source-b', 'b1'), hit('source-a', 'a1')],
  ])
  assert.deepEqual(fused.map((item) => item.id), ['a2', 'a1', 'b1', 'a3'])
})

test('source metadata lists remain readable while the Open Notebook engine is offline', () => {
  const projectList = routerSource.match(/get\('\/projects\/:id\/sources'[\s\S]*?\n\}\)\)/)?.[0] ?? ''
  const conversationList = routerSource.match(/get\('\/conversations\/:id\/sources'[\s\S]*?\n\}\)\)/)?.[0] ?? ''
  assert.match(projectList, /knowledgeApplication\.sources\(workspace\)/)
  assert.match(conversationList, /knowledgeApplication\.conversationSources\(scope, conversationId\)/)
  assert.doesNotMatch(projectList, /requireKnowledge\(\)/)
  assert.doesNotMatch(conversationList, /requireKnowledge\(\)/)
})

test('native Open Notebook ingestion accepts the supported attachment contract', () => {
  const previous = process.env.OPEN_NOTEBOOK_ENABLED
  process.env.OPEN_NOTEBOOK_ENABLED = 'true'
  try {
    assert.equal(openNotebookEnabled(), true)
    assert.equal(isKnowledgeAttachmentMime('application/pdf', 1024), true)
    assert.equal(isKnowledgeAttachmentMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1024), true)
    assert.equal(isKnowledgeAttachmentMime('text/markdown', 1024), true)
    assert.equal(isKnowledgeAttachmentMime('audio/mpeg', 1024), false)
    assert.equal(isKnowledgeAttachmentMime('image/png', 1024), false)
    assert.equal(isKnowledgeAttachmentMime('application/zip', 1024), false)
    assert.equal(isKnowledgeAttachmentMime('application/pdf', MAX_SOURCE_BYTES + 1), false)
  } finally {
    if (previous === undefined) delete process.env.OPEN_NOTEBOOK_ENABLED
    else process.env.OPEN_NOTEBOOK_ENABLED = previous
  }
})

test('supported attachment types are explicit and do not include archives', () => {
  assert.deepEqual([...KNOWLEDGE_ATTACHMENT_MIMES].sort(), [
    'application/json',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/csv',
    'text/markdown',
    'text/plain',
  ])
})

test('knowledge URL validator rejects local, credentialed, and non-http targets', async () => {
  await assert.rejects(validateKnowledgeUrl('http://localhost/admin'), /blocked/)
  await assert.rejects(validateKnowledgeUrl('http://127.0.0.1/private'), /blocked/)
  await assert.rejects(validateKnowledgeUrl('file:///etc/passwd'), /http or https/)
  await assert.rejects(validateKnowledgeUrl('https://user:pass@example.com'), /credentials/)
})

test('native ingestion preserves the public upload limit', () => {
  assert.equal(MAX_SOURCE_BYTES, 200 * 1024 * 1024)
})

test('Open Notebook file ingestion references the canonical private object without uploading a second copy', async () => {
  const originalFetch = globalThis.fetch
  let capturedBody = ''
  let didFetch = false
  let idempotencyKey: string | null = null
  globalThis.fetch = (async (_input, init) => {
    capturedBody = String(init?.body ?? '')
    didFetch = true
    idempotencyKey = new Headers(init?.headers).get('idempotency-key')
    return new Response(JSON.stringify({ id: 'source-1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    await new OpenNotebookClient({ baseUrl: 'https://notebook.invalid' }).createFileSource({
      notebookId: 'notebook-1',
      title: '课程讲义',
      mime: 'application/pdf',
      storageKey: 'knowledge-sources/company/project/source-1.pdf',
      size: 4,
      idempotencyKey: 'source-1',
      companyId: 'company-1',
    })
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.equal(didFetch, true)
  assert.equal(idempotencyKey, 'source-1')
  assert.deepEqual(JSON.parse(capturedBody), {
    type: 'file', notebooks: ['notebook-1'], title: '课程讲义',
    storage_key: 'knowledge-sources/company/project/source-1.pdf',
    filename: '课程讲义.pdf', mime_type: 'application/pdf', size_bytes: 4, company_id: 'company-1',
  })
})

test('Open Notebook JSON source idempotency stays in the internal header', async () => {
  const originalFetch = globalThis.fetch
  let capturedHeaders = new Headers()
  let capturedBody = ''
  globalThis.fetch = (async (_input, init) => {
    capturedHeaders = new Headers(init?.headers)
    capturedBody = String(init?.body ?? '')
    return new Response(JSON.stringify({ id: 'source-2' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    await new OpenNotebookClient({ baseUrl: 'https://notebook.invalid' }).createTextSource({
      notebookId: 'notebook-1',
      title: 'Notes',
      content: 'bounded text',
      idempotencyKey: 'source-2',
      companyId: 'company-1',
    })
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.equal(capturedHeaders.get('idempotency-key'), 'source-2')
  assert.deepEqual(JSON.parse(capturedBody), {
    type: 'text',
    notebooks: ['notebook-1'],
    title: 'Notes',
    content: 'bounded text',
    company_id: 'company-1',
  })
})

test('LingxiLoop never marks an upstream command ready without embedded chunks', () => {
  const runtime = readFileSync(new URL('../modules/knowledge/runtime.ts', import.meta.url), 'utf8')
  assert.match(runtime, /knowledgeEngineHealth[\s\S]*openNotebookClient\.ready\(\)/)
  assert.match(runtime, /const embeddedChunks = Number\(external\.embedded_chunks \?\? 0\)/)
  assert.match(runtime, /if \(!Number\.isInteger\(embeddedChunks\) \|\| embeddedChunks < 1\)/)
  assert.match(runtime, /chunkCount: embeddedChunks/)
  const statusNormalizer = runtime.slice(runtime.indexOf('function normalizedStatus'), runtime.indexOf('async function releaseDeferredWake'))
  assert.doesNotMatch(statusNormalizer, /full_text|embedded/)
})

test('direct and group Agent retrieval share one membership-scoped Project resolver', async () => {
  const calls: Array<{ text: string; params: readonly unknown[] }> = []
  const db: Queryable = {
    query: async (text, params = []) => {
      calls.push({ text, params })
      return { rows: [{ project_id: 'project-1' }], rowCount: 1 } as never
    },
  }

  assert.equal(
    await findKnowledgeRetrievalProject(db, 'company-1', 'conversation-1', 'user-1'),
    'project-1',
  )
  assert.equal(calls.length, 1)
  assert.doesNotMatch(calls[0]!.text, /project_memberships|company_memberships/)
  assert.match(calls[0]!.text, /conversation\.kind IN \('group','direct'\)/)
  assert.match(calls[0]!.text, /conversation\.members @> to_jsonb\(ARRAY\[\$3::text\]\)/)
  assert.deepEqual(calls[0]!.params, ['conversation-1', 'company-1', 'user-1'])

  const controlPlane = readFileSync(new URL('../agent-os/control-plane.ts', import.meta.url), 'utf8')
  const agentApplication = readFileSync(new URL('../modules/knowledge/agent-application.ts', import.meta.url), 'utf8')
  assert.match(controlPlane, /workspaceRow\?\.kind === 'group' \|\| workspaceRow\?\.kind === 'direct'/)
  assert.match(agentApplication, /findKnowledgeRetrievalProject\(db, work\.companyId, work\.channelId, userId\)/)
})

test('knowledge retrieval builds the Open Notebook allowlist before search', async () => {
  const calls: Array<{ text: string; params: readonly unknown[] }> = []
  const db: Queryable = {
    query: async (text, params = []) => {
      calls.push({ text, params })
      return {
        rows: [{
          id: 'source-private',
          title: 'Private source',
          external_source_id: 'source:private',
          original_url: null,
          excluded: false,
        }],
        rowCount: 1,
      } as never
    },
  }

  const sources = await listKnowledgeRetrievalSources(db, {
    companyId: 'company-1',
    projectId: 'project-1',
    conversationId: 'conversation-1',
    authorizationUserId: 'user-1',
  })

  assert.deepEqual(sources, [{
    id: 'source-private',
    title: 'Private source',
    externalSourceId: 'source:private',
    originalUrl: null,
    excluded: false,
  }])
  assert.equal(calls.length, 1)
  assert.match(calls[0]!.text, /source\.company_id=\$2 AND source\.project_id=\$3/)
  assert.match(calls[0]!.text, /source\.visibility_scope='PROJECT'/)
  assert.match(calls[0]!.text, /source\.visibility_scope='PRIVATE' AND source\.owner_user_id=\$4/)
  assert.match(calls[0]!.text, /exclusion\.user_id=\$4/)
  assert.deepEqual(calls[0]!.params, ['conversation-1', 'company-1', 'project-1', 'user-1'])
})

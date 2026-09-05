import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  assertHostActionPermission,
  KNOWLEDGE_ACTION_METHODS,
} from '../agent-os/authorization.js'
import type { AgentWorkItem, HostAction } from '../agent-os/types.js'
import type { Queryable } from '../db/queryable.js'
import {
  insertAgentKnowledgeSource,
  listAgentKnowledgeSources,
} from '../modules/knowledge/agent-repository.js'

const expectedKnowledgeMethods = [
  'add_file',
  'add_text',
  'add_url',
  'delete_source',
  'list_sources',
  'retry_ingestion',
  'set_source_enabled',
]

test('knowledge Host Actions use one exact RAG-only allowlist', async () => {
  assert.deepEqual([...KNOWLEDGE_ACTION_METHODS].sort(), expectedKnowledgeMethods)

  let queries = 0
  const db: Queryable = {
    query: async () => {
      queries++
      throw new Error('authorization query should not run')
    },
  }
  const work = {
    id: 'work-1', fence: 1, companyId: 'company-1', authorizationUserId: 'user-1',
    agentId: 'nova', channelId: 'conversation-1', triggerClientMsgNo: 'message-1',
    reason: 'message', executionRole: 'coordinator', lane: 'learner', leaseToken: 'lease-1',
  } satisfies AgentWorkItem
  const action = {
    runId: work.id, cellId: 'cell-1', callIndex: 0, idempotencyKey: `${work.id}:cell-1:0`,
    action: 'knowledge.ask', args: { question: 'unsupported' },
  } satisfies HostAction

  await assert.rejects(assertHostActionPermission(db, work, action), /unsupported knowledge action: ask/)
  assert.equal(queries, 0)
})

test('only enable and delete retain the native approval boundary', () => {
  const source = readFileSync(new URL('../agent-os/learning-actions.ts', import.meta.url), 'utf8')
  const approvalBlock = source.slice(source.indexOf('const APPROVAL_REQUIRED'), source.indexOf('function record'))
  for (const action of ['knowledge.set_source_enabled', 'knowledge.delete_source']) {
    assert.match(approvalBlock, new RegExp(action.replace('.', '\\.')))
  }
  for (const action of ['knowledge.add_text', 'knowledge.retry_ingestion']) {
    assert.doesNotMatch(approvalBlock, new RegExp(action.replace('.', '\\.')))
  }
})

test('Agent application and provider contain only source management capabilities', () => {
  const application = readFileSync(new URL('../modules/knowledge/agent-application.ts', import.meta.url), 'utf8')
  const repository = readFileSync(new URL('../modules/knowledge/agent-repository.ts', import.meta.url), 'utf8')
  const provider = readFileSync(new URL('../modules/knowledge/provider.ts', import.meta.url), 'utf8')
  const kernel = readFileSync(new URL('../../../third_party/lingxios/kernel/runner.py', import.meta.url), 'utf8')

  assert.doesNotMatch(application, /from ['"][^'"]*db\/pool\.js['"]|\b(?:pool|db)\.query\b|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/is)
  assert.match(application, /work\.authorizationUserId\?\.trim\(\)[\s\S]*if \(!userId\) throw/)
  assert.match(application, /map\(agentSourceView\)/)
  assert.match(repository, /Queryable/)
  assert.match(repository, /conversation\.company_id=\$3 AND conversation\.project_id=\$4/)
  assert.match(provider, /if \(allowedSources\.size === 0\) return \[\]/)
  assert.doesNotMatch(provider, /search_notes|listNotes|\/api\/notes|\/insights|\/chat\/sessions|\/search\/ask/)
  assert.doesNotMatch(provider, /transformations|async_processing|delete_source/)
  assert.match(kernel, /SDK_MODULE_NAME = "host"/)
  assert.match(kernel, /context\.get\("capabilities"\)/)
  assert.match(kernel, /return bridge\.call\(f"\{namespace\}\.\{method\}"/)
  for (const removed of ['ask', 'create_note', 'create_insight', 'start_source_chat', 'update_source', 'unlink_source']) {
    assert.doesNotMatch(kernel, new RegExp(`"${removed}"`))
  }
})

test('Agent Source creation persists the delegated human as PRIVATE owner and creator', async () => {
  const calls: Array<{ text: string; params: readonly unknown[] }> = []
  const db: Queryable = {
    query: async (text, params = []) => {
      calls.push({ text, params })
      return { rows: [], rowCount: 1 } as never
    },
  }

  await insertAgentKnowledgeSource(db, {
    id: 'source-1',
    companyId: 'company-1',
    projectId: 'project-1',
    conversationId: 'conversation-1',
    kind: 'text',
    title: 'Delegated source',
    mime: 'text/plain',
    size: 7,
    storageKey: 'private/source-1.txt',
    originalUrl: null,
    authorizationUserId: 'student-1',
  })

  assert.equal(calls.length, 1)
  assert.match(calls[0]!.text, /visibility_scope,owner_user_id,created_by_user_id,created_via/)
  assert.match(calls[0]!.text, /'PRIVATE',\$11,\$11,'AGENT'/)
  assert.equal(calls[0]!.params.at(-1), 'student-1')
})

test('Agent Source listing applies the authorization user before returning rows', async () => {
  const calls: Array<{ text: string; params: readonly unknown[] }> = []
  const db: Queryable = {
    query: async (text, params = []) => {
      calls.push({ text, params })
      return { rows: [], rowCount: 0 } as never
    },
  }

  assert.deepEqual(await listAgentKnowledgeSources(db, {
    companyId: 'company-1',
    projectId: 'project-1',
    conversationId: 'conversation-1',
    authorizationUserId: 'student-1',
  }), [])
  assert.equal(calls.length, 1)
  assert.match(calls[0]!.text, /source\.company_id=\$2 AND source\.project_id=\$3/)
  assert.match(calls[0]!.text, /source\.visibility_scope='PRIVATE' AND source\.owner_user_id=\$4/)
  assert.match(calls[0]!.text, /exclusion\.user_id=\$4/)
  assert.deepEqual(calls[0]!.params, ['conversation-1', 'company-1', 'project-1', 'student-1'])
})

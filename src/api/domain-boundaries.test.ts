import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const domains = [
  'canvas',
  'documents', 'email', 'files',
  'observability', 'platform',
] as const

test('frontend API implementations and consumers stay domain-scoped', async () => {
  await assert.rejects(access(new URL('./client.ts', import.meta.url)))
  await assert.rejects(access(new URL('./calendar.ts', import.meta.url)))

  for (const domain of domains) {
    const source = await readFile(new URL(`./${domain}.ts`, import.meta.url), 'utf8')
    assert.match(source, new RegExp(`export const ${domain}Api =`))
    assert.doesNotMatch(source, /export const api =/)
  }

  const consumers = await Promise.all([
    '../features/chat/state/messages.ts', '../features/conversations/store.ts', '../features/boards/state.ts',
    '../features/calendar/state.ts', '../stores/canvas.ts', '../stores/documents.ts',
    '../features/knowledge/state.ts', '../features/agents/state.ts',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  assert.doesNotMatch(consumers.join('\n'), /api\/client|\bapi\.[A-Za-z]/)

  for (const file of ['api.ts', 'contracts.ts', 'state.ts']) {
    await access(new URL(`../features/calendar/${file}`, import.meta.url))
  }
  const calendarState = await readFile(new URL('../features/calendar/state.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(calendarState, /stores\/calendar|api\/calendar/)
  const loadEvent = calendarState.slice(
    calendarState.indexOf('async loadEvent'),
    calendarState.indexOf('async reload'),
  )
  assert.match(loadEvent, /calendarApi\.get\(id\)/)
  assert.doesNotMatch(loadEvent, /calendarApi\.list\(/)

  for (const file of ['api.ts', 'contracts.ts', 'store.ts']) {
    await access(new URL(`../features/conversations/${file}`, import.meta.url))
  }
  await assert.rejects(access(new URL('./conversations.ts', import.meta.url)))
  await assert.rejects(access(new URL('../stores/conversations.ts', import.meta.url)))
  const conversationsState = await readFile(new URL('../features/conversations/store.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(conversationsState, /stores\/conversations|api\/conversations/)
  assert.match(conversationsState, /error: string \| null/)

  for (const file of ['api.ts', 'state/messages.ts', 'components/ChatComposer.tsx']) {
    await access(new URL(`../features/chat/${file}`, import.meta.url))
  }
  await assert.rejects(access(new URL('./messages.ts', import.meta.url)))
  await assert.rejects(access(new URL('../stores/messages.ts', import.meta.url)))
  const messagesState = await readFile(new URL('../features/chat/state/messages.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(messagesState, /stores\/messages|api\/messages/)
  const chatApi = await readFile(new URL('../features/chat/api.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(chatApi, /sendMessage\s*:/)
  assert.match(messagesState, /lingxiIm\.send\(convoId, payload\)/)

  for (const file of ['api.ts', 'contracts.ts', 'state.ts']) {
    await access(new URL(`../features/knowledge/${file}`, import.meta.url))
  }
  await assert.rejects(access(new URL('./knowledge.ts', import.meta.url)))
  await assert.rejects(access(new URL('../stores/knowledgeSources.ts', import.meta.url)))

  for (const file of ['api.ts', 'contracts.ts', 'components/InvitePeopleModal.tsx', 'components/WorkspaceCreateDialog.tsx']) {
    await access(new URL(`../features/companies/${file}`, import.meta.url))
  }
  await assert.rejects(access(new URL('./companies.ts', import.meta.url)))
  await assert.rejects(access(new URL('../components/CompanySwitcher.tsx', import.meta.url)))
  const companySources = await Promise.all([
    '../features/companies/components/InvitePeopleModal.tsx',
    '../features/companies/components/CompanyCourseManagement.tsx',
    '../features/companies/components/InviteAcceptScreen.tsx',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  assert.doesNotMatch(companySources.join('\n'), /api\/companies|components\/InvitePeopleModal/)

  for (const file of ['api.ts', 'contracts.ts', 'state.ts', 'components/BoardsView.tsx', 'components/BoardPeekPane.tsx']) {
    await access(new URL(`../features/boards/${file}`, import.meta.url))
  }
  await assert.rejects(access(new URL('./boards.ts', import.meta.url)))
  await assert.rejects(access(new URL('../stores/boards.ts', import.meta.url)))
  const boardState = await readFile(new URL('../features/boards/state.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(boardState, /api\/boards|stores\/boards/)

  for (const file of ['api.ts', 'contracts.ts', 'courseContract.ts', 'components/LearningCenter.tsx']) {
    await access(new URL(`../features/learning/${file}`, import.meta.url))
  }
  await assert.rejects(access(new URL('./learning.ts', import.meta.url)))
  await assert.rejects(access(new URL('./courseContract.ts', import.meta.url)))
  const learningApi = await readFile(new URL('../features/learning/api.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(learningApi, /listProjects|createProject|openProject|archiveProject/)
  await access(new URL('../features/knowledge/workspace.ts', import.meta.url))
  await assert.rejects(access(new URL('../stores/workspace.ts', import.meta.url)))

  for (const file of ['api.ts', 'contracts.ts', 'state.ts', 'components/AgentEditor.tsx', 'components/AgentsView.tsx']) {
    await access(new URL(`../features/agents/${file}`, import.meta.url))
  }
  await assert.rejects(access(new URL('./agents.ts', import.meta.url)))
  await assert.rejects(access(new URL('../stores/participants.ts', import.meta.url)))
  await assert.rejects(access(new URL('../components/AgentEditor.tsx', import.meta.url)))
  await assert.rejects(access(new URL('../desktop/AgentsView.tsx', import.meta.url)))
  const agentSources = await Promise.all([
    '../features/agents/api.ts',
    '../features/agents/state.ts',
    '../features/agents/components/AgentEditor.tsx',
    '../features/agents/components/AgentsView.tsx',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  assert.doesNotMatch(agentSources.join('\n'), /api\/agents|stores\/participants|components\/AgentEditor|desktop\/AgentsView/)
})

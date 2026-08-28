import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const domains = [
  'agents', 'boards', 'canvas', 'companies',
  'documents', 'email', 'files', 'knowledge', 'learning', 'messages',
  'observability', 'platform', 'shipping',
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
    '../stores/messages.ts', '../features/conversations/store.ts', '../stores/boards.ts',
    '../features/calendar/state.ts', '../stores/canvas.ts', '../stores/documents.ts',
    '../stores/knowledgeSources.ts', '../stores/participants.ts',
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
})

import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const domains = [
  'agents', 'boards', 'calendar', 'canvas', 'companies', 'conversations',
  'documents', 'email', 'files', 'knowledge', 'learning', 'messages',
  'observability', 'platform', 'shipping',
] as const

test('frontend API implementations and consumers stay domain-scoped', async () => {
  await assert.rejects(access(new URL('./client.ts', import.meta.url)))

  for (const domain of domains) {
    const source = await readFile(new URL(`./${domain}.ts`, import.meta.url), 'utf8')
    assert.match(source, new RegExp(`export const ${domain}Api =`))
    assert.doesNotMatch(source, /export const api =/)
  }

  const consumers = await Promise.all([
    '../stores/messages.ts', '../stores/conversations.ts', '../stores/boards.ts',
    '../stores/calendar.ts', '../stores/canvas.ts', '../stores/documents.ts',
    '../stores/knowledgeSources.ts', '../stores/participants.ts',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  assert.doesNotMatch(consumers.join('\n'), /api\/client|\bapi\.[A-Za-z]/)
})

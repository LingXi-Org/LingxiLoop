import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (path: string) => readFileSync(resolve(here, path), 'utf8')

test('conversation controls retain accessible labels and pending preference state', () => {
  const avatars = read('../components/Avatar.tsx')
  const pane = read('../features/conversations/components/ConversationsPane.tsx')
  assert.match(avatars, /aria-label=\{`\$\{overflow\}[^`]+`\}/)
  assert.match(pane, /toastAction\(mutation\.then/)
  assert.match(pane, /pendingPreferences/)
})

test('visible messages advance the durable read cursor and reconcile the unread badge', () => {
  const thread = read('../features/chat/components/ConversationThread.tsx')
  const message = read('../features/chat/components/ConversationMessage.tsx')
  const api = read('../features/chat/api.ts')
  assert.match(message, /data-msg-seq=\{custom\.sequence \?\? undefined\}/)
  assert.match(thread, /new IntersectionObserver\(scheduleReadReceipt, \{ root: viewport \}\)/)
  assert.match(thread, /messagesApi\.markRead\(conversationId, readThroughSeq\)/)
  assert.match(thread, /unread: unread \|\| undefined/)
  assert.match(read('./ConversationList.tsx'), /!selected && \(conversation\.unread \?\? 0\) > 0/)
  assert.match(read('../features/conversations/components/ConversationsPane.tsx'), /selected=\{selected\}/)
  assert.match(api, /body: JSON\.stringify\(\{ readThroughSeq \}\)/)
})

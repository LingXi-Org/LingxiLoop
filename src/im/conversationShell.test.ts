import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (path: string) => readFileSync(resolve(here, path), 'utf8')

test('conversation list and header opt agent avatars into live chat motion', () => {
  const source = read('./ConversationList.tsx')
  const avatars = read('../components/Avatar.tsx')
  assert.match(source, /<Avatar p=\{person\}[\s\S]*?mode="chat"/)
  assert.match(source, /<AvatarStack[\s\S]*?mode="chat"/)
  assert.match(source, /<HiveAvatar[\s\S]*?mode="chat"/)
  assert.match(source, /isMobile \? 42 : !isDirectAgent \? 48 : 54/)
  assert.match(avatars, /aria-label=\{`\$\{overflow\} 位其他成员`\}/)
  assert.match(avatars, /place-items-center text-\[10px\] font-bold text-muted-foreground/)
  assert.doesNotMatch(avatars, /place-items-center rounded-xl bg-muted text-\[10px\]/)
})

test('pin and mute states use Hugeicons and shadcn semantic tokens', () => {
  const list = read('./ConversationList.tsx')
  const pane = read('../features/conversations/components/ConversationsPane.tsx')
  assert.match(list, /PinIcon/)
  assert.match(list, /NotificationOff01Icon/)
  assert.match(list, /text-muted-foreground/)
  assert.doesNotMatch(list, />[◆⌁]</)
  assert.match(pane, /toastAction\(mutation\.then/)
  assert.match(pane, /pendingPreferences/)
  assert.match(list, /<Badge className="[^"]*bg-\[var\(--unread\)\]/)
  assert.doesNotMatch(list, /bg-foreground text-background/)
  assert.doesNotMatch(pane, /pinned\?: boolean|pinned=\{conversation\.pinned\}|bg-sidebar-primary\/10/)
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

import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const srcRoot = resolve(here, '..')
const read = (path: string) => readFileSync(resolve(here, path), 'utf8')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(?:ts|tsx)$/.test(name) ? [path] : []
  })
}

test('chat is a single assistant-ui external-store runtime', () => {
  const runtime = read('../features/chat/runtime/runtime.tsx')
  const model = read('../features/chat/runtime/model.ts')
  const thread = read('../features/chat/components/ConversationThread.tsx')
  const composer = read('../features/chat/components/ConversationComposer.tsx')
  const lexicalInput = read('../features/chat/components/ComposerLexicalInput.tsx')
  const triggers = read('../features/chat/components/ComposerTriggers.tsx')
  const message = read('../features/chat/components/ConversationMessage.tsx')
  const markdown = read('../components/assistant-ui/markdown-text.tsx')
  const typingIndicator = read('../components/typing-indicator.tsx')
  const tools = read('../features/chat/components/ToolRenderers.tsx')
  const toolFallback = read('../components/tool-fallback.aui.tsx')
  assert.match(runtime, /useExternalStoreRuntime<ThreadMessage>/)
  assert.match(model, /schema: 'lingxiloop\.thread-message\.v1'/)
  for (const primitive of ['Root', 'Viewport', 'Messages', 'ViewportFooter', 'ScrollToBottom']) {
    assert.match(thread, new RegExp(`ThreadPrimitive\\.${primitive}`))
  }
  for (const primitive of ['Root', 'Attachments', 'AddAttachment', 'Quote', 'Send', 'Cancel']) {
    assert.match(composer, new RegExp(`ComposerPrimitive\\.${primitive}`))
  }
  assert.match(composer, /ComposerLexicalInput/)
  assert.match(lexicalInput, /LexicalComposerInput/)
  assert.match(lexicalInput, /directiveChip=\{ComposerDirectiveChip\}/)
  assert.match(triggers, /ComposerPrimitive\.Unstable_TriggerPopover/)
  assert.match(triggers, /unstable_useMentionAdapter/)
  assert.match(triggers, /unstable_useSlashCommandAdapter/)
  assert.match(triggers, /<Avatar p=\{participant\}/)
  assert.match(triggers, /UsersRoundIcon/)
  assert.match(triggers, /BarChart3Icon/)
  assert.match(message, /MessagePrimitive\.Root/)
  assert.match(message, /MessagePrimitive\.Parts/)
  assert.match(message, /<TypingIndicator variant="bare"/)
  assert.match(markdown, /StreamdownTextPrimitive/)
  assert.match(markdown, /caret="block"/)
  assert.match(typingIndicator, /data-slot="typing-indicator"/)
  assert.doesNotMatch(thread, /AgentTypingIndicator/)
  assert.match(message, /ActionBarPrimitive\.Root/)
  assert.match(tools, /from '@\/components\/tool-fallback\.aui'/)
  assert.doesNotMatch(tools, /function ToolFallback/)
  assert.match(toolFallback, /data-slot="tool-fallback-root"/)
  assert.match(toolFallback, /ToolCallMessagePartComponent/)
})

test('chat keeps assistant-ui Viewport as its only scroll container', () => {
  const thread = read('../features/chat/components/ConversationThread.tsx')
  const globals = read('../styles/globals.css')
  assert.match(thread, /data-chat-viewport className="[^"]*overflow-y-auto[^"]*\[scrollbar-gutter:stable\][^"]*"/)
  assert.match(thread, /ThreadPrimitive\.ViewportFooter className="[^"]*shrink-0[^"]*"/)
  assert.doesNotMatch(thread, /ScrollAreaPrimitive|<ScrollBar/)
  assert.doesNotMatch(globals, /data-radix-scroll-area-content/)
})

test('legacy chat protocol and handwritten chat surfaces are absent', () => {
  for (const path of [
    '../im/assistantMessage.ts', '../im/assistantRuntime.tsx', '../im/MessageList.tsx',
    '../features/chat/state/messages.ts', '../features/chat/components/ChatComposer.tsx',
    '../components/messages/LingxiImMessage.tsx', '../components/messages/ImBubble.tsx',
    '../components/ui/message.tsx',
  ]) assert.equal(existsSync(resolve(here, path)), false, `${path} must be deleted`)
  const production = sourceFiles(srcRoot)
    .filter((path) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n')
  assert.doesNotMatch(production, /useMessages|createLingxiAssistantMessage|lingxi\.im\.message\.v1|legacy fallback/i)
})

test('only the chat transport boundary imports WuKong', () => {
  const offenders = sourceFiles(srcRoot)
    .filter((path) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'))
    .filter((path) => !path.endsWith('lib\\im\\wukong.ts') && !path.endsWith('lib/im/wukong.ts'))
    .filter((path) => /from ['"]@\/lib\/im\/wukong['"]/.test(readFileSync(path, 'utf8')))
    .map((path) => path.slice(srcRoot.length).replaceAll('\\', '/'))
  assert.deepEqual(offenders, [
    '/features/chat/runtime/converter.ts',
    '/features/chat/runtime/transport.ts',
  ])
})

test('ChatPane remains a small shell and does not alter sidebar or header ownership', () => {
  const pane = read('../desktop/ChatPane.tsx')
  assert.ok(pane.length < 6_000)
  assert.match(pane, /<ConversationHeader/)
  assert.match(pane, /<ConversationThread/)
  assert.doesNotMatch(pane, /useExternalStoreRuntime|lingxiIm|MessagePrimitive|ComposerPrimitive/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const runtime = read('../im/assistantRuntime.tsx')
const assistantMessage = read('../im/assistantMessage.ts')
const messageList = read('../im/MessageList.tsx')
const parts = read('../components/messages/LingxiMessageParts.tsx')
const message = read('../components/messages/LingxiImMessage.tsx')
const bubble = read('../components/messages/ImBubble.tsx')
const markdown = read('../components/assistant-ui/markdown-text.tsx')
const reasoning = read('../components/assistant-ui/elements/reasoning-panel.tsx')
const surfaces = read('../components/assistant-ui/elements/surfaces.tsx')
const poll = read('../components/PollBubble.tsx')
const optionList = read('../components/tool-ui/option-list/option-list.tsx')
const codeBlock = read('../components/tool-ui/code-block/code-block.tsx')

test('assistant-ui wraps virtual rows without taking over the IM viewport', () => {
  assert.match(runtime, /useExternalStoreRuntime<Message>/)
  assert.match(runtime, /AssistantRuntimeProvider/)
  assert.match(messageList, /ThreadPrimitive\.Unstable_MessageById/)
  assert.match(messageList, /<Virtuoso/)
  assert.doesNotMatch(messageList, /ThreadPrimitive\.Viewport/)
})

test('native metadata.custom is the only IM row input', () => {
  assert.match(assistantMessage, /custom: metadata/)
  assert.match(assistantMessage, /schema: 'lingxi\.im\.message\.v1'/)
  assert.match(assistantMessage, /message,/)
  assert.match(message, /useAuiState\(\(state\) => state\.message\.metadata\.custom\)/)
  assert.match(message, /const \{ message: msg, sender: author \} = custom/)
  assert.match(message, /const isMine = custom\.isMine/)
  const nativeProps = message.slice(message.indexOf('interface LingxiImMessageProps'), message.indexOf('const QUICK_REACTIONS'))
  assert.doesNotMatch(nativeProps, /\bmsg\??:/)
  assert.doesNotMatch(assistantMessage, /messageConverter|useLingxiImMessage/)
})

test('all primary payloads render through MessagePrimitive.Parts with no fallback renderer', () => {
  assert.match(parts, /<MessagePrimitive\.Parts>/)
  for (const mapping of ['lingxi_approval', 'lingxi_tool_activity', 'lingxi_poll', 'lingxi_handoff', 'lingxi_learning_mission', 'lingxi_email', 'lingxi_canvas', 'lingxi_citations']) {
    assert.ok(parts.includes(mapping), `missing ${mapping}`)
  }
  assert.doesNotMatch(parts, /UnsupportedPart|tool-ui-unsupported-part|unserializable payload/)
  assert.match(parts, /throw new Error\(`Unregistered native/)
})

test('the first-party IM shell is rooted in assistant-ui and owns the bubble layout', () => {
  assert.match(message, /<MessagePrimitive\.Root/)
  assert.match(parts, /<ImBubble/)
  assert.match(bubble, /data-im-bubble/)
  assert.match(bubble, /field/)
  assert.match(bubble, /paper/)
  assert.match(surfaces, /bg-background border border-border\/60 dark:bg-popover/)
  assert.doesNotMatch(message, /\b(?:msg|message)\.kind\b/)
})

test('text and reasoning use the official assistant-ui registry components', () => {
  assert.match(parts, /<MarkdownText \/>/)
  assert.match(parts, /<ReasoningPanel/)
  assert.match(markdown, /MarkdownTextPrimitive/)
  assert.match(reasoning, /data-slot="reasoning-panel"/)
  assert.match(reasoning, /collapsePanel/)
})

test('official Elements and Tool UI visual contracts remain intact', () => {
  assert.match(runtime, /className="assistant-ui-scope aui-thread-root/)
  assert.match(surfaces, /transition-\[background-color,color,scale\]/)
  assert.match(surfaces, /motion-reduce:transition-none/)
  assert.match(reasoning, /group-data-panel-open\/trigger:rotate-180/)
  assert.match(optionList, /import\.meta\.env\.DEV/)
})

test('approval is single-flight and feeds assistant-ui addResult into the native API', () => {
  assert.match(parts, /if \(!pending \|\| busy\) return/)
  assert.match(parts, /addResult\(\{ decision \}\)/)
  assert.match(runtime, /onAddToolResult/)
  assert.match(runtime, /api\.resolveApproval/)
})

test('poll retains the existing vote API while using keyboard-accessible Tool UI OptionList', () => {
  assert.match(poll, /<OptionList/)
  assert.match(poll, /api\.castPollVote/)
  assert.match(poll, /VoterStack/)
  assert.match(optionList, /key === "ArrowDown"/)
  assert.match(optionList, /key === "Enter" \|\| key === " "/)
  assert.match(optionList, /role="option"/)
})

test('media uses native Tool UI components and malformed payload renderers are absent', () => {
  assert.match(parts, /mime\.startsWith\('audio\/'\)/)
  assert.match(parts, /mime\.startsWith\('video\/'\)/)
  assert.match(parts, /return <AttachmentCard \/>/)
  assert.match(codeBlock, /getDocumentTheme\(\) \?\? getSystemTheme\(\)/)
  assert.match(codeBlock, /resolvedTheme === "dark"/)
  assert.doesNotMatch(parts, /malformed|fallback/i)
})

test('reply, reactions, retry, menu and read state stay outside Parts in the IM shell', () => {
  const partsIndex = message.indexOf('<LingxiMessageParts')
  assert.ok(partsIndex >= 0)
  for (const marker of ['<ReadReceiptStatus', 'retryFailedMessage', 'ReactionPill', 'ReplyIconButton', '<ContextMenu']) {
    assert.ok(message.includes(marker), `missing outer shell marker ${marker}`)
  }
})

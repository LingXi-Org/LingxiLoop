import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { messageShellCapabilities } from './messageShell'

test('text, poll, artifact, handoff, and approval retain the shared MessageRow behavior contract', () => {
  for (const kind of ['text', 'poll', 'tool', 'handoff', 'approval'] as const) {
    const shell = messageShellCapabilities(kind)
    assert.equal(shell.sharedShell, true, `${kind} must stay in MessageRow`)
    assert.equal(shell.quote, true)
    assert.equal(shell.reactions, true)
    assert.equal(shell.reply, true)
    assert.equal(shell.selection, true)
  }
  assert.equal(messageShellCapabilities('handoff').linkPreview, false)
  assert.equal(messageShellCapabilities('approval').linkPreview, false)
})

test('desktop and mobile both render the shared MessageRow component', async () => {
  const desktop = await readFile(new URL('../desktop/ChatPane.tsx', import.meta.url), 'utf8')
  const mobile = await readFile(new URL('../mobile/MobileChat.tsx', import.meta.url), 'utf8')
  assert.match(desktop, /<MessageRow\b/)
  assert.match(mobile, /<MessageRow\b/)
})

test('web, desktop, and mobile compose the shared IM core without Telegram runtime code', async () => {
  const desktop = await readFile(new URL('../desktop/ChatPane.tsx', import.meta.url), 'utf8')
  const mobile = await readFile(new URL('../mobile/MobileChat.tsx', import.meta.url), 'utf8')
  const desktopProfile = await readFile(new URL('../desktop/InfoPane.tsx', import.meta.url), 'utf8')
  const mobileProfile = await readFile(new URL('../mobile/MobileParticipantInfo.tsx', import.meta.url), 'utf8')
  const desktopList = await readFile(new URL('../desktop/ConversationsPane.tsx', import.meta.url), 'utf8')
  const mobileList = await readFile(new URL('../mobile/MobileChatList.tsx', import.meta.url), 'utf8')
  const desktopShell = await readFile(new URL('../desktop/DesktopApp.tsx', import.meta.url), 'utf8')
  const packageJson = await readFile(new URL('../../package.json', import.meta.url), 'utf8')

  for (const component of ['ConversationView', 'MessageList', 'ConversationHeader', 'ComposerSurface']) {
    assert.match(desktop, new RegExp(`<${component}\\b`))
    assert.match(mobile, new RegExp(`<${component}\\b`))
  }
  assert.match(desktopProfile, /<ParticipantProfile\b/)
  assert.match(mobileProfile, /<ParticipantProfile\b/)
  assert.match(desktopList, /<ConversationListItemContent\b/)
  assert.match(mobileList, /<ConversationListItemContent\b/)
  assert.match(desktopShell, /data-context-open=/)
  assert.doesNotMatch(desktopShell, /DesktopNavigation/)
  assert.doesNotMatch(packageJson, /"(?:teact|telegram-tt)"/i)
})

test('desktop chat reserves a scrollable middle row so the composer stays at the bottom', async () => {
  const desktop = await readFile(new URL('../desktop/ChatPane.tsx', import.meta.url), 'utf8')
  assert.match(desktop, /chat-surface grid h-full min-h-0 min-w-0 grid-rows-/)
  assert.match(desktop, /grid-rows-\[auto_auto_minmax\(0,1fr\)_auto\]/)
  assert.match(desktop, /data-chat-auxiliary="true"[\s\S]*?<ConversationActivity/)
  assert.doesNotMatch(desktop, /searchOpen[\s\S]{0,160}grid-rows-/)
  assert.match(desktop, /<Composer convoId=\{convoId\} \/>/)
})

test('desktop IM columns resize without changing the message/composer grid contract', async () => {
  const shell = await readFile(new URL('../desktop/DesktopApp.tsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../styles/globals.css', import.meta.url), 'utf8')
  assert.match(shell, /role="separator"/)
  assert.match(shell, /setPointerCapture/)
  assert.match(shell, /LEFT_COLUMN_STORAGE_KEY/)
  assert.match(shell, /--im-left-column-width/)
  assert.match(css, /grid-template-columns: var\(--im-left-column-width\) minmax\(0, 1fr\)/)
  assert.match(css, /calc\(100vw - var\(--im-left-column-width\)\)/)
})

test('reply text and composer surface do not restore the removed outer rules', async () => {
  const message = await readFile(new URL('../components/Message.tsx', import.meta.url), 'utf8')
  const composer = await readFile(new URL('../im/Composer.tsx', import.meta.url), 'utf8')
  const quoteCard = message.slice(message.indexOf('function QuoteCard'), message.indexOf('function ReplyIconButton'))
  assert.doesNotMatch(quoteCard, /openmaus-quote-card|border-|rounded-/)
  assert.doesNotMatch(composer, /border-t|border-hairline/)
})

test('Coworker cards use semantic light/dark tokens and expose the shared shell marker', async () => {
  const message = await readFile(new URL('../components/Message.tsx', import.meta.url), 'utf8')
  const activity = await readFile(new URL('../desktop/ChatPane.tsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../styles/globals.css', import.meta.url), 'utf8')

  for (const token of ['--panel', '--raised', '--raised-hover', '--hairline', '--ink', '--ink-secondary', '--accent', '--accent-ink']) {
    assert.match(css, new RegExp(`${token}:`))
  }
  assert.match(css, /:root\[data-theme='dark'\]/)
  assert.match(message, /data-message-shell=/)

  const coworkerSource = `${message.slice(message.indexOf('function HandoffCard'), message.indexOf('function MessageRowImpl'))}\n${activity.slice(activity.indexOf('function ConversationActivity'), activity.indexOf('export function ChatPane'))}`
  assert.doesNotMatch(coworkerSource, /bg-sky-50|text-skype-deep|bg-gold\/10|text-gold-deep|bg-white|text-black/)
  assert.match(coworkerSource, /border-hairline/)
  assert.match(coworkerSource, /bg-panel/)
  assert.match(coworkerSource, /bg-raised/)
})

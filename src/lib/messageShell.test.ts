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

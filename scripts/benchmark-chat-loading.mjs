import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Deterministic local adapter delays, not production latency or browser paint.
// Reuse the failure fixture to exercise the actual before/after transport.
const root = fileURLToPath(new URL('../', import.meta.url))
const dir = `${root}src/features/chat/runtime/`
const entry = `${dir}.issue248-timing.ts`
const before = `${dir}.issue248-before.ts`
const baseline = process.argv[2] ?? '5b2f6e43'
const fixture = readFileSync(`${dir}loading-critical-path.test.ts`, 'utf8')
let setup = fixture.slice(fixture.indexOf("  let projectId ="), fixture.indexOf('  const started ='))
setup = setup.replace("await import('./transport')", "await import(process.env.CHAT_TIMING_MODULE!)")
setup = setup.replace("calls === 1 ? Promise.resolve([envelope])", "calls === 1 ? new Promise(resolve => setTimeout(() => resolve([envelope]), 25))")
const measure = `
  let historyVisibleMs: number | null = null
  const started = performance.now()
  const unsubscribe = useChatThreadStore.subscribe(state => {
    if (state.conversations.a?.loaded && historyVisibleMs === null) historyVisibleMs = performance.now() - started
  })
  const pending = transport.loadConversation('a')
  setTimeout(() => finishRecovery([]), 275)
  await pending
  const warmStarted = performance.now()
  await transport.loadConversation('a')
  console.log(JSON.stringify({ variant: process.env.CHAT_TIMING_LABEL, historyVisibleMs,
    warmReadMs: performance.now() - warmStarted, httpReads: calls,
    fixtureHistoryDelayMs: 25, fixtureRecoveryReleaseMs: 275 }))
  unsubscribe()
`
try {
  writeFileSync(before, execFileSync('git', ['show', `${baseline}:src/features/chat/runtime/transport.ts`], { cwd: root }))
  writeFileSync(entry, `import { mock } from 'node:test'\nimport { createNativeMessage } from '../../../lib/nativeMessage'\n${setup}${measure}`)
  for (const [label, module] of [['before', './.issue248-before.ts'], ['after', './transport.ts']]) {
    const output = execFileSync(process.execPath, ['--import', 'tsx', '--experimental-test-module-mocks', entry], {
      cwd: root, env: { ...process.env, CHAT_TIMING_MODULE: module, CHAT_TIMING_LABEL: label }, encoding: 'utf8',
    })
    process.stdout.write(output)
  }
} finally {
  for (const path of [entry, before]) { try { unlinkSync(path) } catch {} }
}

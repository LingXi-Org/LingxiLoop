import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PUBLIC_ACTIVITY_KINDS, publicActivityTitle } from '../agents/activity-visibility.js'

test('Coworker activity uses the tenant-scoped message WebSocket bridge with a REST snapshot', async () => {
  const redis = await readFile(new URL('../redis.ts', import.meta.url), 'utf8')
  const wsBridge = await readFile(new URL('../ws.ts', import.meta.url), 'utf8')
  const activity = await readFile(new URL('../../../src/features/chat/components/ConversationActivity.tsx', import.meta.url), 'utf8')

  assert.match(redis, /CH_AGENT_ACTIVITY = 'lingxiloop:agent\.activity'/)
  assert.match(wsBridge, /sub\.subscribe\([\s\S]*CH_AGENT_ACTIVITY/)
  assert.match(activity, /event\.type === 'agent\.activity'/)
  assert.match(activity, /<AgentStatus/)
  assert.doesNotMatch(activity, /visible\.map|rounded-full|bg-muted/)
  assert.match(activity, /window\.setInterval\(refresh, 60_000\)/)
  assert.doesNotMatch(activity, /window\.setInterval\(refresh, 8_000\)/)
})

test('realtime activity envelope excludes raw event data and sensitive event kinds', async () => {
  const redis = await readFile(new URL('../redis.ts', import.meta.url), 'utf8')
  const observability = await readFile(new URL('../agents/observability.ts', import.meta.url), 'utf8')
  const envelope = redis.slice(redis.indexOf('export interface AgentActivityEvent'), redis.indexOf('export type BroadcastEvent'))

  assert.doesNotMatch(envelope, /\bdata\??:/)
  const visibility = await readFile(new URL('../agents/activity-visibility.ts', import.meta.url), 'utf8')
  assert.match(visibility, /chain\[\._-\]\?of/)
  assert.match(visibility, /secret\|credential/)
  assert.match(visibility, /PUBLIC_ACTIVITY_TITLES/)
  assert.doesNotMatch(observability, /title: args\.title/)
  assert.equal(publicActivityTitle('model.error'), 'Planning step failed')
  assert.equal(publicActivityTitle('model.error', 'debug'), null)
  assert.equal(publicActivityTitle('reasoning.raw'), null)
  assert.equal(publicActivityTitle('made.up.event'), null)
  assert.ok(PUBLIC_ACTIVITY_KINDS.includes('approval.requested'))
})

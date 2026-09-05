import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { NotificationPreferencesRow } from '../modules/notifications/contracts.js'
import { intentPresentation, isQuiet, routingWindow } from '../modules/notifications/routing.js'

const preference: NotificationPreferencesRow = {
  company_id: 'company-1', user_id: 'user-1', project_id: 'project-1',
  in_app_enabled: true, email_enabled: true, push_enabled: false,
  timezone: 'UTC', daily_time: '09:00', weekly_day: 1, quiet_start: null, quiet_end: null,
}

function event(eventType: string, payload: Record<string, unknown> = {}) {
  return {
    sequence: '7', company_id: 'company-1', project_id: 'project-1', event_type: eventType,
    aggregate_id: 'aggregate-1', recipient_user_id: 'user-1', context_channel_id: 'channel-1',
    occurred_at: new Date('2026-08-31T08:00:00Z'), payload,
  }
}

function intent(policy: 'IMMEDIATE' | 'DAILY' | 'WEEKLY' | 'FORMAL') {
  return {
    id: 'intent-1', company_id: 'company-1', project_id: 'project-1', recipient_user_id: 'user-1',
    source_event_sequence: '7', policy, summary: '摘要', link_path: '/learning',
    created_at: new Date('2026-08-31T08:00:00Z'),
  }
}

test('event projection emits fixed summaries and Context links without copying business facts', () => {
  const secret = 'SECRET_ANSWER_9384'
  for (const source of [
    event('ASSESSMENT.ATTEMPT_SUBMITTED', { answer: secret, score: 99 }),
    event('LEARNING_CASE.DETECTED', { diagnosis: secret }),
    event('LEARNING_CASE.ACTION_APPLIED', { kind: 'INTERVENE', result: secret }),
    event('ContextThreadCreated', { privateMessage: secret }),
  ]) {
    const projected = intentPresentation(source)
    assert.ok(projected)
    assert.doesNotMatch(JSON.stringify(projected), new RegExp(secret))
    assert.match(projected.linkPath, /^\//)
  }
  assert.equal(intentPresentation(event('UNSUPPORTED')), null)
})

test('routing distinguishes immediate, daily, weekly and formal windows', () => {
  const monday = new Date('2026-08-31T09:30:00.000Z')
  assert.equal(routingWindow(intent('IMMEDIATE'), preference, monday), 'immediate:7')
  assert.equal(routingWindow(intent('FORMAL'), preference, monday), 'formal:7')
  assert.equal(routingWindow(intent('DAILY'), preference, monday), 'daily:2026-08-31')
  assert.equal(routingWindow(intent('WEEKLY'), preference, monday), 'weekly:2026-08-31')
  assert.equal(routingWindow(intent('DAILY'), preference, new Date('2026-08-31T08:59:00Z')), null)
  assert.equal(routingWindow(intent('WEEKLY'), preference, new Date('2026-09-01T09:30:00Z')), 'weekly:2026-08-31')
  assert.equal(routingWindow(
    intent('WEEKLY'), { ...preference, weekly_day: 3 }, monday,
  ), null)
  assert.equal(routingWindow(
    { ...intent('DAILY'), created_at: new Date('2026-08-31T10:00:00Z') }, preference, monday,
  ), null)
  assert.equal(routingWindow(
    { ...intent('WEEKLY'), created_at: new Date('2026-08-31T10:00:00Z') }, preference, monday,
  ), null)
})

test('quiet periods defer every policy and Push has no worker scheduling path', () => {
  const quietPreference = { ...preference, quiet_start: '22:00', quiet_end: '08:00' }
  assert.equal(routingWindow(
    intent('IMMEDIATE'), quietPreference, new Date('2026-08-31T23:00:00Z'),
  ), null)
  assert.equal(isQuiet('07:30', '22:00', '08:00'), true)
  assert.equal(isQuiet('12:00', '22:00', '08:00'), false)

  const worker = readFileSync(new URL('../modules/notifications/worker.ts', import.meta.url), 'utf8')
  assert.match(worker, /domain_events/)
  assert.match(worker, /notification_intents/)
  assert.match(worker, /isActiveProjectMember/)
  assert.doesNotMatch(worker, /project_memberships/)
  assert.match(worker, /ON CONFLICT\(source_event_sequence,recipient_user_id\) DO NOTHING/)
  assert.match(worker, /ON CONFLICT\(company_id,project_id,recipient_user_id,channel,policy,window_key\)/)
  assert.match(worker, /notification_delivery_intents[\s\S]*ON CONFLICT DO NOTHING/)
  assert.doesNotMatch(worker, /learning_notification_|learning_states|learning_evaluations/)
  assert.doesNotMatch(worker, /'PUSH' as const|channel === 'PUSH'/)
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveWakeDispatch } from '../agents/wake-routing.js'

const humanMessage = { authorKind: 'human' as const }
const formalAgentTrigger = { authorKind: 'agent' as const, activation: 'trigger' as const }

test('managed + lingxigraph + server: trusted human input routes straight to the managed executor', () => {
  assert.equal(resolveWakeDispatch({
    reason: 'message.new',
    message: humanMessage,
    hostKind: 'cloud',
    managedAgentExecution: 'server',
    reasoningRuntime: 'lingxigraph',
  }), 'managed-server')

  assert.equal(resolveWakeDispatch({
    reason: 'message.new',
    hostKind: 'cloud',
    managedAgentExecution: 'server',
    reasoningRuntime: 'lingxigraph',
  }), 'queue-only', 'a direct message wake without author/activation context is not trusted')
})

test('managed + explicit pod compatibility mode: an explicit Agent trigger reaches the wake bus', () => {
  assert.equal(resolveWakeDispatch({
    reason: 'message.new',
    message: formalAgentTrigger,
    hostKind: 'cloud',
    managedAgentExecution: 'pod',
    reasoningRuntime: 'lingxigraph',
  }), 'wake-bus')
})

test('managed + server + legacy runtime: an explicit Agent trigger remains on the pod path', () => {
  assert.equal(resolveWakeDispatch({
    reason: 'message.new',
    message: formalAgentTrigger,
    hostKind: 'cloud',
    managedAgentExecution: 'server',
    reasoningRuntime: 'legacy',
  }), 'wake-bus')
})

test('BYOA host: an explicit Agent trigger always reaches the daemon wake bus', () => {
  assert.equal(resolveWakeDispatch({
    reason: 'message.new',
    message: formalAgentTrigger,
    hostKind: 'local',
    managedAgentExecution: 'server',
    reasoningRuntime: 'lingxigraph',
  }), 'wake-bus')

  assert.equal(resolveWakeDispatch({
    reason: 'message.new',
    message: { authorKind: 'agent', activation: 'deliver' },
    hostKind: 'local',
    managedAgentExecution: 'server',
    reasoningRuntime: 'lingxigraph',
  }), 'queue-only', 'ordinary peer delivery remains durable without activating BYOA')
})

test('free-tier unassigned agent: an explicit Agent trigger reaches the managed server executor', () => {
  assert.equal(resolveWakeDispatch({
    reason: 'message.new',
    message: formalAgentTrigger,
    hostKind: null,
    managedAgentExecution: 'server',
    reasoningRuntime: 'lingxigraph',
  }), 'managed-server')
})

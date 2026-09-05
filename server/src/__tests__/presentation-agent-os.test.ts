import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { assertHostActionPermission, PRESENTATION_ACTION_METHODS } from '../agent-os/authorization.js'
import { roleAllowsAction } from '../agent-os/role-policy.js'
import { presentationContextContract } from '../agent-os/runtime.js'
import { IPYTHON_TOOL_NAME, KERNEL_SDK_MODULE } from '../../../third_party/lingxios/src/protocol/constants.js'
import type { AgentWorkItem, HostAction } from '../agent-os/types.js'
import type { Queryable } from '../db/queryable.js'
import { ForbiddenError } from '../modules/access/public.js'

const work: AgentWorkItem = {
  id: 'work', companyId: 'company', authorizationUserId: 'human', agentId: 'agent',
  channelId: 'conversation', triggerClientMsgNo: 'trigger', reason: 'message',
  lane: 'learner', fence: 1, leaseToken: 'lease', executionRole: 'coordinator',
}

function action(name: string): HostAction {
  return {
    runId: work.id, cellId: 'cell', callIndex: 0, action: name,
    args: name === 'presentations.get' ? { presentationId: 'deck' } : {},
    idempotencyKey: `${work.id}:cell:0`,
  }
}

function readOnlyAccessDb(): Queryable {
  return {
    query: async (sql) => {
      if (/FROM users WHERE/.test(sql)) {
        return { rows: [{ id: 'human', deleted_at: null, suspended_at: null }], rowCount: 1 } as never
      }
      if (/FROM conversations WHERE id=\$1/.test(sql)) {
        return { rows: [{
          company_id: 'company', project_id: 'project', created_by: null,
          conversation_members: ['human', 'agent'], leader_id: 'agent', resource_status: null,
        }], rowCount: 1 } as never
      }
      if (/FROM projects WHERE id=\$1/.test(sql)) {
        return { rows: [{
          id: 'project', company_id: 'company', kind: 'TEACHING',
          plan_id: null, status: 'READ_ONLY',
        }], rowCount: 1 } as never
      }
      if (/FROM companies WHERE id=\$1/.test(sql)) {
        return { rows: [{ id: 'company', type: 'PERSONAL', status: 'ACTIVE', plan_id: 'plan' }], rowCount: 1 } as never
      }
      if (/FROM company_memberships/.test(sql)) {
        return { rows: [{ role: 'MEMBER', status: 'ACTIVE' }], rowCount: 1 } as never
      }
      if (/FROM project_memberships/.test(sql)) {
        return { rows: [{ role: 'STUDENT', status: 'ACTIVE' }], rowCount: 1 } as never
      }
      if (/FROM plans WHERE id=\$1/.test(sql)) {
        return { rows: [{ id: 'plan', code: 'PERSONAL_FREE', status: 'ACTIVE' }], rowCount: 1 } as never
      }
      if (/FROM plan_entitlements/.test(sql)) {
        return { rows: [{ code: 'knowledge.core', value: true }], rowCount: 1 } as never
      }
      throw new Error(`unexpected access query: ${sql}`)
    },
  }
}

test('host.presentations is a closed IPython namespace and adds no model-visible tool', () => {
  const kernel = readFileSync(new URL('../../../third_party/lingxios/kernel/runner.py', import.meta.url), 'utf8')
  assert.equal(IPYTHON_TOOL_NAME, 'ipython')
  assert.equal(KERNEL_SDK_MODULE, 'host')
  assert.match(kernel, /SDK_MODULE_NAME = "host"/)
  assert.match(kernel, /class HostBridge/)
  assert.doesNotMatch(kernel, /PRESENTATION_METHODS|DEFAULT_NAMESPACES/)
})

test('presentation Host Actions retain least privilege and explicit outline approval', () => {
  const hostAction = readFileSync(new URL('../agent-os/host-action-application.ts', import.meta.url), 'utf8')
  const actions = readFileSync(new URL('../agent-os/learning-actions.ts', import.meta.url), 'utf8')
  const approvalBlock = actions.slice(actions.indexOf('const APPROVAL_REQUIRED'), actions.indexOf('function record'))
  assert.match(hostAction, /presentations: 'knowledge'/)
  assert.deepEqual([...PRESENTATION_ACTION_METHODS].sort(), [
    'approve_outline', 'cancel', 'create', 'get', 'retry', 'revise', 'revise_outline',
  ])
  assert.equal(roleAllowsAction('verifier', 'presentations.get'), true)
  assert.equal(roleAllowsAction('verifier', 'presentations.create'), false)
  assert.equal(roleAllowsAction('reporter', 'presentations.get'), true)
  assert.equal(roleAllowsAction('reporter', 'presentations.approve_outline'), false)
  assert.match(approvalBlock, /presentations\.approve_outline/)
  assert.doesNotMatch(approvalBlock, /presentations\.create/)
})

test('presentation dispatch delegates every side effect to the public facade', () => {
  const actions = readFileSync(new URL('../agent-os/learning-actions.ts', import.meta.url), 'utf8')
  const block = actions.slice(
    actions.indexOf('async function executePresentation'),
    actions.indexOf('async function executeChat'),
  )
  for (const facade of [
    'createPresentationForAgent', 'getPresentationForAgent',
    'revisePresentationOutlineForAgent', 'approvePresentationOutlineForAgent',
    'revisePresentationForAgent', 'cancelPresentationForAgent', 'retryPresentationForAgent',
  ]) {
    assert.match(block, new RegExp(`\\b${facade}\\b`))
  }
  assert.match(block, /boundedInteger\('targetSlideCount', 3, 40\)/)
  assert.match(block, /feedback or targetSlideCount is required/)
  assert.doesNotMatch(block, /sendMessage|LingxiMessage|directive/)
})

test('presentation prompt permits a shorter deck only after explicit needsAttention acceptance', () => {
  const contract = presentationContextContract()
  assert.match(contract, /revise_outline\(presentationId=.*targetSlideCount=3\.\.40\?\)/)
  assert.match(contract, /below 24 only after the user explicitly accepts/)
  assert.match(contract, /provide feedback, targetSlideCount, or both/)
  assert.match(contract, /never pass an idempotencyKey/)
})

test('presentation get remains readable while mutations use knowledge write authorization', async () => {
  const db = readOnlyAccessDb()
  await assert.doesNotReject(assertHostActionPermission(db, work, action('presentations.get')))
  await assert.rejects(
    assertHostActionPermission(db, work, action('presentations.create')),
    (error) => error instanceof ForbiddenError && error.reason === 'PROJECT_STATE_DENIED',
  )
})

test('unknown presentation actions fail closed before authorization queries', async () => {
  let queried = false
  const db: Queryable = {
    query: async () => {
      queried = true
      throw new Error('authorization query should not run')
    },
  }
  await assert.rejects(
    assertHostActionPermission(db, work, action('presentations.publish')),
    /unsupported presentations action: publish/,
  )
  assert.equal(queried, false)
})

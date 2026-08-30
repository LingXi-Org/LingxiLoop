import { createHash, randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { pool } from '../db/pool.js'
import type { Queryable } from '../db/queryable.js'
import { env } from '../env.js'
import { describeTeacherAction } from '../modules/learning/public.js'
import { assertHostActionPermission } from './authorization.js'
import {
  beginHostAction,
  commitHostAction,
  insertHostAction,
  insertHostApproval,
  insertNoProgressFailure,
  loadActionableWork,
  loadAgentActionScope,
  loadHostAction,
  loadLastSucceededAction,
  loadProgressState,
  lockHostActionExecution,
  markHostActionAwaitingApproval,
  markHostActionPending,
  rollbackHostAction,
  saveHostActionResult,
  unlockHostActionExecution,
  updateWorkProgress,
} from './host-action-repository.js'
import { actionRequiresApproval, executeLearningAction } from './learning-actions.js'
import { roleAllowsAction } from './role-policy.js'
import type { AgentWorkItem, HostAction, HostActionResult } from './types.js'

const ACTION_CAPABILITIES: Record<string, string> = {
  files: 'files',
  documents: 'documents',
  calendar: 'calendar',
  research: 'web',
  canvas: 'canvas',
  email: 'email',
  knowledge: 'knowledge',
  learning: 'learning',
  teacher: 'teacher_admin',
}

const STALL_SENSITIVE_ACTIONS = new Set([
  'canvas.get',
  'canvas.start_workspace',
  'canvas.add_agents',
  'canvas.handoff',
  'learning.start_mission',
  'learning.add_steps',
])

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

async function actionFromLedger(
  client: PoolClient,
  key: string,
  action: HostAction,
): Promise<HostActionResult | null> {
  const row = await loadHostAction(client, key)
  if (!row) return null
  if (row.action !== action.action || canonicalJson(row.args) !== canonicalJson(action.args)) {
    throw new Error('Host Action idempotency key was reused for a different action')
  }
  if (row.status === 'succeeded') {
    const stored = row.result as {
      __hostActionResult?: boolean
      value?: unknown
      directive?: HostActionResult['directive']
    } | null
    return stored?.__hostActionResult
      ? {
        ok: true,
        value: stored.value,
        ...(stored.directive ? { directive: stored.directive } : {}),
      }
      : { ok: true, value: row.result }
  }
  if (row.status === 'failed') return { ok: false, error: row.error ?? 'action failed' }
  if (row.status === 'awaiting_approval' && row.approval_id) {
    return { ok: false, approval: { id: row.approval_id, status: 'PENDING' } }
  }
  return null
}

async function assertActionAllowed(
  client: Queryable,
  work: AgentWorkItem,
  action: HostAction,
): Promise<void> {
  if (!/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(action.action)) {
    throw new Error('invalid Host Action name')
  }
  if (!Number.isInteger(action.callIndex) || action.callIndex < 0) {
    throw new Error('invalid Host Action callIndex')
  }
  if (action.idempotencyKey !== `${action.runId}:${action.cellId}:${action.callIndex}`) {
    throw new Error('invalid Host Action idempotency key')
  }
  if (action.runId !== work.id) {
    throw new Error('Host Action run identity must equal its durable work id')
  }
  if (JSON.stringify(action.args).length > 64 * 1024) {
    throw new Error('Host Action arguments exceed 64 KiB')
  }
  const agent = await loadAgentActionScope(client, work)
  if (!agent) throw new Error('Agent identity is not active in this tenant')
  const namespace = action.action.split('.')[0]
  if (agent.teacher_managed && namespace !== 'teacher' && namespace !== 'turn') {
    throw new Error(`Pulse may only call teacher.* and turn.*; ${action.action} is unavailable`)
  }
  if (!agent.teacher_managed && namespace === 'teacher') {
    throw new Error('teacher.* is reserved for the product-managed Pulse Agent')
  }
  if (agent.teacher_managed && work.executionRole !== 'coordinator') {
    throw new Error('Pulse work must use the coordinator execution role')
  }
  const required = ACTION_CAPABILITIES[namespace]
  if (required && !(agent.capabilities ?? []).includes(required)) {
    throw new Error(`Agent lacks ${required} capability`)
  }
  if (!roleAllowsAction(work.executionRole, action.action)) {
    throw new Error(`${work.executionRole} execution role cannot call ${action.action}`)
  }
}

export async function executeActionWithLedger(
  work: AgentWorkItem,
  action: HostAction,
  approved = false,
): Promise<HostActionResult> {
  await assertActionAllowed(pool, work, action)
  const client = await pool.connect()
  let transactionOpen = false
  try {
    await lockHostActionExecution(client, work, action.idempotencyKey)
    await beginHostAction(client)
    transactionOpen = true
    const actionable = await loadActionableWork(
      client,
      work,
      action,
      approved,
      hash(work.leaseToken),
    )
    if (!actionable) {
      throw Object.assign(new Error('work was stopped or lease was replaced'), { status: 409 })
    }
    const replay = await actionFromLedger(client, action.idempotencyKey, action)
    if (replay && !(approved && replay.approval)) {
      await commitHostAction(client)
      transactionOpen = false
      return replay
    }
    const state = await loadProgressState(client, work)
    const fingerprint = hash(canonicalJson(state))
    const lastAction = await loadLastSucceededAction(client, work.id)
    const repeated = actionable.progress_fingerprint === fingerprint
      && lastAction?.action === action.action
      && canonicalJson(lastAction.args) === canonicalJson(action.args)
    const noProgressCount = repeated ? Number(actionable.no_progress_count ?? 0) + 1 : 0
    await updateWorkProgress(client, work.id, fingerprint, noProgressCount)
    if (noProgressCount >= 2 && STALL_SENSITIVE_ACTIONS.has(action.action)) {
      const error = noProgressCount >= 3
        ? `no-progress guard blocked repeated ${action.action}: synthesize persisted reports, state the unresolved gap, or ask one focused learner question`
        : `no-progress warning for repeated ${action.action}: no durable Mission, assignment, report, or evidence state changed`
      await insertNoProgressFailure(client, work.id, action, error)
      await commitHostAction(client)
      transactionOpen = false
      return { ok: false, error }
    }
    await assertHostActionPermission(client, work, action)
    await insertHostAction(client, work.id, action)
    if (!approved && actionRequiresApproval(action.action)) {
      const teacherApproval = await describeTeacherAction(work, action, client)
      await insertHostApproval(client, {
        approvalId: randomUUID(),
        work,
        action,
        summary: teacherApproval?.summary ?? `${work.agentId} requests ${action.action}`,
        requestedBy: teacherApproval?.requestedBy ?? null,
        scope: teacherApproval?.scope ?? {},
        preview: teacherApproval?.preview ?? {},
        ttlMs: env.AGENT_OS_APPROVAL_TTL_MS,
      })
      const approvalId = await markHostActionAwaitingApproval(client, action.idempotencyKey)
      await commitHostAction(client)
      transactionOpen = false
      return { ok: false, approval: { id: approvalId, status: 'PENDING' } }
    }
    await markHostActionPending(client, action.idempotencyKey)
    await commitHostAction(client)
    transactionOpen = false

    let result: HostActionResult
    try {
      result = await executeLearningAction(work, action)
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
    await saveHostActionResult(client, action.idempotencyKey, result)
    return result
  } catch (error) {
    if (transactionOpen) await rollbackHostAction(client)
    throw error
  } finally {
    await unlockHostActionExecution(client, work, action.idempotencyKey)
    client.release()
  }
}

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import {
  UserComputerService,
  type ExecOptions,
  type ExecResult,
  type SandboxRuntime,
} from '../agents/computer/user-computer.js'
import { pool } from '../db/pool.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, teardownAll } from './_helpers.js'

class FakeRuntime implements SandboxRuntime {
  readonly capabilities = {
    persistentVolumes: true, pauseResume: false, snapshots: false,
    networkPolicy: false, credentialBroker: true, secureRuntime: true,
  }
  execCalls: Array<{ command: string[]; options?: ExecOptions }> = []
  failWrite = false
  async health() {}
  async create() { return { id: 'runtime-1', runtimeRef: 'runtime-1' } }
  async start() {}
  async stop() {}
  async destroy() {}
  async exec(_runtimeRef: string, command: string[], options?: ExecOptions): Promise<ExecResult> {
    this.execCalls.push({ command, options })
    return { exitCode: 0, stdout: command[0] === 'curl' ? '{}' : 'ok', stderr: '' }
  }
  async readFile() { return new Uint8Array() }
  async writeFile() { if (this.failWrite) throw new Error('injected write failure') }
  async exposeService() { return { providerRef: 'runtime-1:1', port: 1 } }
}

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => { await resetAllTables() })
after(async () => { await teardownAll() })

async function seedComputer() {
  const { companyId, agentId: agentA } = await seedCompanyWithAgent()
  const agentB = `a-${randomUUID().slice(0, 8)}`
  await pool.query(
    `INSERT INTO participants (id, company_id, kind, name, role, initial, avatar_bg, status)
     VALUES ($1,$2,'agent','Agent B','tester','B','#abcdef','avail')`, [agentB, companyId],
  )
  const computerId = `computer-${randomUUID()}`
  const userId = `user-${randomUUID()}`
  await pool.query(
    `INSERT INTO user_computers (id,user_id,company_id,runtime_ref,status)
     VALUES ($1,$2,$3,'runtime-1','running')`, [computerId, userId, companyId],
  )
  const screenA = `screen-${randomUUID()}`
  const screenB = `screen-${randomUUID()}`
  await pool.query(
    `INSERT INTO computer_screens (id,computer_id,agent_id,session_ref,display_ref)
     VALUES ($1,$3,$4,'session-a',':11'),($2,$3,$5,'session-b',':12')`,
    [screenA, screenB, computerId, agentA, agentB],
  )
  return { companyId, agentA, agentB, computerId, userId, screenA, screenB }
}

test('[integration] operation lease conflicts, then releases cleanly after failure', async () => {
  const ids = await seedComputer()
  const runtime = new FakeRuntime()
  runtime.failWrite = true
  const service = new UserComputerService(runtime)
  await assert.rejects(() => service.writeFileForAgent({
    companyId: ids.companyId, agentId: ids.agentA, screenId: ids.screenA,
    path: '/workspace/failure.txt', content: 'x',
  }), /injected write failure/)
  const afterFailure = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM resource_leases
      WHERE computer_id = $1 AND resource_type = 'file-operation'`, [ids.computerId],
  )
  assert.equal(afterFailure.rows[0].count, '0', 'finally must release a failed write lease')

  const held = await service.acquireLease({
    computerId: ids.computerId, resourceType: 'browser-operation', resourceId: 'target-1',
    holderType: 'agent', holderId: ids.agentA,
  })
  await assert.rejects(() => service.acquireLease({
    computerId: ids.computerId, resourceType: 'browser-operation', resourceId: 'target-1',
    holderType: 'agent', holderId: ids.agentB,
  }), /controlled by/)
  await service.releaseLease(held.id)
  await service.acquireLease({
    computerId: ids.computerId, resourceType: 'browser-operation', resourceId: 'target-1',
    holderType: 'agent', holderId: ids.agentB,
  })
})

test('[integration] takeover pauses only one screen GUI while shell/files and another screen continue', async () => {
  const ids = await seedComputer()
  const runtime = new FakeRuntime()
  const service = new UserComputerService(runtime)
  await service.acquireLease({
    computerId: ids.computerId, resourceType: 'screen', resourceId: ids.screenA,
    holderType: 'agent', holderId: ids.agentA,
  })
  await service.acquireLease({
    computerId: ids.computerId, resourceType: 'screen', resourceId: ids.screenB,
    holderType: 'agent', holderId: ids.agentB,
  })
  await service.takeover(ids.userId, ids.companyId, ids.screenA)

  const shell = await service.execForAgent({
    companyId: ids.companyId, agentId: ids.agentA, screenId: ids.screenA,
    command: ['rg', 'needle', '/workspace'],
  })
  assert.equal(shell.exitCode, 0)
  assert.equal(runtime.execCalls.at(-1)?.options?.user?.startsWith('agent_'), true, 'agent commands must run as a non-root runtime user')

  await pool.query(
    `INSERT INTO browser_targets (id,computer_id,screen_id,agent_id,target_ref)
     VALUES ('target-a',$1,$2,$3,'cdp-a'),('target-b',$1,$4,$5,'cdp-b')`,
    [ids.computerId, ids.screenA, ids.agentA, ids.screenB, ids.agentB],
  )
  await assert.rejects(() => service.browserInputForAgent({
    companyId: ids.companyId, agentId: ids.agentA, targetId: 'target-a',
    input: { type: 'text', text: 'blocked GUI' },
  }), /controlled by human/)
  await service.browserInputForAgent({
    companyId: ids.companyId, agentId: ids.agentB, targetId: 'target-b',
    input: { type: 'text', text: 'independent screen works' },
  })
})

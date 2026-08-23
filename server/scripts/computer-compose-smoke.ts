/** Compose smoke for the public Computer API and the isolated runtime manager. */
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { createSession } from '../src/auth.js'
import { HttpSandboxRuntime } from '../src/agents/computer/user-computer.js'
import { pool } from '../src/db/pool.js'

const BASE_URL = process.env.MVP_SMOKE_BASE_URL ?? 'http://localhost:5181'
const STATE_FILE = '/tmp/lingxiloop-computer-compose-smoke.json'

interface State { companyId: string; userId: string; agentId: string; screenId: string; token: string }

async function api(path: string, state: Pick<State, 'companyId' | 'token'>, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE_URL}/api${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${state.token}`,
      'x-company-id': state.companyId,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  })
}

async function json<T>(path: string, state: Pick<State, 'companyId' | 'token'>, init: RequestInit = {}): Promise<T> {
  const response = await api(path, state, init)
  const body = await response.text()
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} returned ${response.status}: ${body}`)
  return JSON.parse(body) as T
}

async function screenshot(state: State): Promise<void> {
  const deadline = Date.now() + 30_000
  let detail = ''
  while (Date.now() < deadline) {
    const response = await api(`/computer/screens/${state.screenId}/screenshot`, state).catch(() => null)
    if (response?.ok) {
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (response.headers.get('content-type')?.startsWith('image/png') && bytes.byteLength > 100) return
      detail = `invalid PNG (${bytes.byteLength} bytes)`
    } else if (response) detail = `${response.status}: ${await response.text()}`
    await new Promise((resolve) => setTimeout(resolve, 750))
  }
  throw new Error(`screen did not produce a screenshot: ${detail}`)
}

async function seed(): Promise<State> {
  const suffix = randomUUID().slice(0, 8)
  const state = {
    companyId: `co-computer-compose-${suffix}`,
    userId: `u-computer-compose-${suffix}`,
    agentId: `a-computer-compose-${suffix}`,
    screenId: '', token: '',
  }
  await pool.query(
    `INSERT INTO users (id,email,display_name,email_verified_at,is_admin,tier)
     VALUES ($1,$2,'Computer Compose Smoke',NOW(),FALSE,'pro')`,
    [state.userId, `${state.userId}@example.invalid`],
  )
  await pool.query(
    `INSERT INTO companies (id,name,slug,owner_user_id) VALUES ($1,'Computer Compose Smoke',$2,$3)`,
    [state.companyId, `computer-compose-${suffix}`, state.userId],
  )
  await pool.query(`INSERT INTO company_members (company_id,user_id,role) VALUES ($1,$2,'owner')`, [state.companyId, state.userId])
  await pool.query(
    `INSERT INTO participants (id,company_id,kind,name,role,initial,avatar_bg,status,capabilities)
     VALUES ($1,$3,'human','Computer Smoke User','owner','U','#0078c8','avail','[]'::jsonb),
            ($2,$3,'agent','Computer Smoke Agent','coach','A','#6d5dfc','avail','["computer"]'::jsonb)`,
    [state.userId, state.agentId, state.companyId],
  )
  state.token = (await createSession(state.userId, { ua: 'computer-compose-smoke' })).token
  return state
}

async function firstRun(): Promise<void> {
  const state = await seed()
  const started = await json<{ status: string }>('/computer/start', state, { method: 'POST' })
  if (started.status !== 'running') throw new Error(`Computer start ended in ${started.status}`)
  const screen = await json<{ id: string; controller: { type: string; id: string } | null }>('/computer/screens', state, {
    method: 'POST', body: JSON.stringify({ agentId: state.agentId }),
  })
  state.screenId = screen.id
  if (screen.controller?.type !== 'agent' || screen.controller.id !== state.agentId) throw new Error('screen did not start under Agent control')
  await screenshot(state)
  const taken = await json<{ status: string; controller: { type: string; id: string } | null }>(`/computer/screens/${state.screenId}/takeover`, state, { method: 'POST' })
  if (taken.status !== 'human_control' || taken.controller?.id !== state.userId) throw new Error('human takeover was not persisted')
  await writeFile(STATE_FILE, JSON.stringify(state), 'utf8')
  console.log(`PASS Computer API start/screenshot/takeover: ${state.screenId}`)
}

async function verifyRestart(): Promise<void> {
  const state = JSON.parse(await readFile(STATE_FILE, 'utf8')) as State
  const computer = await json<{ status: string; screens: Array<{ id: string }> }>('/computer', state)
  if (computer.status !== 'running' || !computer.screens.some((screen) => screen.id === state.screenId)) {
    throw new Error('Computer state did not survive API restart')
  }
  await screenshot(state)
  await json(`/computer/screens/${state.screenId}/return`, state, { method: 'POST' })
  await json('/computer/stop', state, { method: 'POST' })
  const { rows } = await pool.query<{ runtime_ref: string }>(`SELECT runtime_ref FROM user_computers WHERE user_id=$1`, [state.userId])
  const runtimeRef = rows[0]?.runtime_ref
  if (runtimeRef) {
    const manager = new HttpSandboxRuntime(
      process.env.LINGXILOOP_COMPUTER_RUNTIME_URL ?? 'http://computer-runtime:5195',
      process.env.COMPUTER_RUNTIME_SERVICE_TOKEN ?? '',
    )
    await manager.destroy(runtimeRef)
  }
  await pool.query(`DELETE FROM companies WHERE id=$1`, [state.companyId])
  await pool.query(`DELETE FROM users WHERE id=$1`, [state.userId])
  console.log(`PASS Computer state/screenshot after API restart: ${state.screenId}`)
}

(process.argv.includes('--verify-restart') ? verifyRestart() : firstRun())
  .catch((error) => { console.error('FAIL Computer Compose smoke:', error); process.exitCode = 1 })
  .finally(async () => { await pool.end() })

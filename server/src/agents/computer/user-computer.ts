import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile as readLocalFile, rm, writeFile as writeLocalFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { pool } from '../../db/pool.js'

const execFileAsync = promisify(execFile)

export interface SandboxHandle { id: string; runtimeRef: string }
export interface ExecOptions { cwd?: string; env?: Record<string, string>; timeoutMs?: number; user?: string }
export interface ExecResult { exitCode: number; stdout: string; stderr: string }
export interface ServiceEndpoint { providerRef: string; port: number }
export interface SandboxRuntimeCapabilities {
  persistentVolumes: boolean
  pauseResume: boolean
  snapshots: boolean
  networkPolicy: boolean
  credentialBroker: boolean
  secureRuntime: boolean
}

/** Infrastructure-only contract. Product ids never cross this boundary. */
export interface SandboxRuntime {
  readonly capabilities: SandboxRuntimeCapabilities
  health(): Promise<void>
  create(input: { businessId: string; imageVersion: string }): Promise<SandboxHandle>
  start(runtimeRef: string): Promise<void>
  stop(runtimeRef: string): Promise<void>
  destroy(runtimeRef: string): Promise<void>
  exec(runtimeRef: string, command: string[], options?: ExecOptions): Promise<ExecResult>
  readFile(runtimeRef: string, path: string): Promise<Uint8Array>
  writeFile(runtimeRef: string, path: string, data: Uint8Array): Promise<void>
  exposeService(runtimeRef: string, port: number): Promise<ServiceEndpoint>
}

function safeRuntimeToken(value: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) throw new Error('invalid runtime reference')
  return value
}

function agentRuntimeUser(agentId: string): string {
  return `agent_${createHash('sha256').update(agentId).digest('hex').slice(0, 16)}`
}

/** Native Docker MVP provider. It owns only lifecycle/exec/files/volumes. */
export class NativeDockerSandboxRuntime implements SandboxRuntime {
  readonly capabilities: SandboxRuntimeCapabilities = {
    persistentVolumes: true,
    pauseResume: false,
    snapshots: false,
    networkPolicy: false,
    credentialBroker: true,
    secureRuntime: true,
  }

  constructor(
    private readonly dockerBin = process.env.LINGXILOOP_DOCKER_BIN ?? 'docker',
    private readonly image = process.env.LINGXILOOP_USER_COMPUTER_IMAGE ?? 'ghcr.io/lingxi-org/lingxiloop-user-computer:dev',
  ) {}

  private async docker(args: string[], timeoutMs = 60_000): Promise<{ stdout: string; stderr: string }> {
    try {
      return await execFileAsync(this.dockerBin, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 })
    } catch (error) {
      const cause = error as { code?: string; message?: string }
      if (cause.code === 'ENOENT') throw new Error('trusted-host Docker provider is unavailable: Docker CLI was not found')
      throw error
    }
  }

  async health(): Promise<void> { await this.docker(['version', '--format', '{{.Server.Version}}'], 10_000) }

  async create(input: { businessId: string; imageVersion: string }): Promise<SandboxHandle> {
    const suffix = input.businessId.replace(/[^a-zA-Z0-9_.-]/g, '-').slice(-48)
    const runtimeRef = safeRuntimeToken(`lingxiloop-user-${suffix}`)
    const volumePrefix = runtimeRef
    const inspect = await this.docker(['container', 'inspect', runtimeRef]).then(() => true).catch(() => false)
    if (!inspect) {
      await this.docker([
        'create', '--name', runtimeRef,
        '--label', `cn.lingxiloop.computer=${input.businessId}`,
        '--label', `cn.lingxiloop.image-version=${input.imageVersion}`,
        '--shm-size', '1g',
        '-v', `${volumePrefix}-home:/home/lingxi`,
        '-v', `${volumePrefix}-workspace:/workspace`,
        '-v', `${volumePrefix}-documents:/documents`,
        '-v', `${volumePrefix}-downloads:/downloads`,
        this.image,
      ], 120_000)
    }
    return { id: runtimeRef, runtimeRef }
  }

  async start(runtimeRef: string): Promise<void> {
    await this.docker(['start', safeRuntimeToken(runtimeRef)])
  }

  async stop(runtimeRef: string): Promise<void> {
    await this.docker(['stop', '--time', '15', safeRuntimeToken(runtimeRef)])
  }

  async destroy(runtimeRef: string): Promise<void> {
    const safeRef = safeRuntimeToken(runtimeRef)
    await this.docker(['rm', '--force', safeRef]).catch((error) => {
      if (!String(error).includes('No such container')) throw error
    })
    for (const suffix of ['home', 'workspace', 'documents', 'downloads']) {
      await this.docker(['volume', 'rm', `${safeRef}-${suffix}`]).catch((error) => {
        if (!String(error).includes('no such volume')) throw error
      })
    }
  }

  async exec(runtimeRef: string, command: string[], options: ExecOptions = {}): Promise<ExecResult> {
    if (command.length === 0) throw new Error('command cannot be empty')
    const args = ['exec']
    if (options.user) {
      if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(options.user)) throw new Error('invalid runtime user')
      args.push('--user', options.user)
    }
    if (options.cwd) args.push('--workdir', options.cwd)
    for (const [key, value] of Object.entries(options.env ?? {})) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`invalid environment key: ${key}`)
      args.push('--env', `${key}=${value}`)
    }
    args.push(safeRuntimeToken(runtimeRef), ...command)
    try {
      const out = await this.docker(args, options.timeoutMs ?? 60_000)
      return { exitCode: 0, stdout: out.stdout, stderr: out.stderr }
    } catch (error) {
      const e = error as { code?: number; stdout?: string; stderr?: string; message?: string }
      return { exitCode: typeof e.code === 'number' ? e.code : 1, stdout: e.stdout ?? '', stderr: e.stderr ?? e.message ?? String(error) }
    }
  }

  async readFile(runtimeRef: string, path: string): Promise<Uint8Array> {
    const tempRoot = await mkdtemp(join(tmpdir(), 'lingxiloop-computer-read-'))
    const target = join(tempRoot, 'payload')
    try {
      await this.docker(['cp', `${safeRuntimeToken(runtimeRef)}:${path}`, target])
      return new Uint8Array(await readLocalFile(target))
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  }

  async writeFile(runtimeRef: string, path: string, data: Uint8Array): Promise<void> {
    const tempRoot = await mkdtemp(join(tmpdir(), 'lingxiloop-computer-write-'))
    const source = join(tempRoot, 'payload')
    try {
      await writeLocalFile(source, data)
      await this.docker(['cp', source, `${safeRuntimeToken(runtimeRef)}:${path}`])
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  }

  async exposeService(runtimeRef: string, port: number): Promise<ServiceEndpoint> {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid service port')
    return { providerRef: `${safeRuntimeToken(runtimeRef)}:${port}`, port }
  }
}

/** Narrow internal HTTP client. The API never needs Docker CLI/socket access. */
export class HttpSandboxRuntime implements SandboxRuntime {
  readonly capabilities: SandboxRuntimeCapabilities = {
    persistentVolumes: true,
    pauseResume: false,
    snapshots: false,
    networkPolicy: false,
    credentialBroker: true,
    secureRuntime: true,
  }

  constructor(
    private readonly baseUrl: string,
    private readonly serviceToken: string,
  ) {
    if (!baseUrl.trim()) throw new Error('Computer Runtime Manager URL is required')
    if (!serviceToken.trim()) throw new Error('Computer Runtime Manager service token is required')
  }

  private async request<T>(operation: string, body: Record<string, unknown> = {}): Promise<T> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/v1/${operation}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.serviceToken}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      })
    } catch (error) {
      throw new Error(`Computer Runtime Manager is unavailable: ${error instanceof Error ? error.message : String(error)}`)
    }
    const text = await response.text()
    if (!response.ok) throw new Error(`Computer Runtime Manager ${operation} failed (${response.status}): ${text.slice(0, 500)}`)
    try { return JSON.parse(text) as T } catch { throw new Error(`Computer Runtime Manager ${operation} returned invalid JSON`) }
  }

  async health(): Promise<void> { await this.request('health') }
  create(input: { businessId: string; imageVersion: string }): Promise<SandboxHandle> { return this.request('create', input) }
  start(runtimeRef: string): Promise<void> { return this.request('start', { runtimeRef }).then(() => undefined) }
  stop(runtimeRef: string): Promise<void> { return this.request('stop', { runtimeRef }).then(() => undefined) }
  destroy(runtimeRef: string): Promise<void> { return this.request('destroy', { runtimeRef }).then(() => undefined) }
  exec(runtimeRef: string, command: string[], options?: ExecOptions): Promise<ExecResult> {
    return this.request('exec', { runtimeRef, command, options: options ?? {} })
  }
  async readFile(runtimeRef: string, path: string): Promise<Uint8Array> {
    const value = await this.request<{ data: string }>('read-file', { runtimeRef, path })
    return new Uint8Array(Buffer.from(value.data, 'base64'))
  }
  writeFile(runtimeRef: string, path: string, data: Uint8Array): Promise<void> {
    return this.request('write-file', { runtimeRef, path, data: Buffer.from(data).toString('base64') }).then(() => undefined)
  }
  exposeService(runtimeRef: string, port: number): Promise<ServiceEndpoint> { return this.request('expose-service', { runtimeRef, port }) }
}

class UnavailableSandboxRuntime implements SandboxRuntime {
  readonly capabilities: SandboxRuntimeCapabilities = {
    persistentVolumes: false, pauseResume: false, snapshots: false,
    networkPolicy: false, credentialBroker: false, secureRuntime: false,
  }
  private unavailable(): never { throw new Error('Computer Runtime Manager is not configured') }
  async health(): Promise<void> { this.unavailable() }
  async create(): Promise<SandboxHandle> { return this.unavailable() }
  async start(): Promise<void> { this.unavailable() }
  async stop(): Promise<void> { this.unavailable() }
  async destroy(): Promise<void> { this.unavailable() }
  async exec(): Promise<ExecResult> { return this.unavailable() }
  async readFile(): Promise<Uint8Array> { return this.unavailable() }
  async writeFile(): Promise<void> { this.unavailable() }
  async exposeService(): Promise<ServiceEndpoint> { return this.unavailable() }
}

export function createSandboxRuntime(): SandboxRuntime {
  const managerUrl = process.env.LINGXILOOP_COMPUTER_RUNTIME_URL?.trim()
  if (managerUrl) return new HttpSandboxRuntime(managerUrl, process.env.COMPUTER_RUNTIME_SERVICE_TOKEN ?? '')
  if (process.env.LINGXILOOP_COMPUTER_RUNTIME === 'trusted-host-docker' || process.env.NODE_ENV !== 'production') {
    return new NativeDockerSandboxRuntime()
  }
  return new UnavailableSandboxRuntime()
}

export type UserComputerStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error'
export type ScreenStatus = 'idle' | 'working' | 'waiting' | 'human_control'

export interface UserComputerRecord {
  id: string
  userId: string
  companyId: string
  runtimeType: string
  status: UserComputerStatus
  imageVersion: string
  createdAt: string
  lastActiveAt: string
}

export interface AgentScreenRecord {
  id: string
  computerId: string
  agentId: string
  agentName: string
  status: ScreenStatus
  controller: { type: 'agent' | 'human'; id: string } | null
  createdAt: string
  updatedAt: string
}

const COMPUTER_SELECT = `SELECT id, user_id AS "userId", company_id AS "companyId",
  runtime_type AS "runtimeType", status, image_version AS "imageVersion",
  created_at AS "createdAt", last_active_at AS "lastActiveAt"
  FROM user_computers`

async function recordComputerEvent(args: {
  computerId: string; screenId?: string | null; agentId?: string | null; type: string; payload?: Record<string, unknown>
}): Promise<void> {
  await pool.query(
    `INSERT INTO computer_events (id, computer_id, screen_id, agent_id, type, payload)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [`ce-${randomUUID()}`, args.computerId, args.screenId ?? null, args.agentId ?? null, args.type, JSON.stringify(args.payload ?? {})],
  )
}

export class UserComputerService {
  constructor(private readonly runtime: SandboxRuntime = new NativeDockerSandboxRuntime()) {}

  private async browserBroker(runtimeRef: string, endpoint: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!/^\/targets\/(?:create|navigate|screenshot|input|close)$/.test(endpoint) && endpoint !== '/health') {
      throw new Error('invalid browser broker endpoint')
    }
    const result = await this.runtime.exec(runtimeRef, [
      'curl', '--fail', '--silent', '--show-error',
      '--unix-socket', '/run/lingxi/browser.sock',
      '-X', 'POST', '-H', 'content-type: application/json',
      '--data-binary', JSON.stringify(payload),
      `http://localhost${endpoint}`,
    ], { timeoutMs: 20_000 })
    if (result.exitCode !== 0) throw new Error(result.stderr || 'browser broker request failed')
    try { return JSON.parse(result.stdout) as Record<string, unknown> } catch { throw new Error('browser broker returned invalid data') }
  }

  private async requireAgentGuiControl(computerId: string, screenId: string, agentId: string): Promise<void> {
    await this.acquireLease({
      computerId, resourceType: 'screen', resourceId: screenId,
      holderType: 'agent', holderId: agentId, ttlMs: 120_000,
    })
  }

  private async captureScreen(runtimeRef: string, displayRef: string, screenId: string): Promise<Uint8Array> {
    const activeTarget = await pool.query<{ target_ref: string }>(
      `SELECT target_ref FROM browser_targets
        WHERE screen_id = $1 AND status = 'open'
        ORDER BY updated_at DESC, created_at DESC LIMIT 1`, [screenId],
    )
    const targetRef = activeTarget.rows[0]?.target_ref
    if (targetRef) {
      const captured = await this.browserBroker(runtimeRef, '/targets/screenshot', { targetId: targetRef })
      if (typeof captured.data !== 'string') throw new Error('browser broker returned an invalid screenshot')
      return new Uint8Array(Buffer.from(captured.data, 'base64'))
    }
    const file = `/tmp/${safeRuntimeToken(screenId)}.png`
    const capture = await this.runtime.exec(runtimeRef, ['scrot', '--display', displayRef, file], { timeoutMs: 15_000 })
    if (capture.exitCode !== 0) throw new Error(`screenshot failed: ${capture.stderr}`)
    try { return await this.runtime.readFile(runtimeRef, file) }
    finally { await this.runtime.exec(runtimeRef, ['rm', '-f', file]).catch(() => undefined) }
  }

  async ensure(userId: string, companyId: string): Promise<UserComputerRecord> {
    const { rows } = await pool.query<UserComputerRecord>(
      `${COMPUTER_SELECT} WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1`, [userId],
    )
    if (rows[0]) {
      if (rows[0].companyId !== companyId) {
        const moved = await pool.query<UserComputerRecord>(
          `UPDATE user_computers SET company_id = $2, last_active_at = NOW()
           WHERE id = $1 RETURNING id, user_id AS "userId", company_id AS "companyId",
           runtime_type AS "runtimeType", status, image_version AS "imageVersion",
           created_at AS "createdAt", last_active_at AS "lastActiveAt"`,
          [rows[0].id, companyId],
        )
        return moved.rows[0]
      }
      return rows[0]
    }
    const id = `computer-${randomUUID()}`
    const inserted = await pool.query<UserComputerRecord>(
      `INSERT INTO user_computers (id, user_id, company_id)
       VALUES ($1,$2,$3)
       ON CONFLICT (user_id) WHERE deleted_at IS NULL DO UPDATE SET last_active_at = NOW()
       RETURNING id, user_id AS "userId", company_id AS "companyId",
         runtime_type AS "runtimeType", status, image_version AS "imageVersion",
         created_at AS "createdAt", last_active_at AS "lastActiveAt"`,
      [id, userId, companyId],
    )
    await recordComputerEvent({ computerId: inserted.rows[0].id, type: 'computer.created' })
    return inserted.rows[0]
  }

  async get(userId: string, companyId: string): Promise<UserComputerRecord & { screens: AgentScreenRecord[]; capabilities: SandboxRuntimeCapabilities }> {
    const computer = await this.ensure(userId, companyId)
    return { ...computer, screens: await this.listScreens(computer.id), capabilities: this.runtime.capabilities }
  }

  async start(userId: string, companyId: string): Promise<UserComputerRecord> {
    const computer = await this.ensure(userId, companyId)
    await this.runtime.health()
    await pool.query(`UPDATE user_computers SET status = 'starting', last_active_at = NOW() WHERE id = $1`, [computer.id])
    try {
      const current = await pool.query<{ runtime_ref: string | null }>(`SELECT runtime_ref FROM user_computers WHERE id = $1`, [computer.id])
      let runtimeRef = current.rows[0]?.runtime_ref ?? null
      if (!runtimeRef) {
        const handle = await this.runtime.create({ businessId: computer.id, imageVersion: computer.imageVersion })
        runtimeRef = handle.runtimeRef
        await pool.query(`UPDATE user_computers SET runtime_ref = $2 WHERE id = $1`, [computer.id, runtimeRef])
      }
      await this.runtime.start(runtimeRef)
      const existingScreens = await pool.query<{ id: string; agent_id: string; display_ref: string }>(
        `SELECT id, agent_id, display_ref FROM computer_screens WHERE computer_id = $1 ORDER BY created_at`,
        [computer.id],
      )
      for (const screen of existingScreens.rows) {
        await this.launchScreenSession(runtimeRef, screen.id, screen.agent_id, screen.display_ref)
        await this.ensureAgentControlLease(computer.id, screen.id, screen.agent_id)
      }
      const updated = await pool.query<UserComputerRecord>(
        `UPDATE user_computers SET status = 'running', last_active_at = NOW() WHERE id = $1
         RETURNING id, user_id AS "userId", company_id AS "companyId", runtime_type AS "runtimeType",
           status, image_version AS "imageVersion", created_at AS "createdAt", last_active_at AS "lastActiveAt"`, [computer.id],
      )
      await recordComputerEvent({ computerId: computer.id, type: 'computer.started' })
      return updated.rows[0]
    } catch (error) {
      await pool.query(`UPDATE user_computers SET status = 'error', last_active_at = NOW() WHERE id = $1`, [computer.id])
      await recordComputerEvent({ computerId: computer.id, type: 'computer.start_failed', payload: { error: error instanceof Error ? error.message : String(error) } })
      throw error
    }
  }

  async stop(userId: string, companyId: string): Promise<UserComputerRecord> {
    const computer = await this.ensure(userId, companyId)
    const { rows } = await pool.query<{ runtime_ref: string | null }>(`SELECT runtime_ref FROM user_computers WHERE id = $1`, [computer.id])
    await pool.query(`UPDATE user_computers SET status = 'stopping' WHERE id = $1`, [computer.id])
    if (rows[0]?.runtime_ref) await this.runtime.stop(rows[0].runtime_ref)
    const updated = await pool.query<UserComputerRecord>(
      `UPDATE user_computers SET status = 'stopped', last_active_at = NOW() WHERE id = $1
       RETURNING id, user_id AS "userId", company_id AS "companyId", runtime_type AS "runtimeType",
         status, image_version AS "imageVersion", created_at AS "createdAt", last_active_at AS "lastActiveAt"`, [computer.id],
    )
    await recordComputerEvent({ computerId: computer.id, type: 'computer.stopped' })
    return updated.rows[0]
  }

  async listScreens(computerId: string): Promise<AgentScreenRecord[]> {
    // A crashed/expired human controller must never leave the DB presenting a
    // stale takeover. Reconcile each Screen independently so another Screen's
    // agent controller remains untouched.
    await pool.query(
      `UPDATE computer_screens s SET status = 'working', updated_at = NOW()
       WHERE s.computer_id = $1 AND s.status = 'human_control'
         AND NOT EXISTS (
           SELECT 1 FROM resource_leases l
            WHERE l.computer_id = s.computer_id AND l.resource_type = 'screen'
              AND l.resource_id = s.id AND l.holder_type = 'human' AND l.expires_at > NOW()
        )`, [computerId],
    )
    const missingAgentControllers = await pool.query<{ id: string; agent_id: string }>(
      `SELECT s.id, s.agent_id FROM computer_screens s
        WHERE s.computer_id = $1 AND s.status <> 'human_control'
          AND NOT EXISTS (
            SELECT 1 FROM resource_leases l
             WHERE l.computer_id = s.computer_id AND l.resource_type = 'screen'
               AND l.resource_id = s.id AND l.expires_at > NOW()
          )`, [computerId],
    )
    for (const screen of missingAgentControllers.rows) {
      await this.acquireLease({
        computerId, resourceType: 'screen', resourceId: screen.id,
        holderType: 'agent', holderId: screen.agent_id, ttlMs: 120_000,
      })
    }
    const { rows } = await pool.query<AgentScreenRecord>(
      `SELECT s.id, s.computer_id AS "computerId", s.agent_id AS "agentId",
         COALESCE(p.name, s.agent_id) AS "agentName", s.status,
         CASE WHEN l.id IS NULL THEN NULL ELSE jsonb_build_object('type', l.holder_type, 'id', l.holder_id) END AS controller,
         s.created_at AS "createdAt", s.updated_at AS "updatedAt"
       FROM computer_screens s
       LEFT JOIN participants p ON p.id = s.agent_id
       LEFT JOIN LATERAL (
         SELECT id, holder_type, holder_id FROM resource_leases
          WHERE computer_id = s.computer_id AND resource_type = 'screen'
            AND resource_id = s.id AND expires_at > NOW()
          ORDER BY expires_at DESC LIMIT 1
       ) l ON TRUE
       WHERE s.computer_id = $1 ORDER BY s.created_at`, [computerId],
    )
    return rows
  }

  async listBrowserTargets(userId: string, companyId: string): Promise<Array<{
    id: string; screenId: string | null; agentId: string; agentName: string; status: string; private: boolean; createdAt: string
  }>> {
    const computer = await this.ensure(userId, companyId)
    const { rows } = await pool.query<{
      id: string; screenId: string | null; agentId: string; agentName: string; status: string; private: boolean; createdAt: string
    }>(
      `SELECT t.id, t.screen_id AS "screenId", t.agent_id AS "agentId",
         COALESCE(p.name, t.agent_id) AS "agentName", t.status, t.private,
         t.created_at AS "createdAt"
       FROM browser_targets t
       LEFT JOIN participants p ON p.id = t.agent_id AND p.company_id = $2
       WHERE t.computer_id = $1 ORDER BY t.created_at DESC`, [computer.id, companyId],
    )
    return rows
  }

  async listBrowserTargetsForAgent(args: { companyId: string; agentId: string; screenId: string }): Promise<Array<{
    id: string; screenId: string | null; status: string; private: boolean; createdAt: string
  }>> {
    const screen = await this.requireAgentScreen(args.companyId, args.agentId, args.screenId)
    const { rows } = await pool.query<{
      id: string; screenId: string | null; status: string; private: boolean; createdAt: string
    }>(
      `SELECT id, screen_id AS "screenId", status, private, created_at AS "createdAt"
       FROM browser_targets
       WHERE computer_id = $1 AND screen_id = $2 AND agent_id = $3 AND status = 'open'
       ORDER BY created_at DESC`, [screen.computerId, args.screenId, args.agentId],
    )
    return rows
  }

  async registerBrowserTarget(args: {
    userId: string; companyId: string; screenId: string; agentId: string; targetRef: string; private?: boolean
  }): Promise<{ id: string }> {
    const computer = await this.ensure(args.userId, args.companyId)
    const gate = await pool.query(
      `SELECT 1 FROM computer_screens WHERE id = $1 AND computer_id = $2 AND agent_id = $3 LIMIT 1`,
      [args.screenId, computer.id, args.agentId],
    )
    if (!gate.rows[0]) throw new Error('browser target owner must match the screen owner')
    const id = `target-${randomUUID()}`
    await pool.query(
      `INSERT INTO browser_targets (id, computer_id, screen_id, agent_id, target_ref, private)
       VALUES ($1,$2,$3,$4,$5,$6)`, [id, computer.id, args.screenId, args.agentId, args.targetRef, args.private ?? false],
    )
    await recordComputerEvent({ computerId: computer.id, screenId: args.screenId, agentId: args.agentId, type: 'browser.target_registered', payload: { targetId: id, private: args.private ?? false } })
    return { id }
  }

  async ensureScreen(userId: string, companyId: string, agentId: string): Promise<AgentScreenRecord> {
    const computer = await this.ensure(userId, companyId)
    const gate = await pool.query(`SELECT 1 FROM participants WHERE id = $1 AND company_id = $2 AND kind = 'agent' AND departed_at IS NULL`, [agentId, companyId])
    if (!gate.rows[0]) throw new Error('agent not found in this workspace')
    const existing = (await this.listScreens(computer.id)).find((item) => item.agentId === agentId)
    if (existing) {
      await this.ensureAgentControlLease(computer.id, existing.id, agentId)
      return (await this.listScreens(computer.id)).find((item) => item.id === existing.id) ?? existing
    }
    const count = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM computer_screens WHERE computer_id = $1`, [computer.id])
    // :10 belongs to the singleton user-level Browser Service. Agent Screens
    // start at :11 so no Screen can contend with the persistent profile owner.
    const displayNumber = 11 + Number(count.rows[0]?.count ?? 0)
    const id = `screen-${randomUUID()}`
    await pool.query(
      `INSERT INTO computer_screens (id, computer_id, agent_id, session_ref, display_ref)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (computer_id, agent_id) DO UPDATE SET updated_at = NOW()`,
      [id, computer.id, agentId, `session-${randomUUID()}`, `:${displayNumber}`],
    )
    const runtimeState = await pool.query<{ runtime_ref: string | null; status: UserComputerStatus }>(
      `SELECT runtime_ref, status FROM user_computers WHERE id = $1`, [computer.id],
    )
    if (runtimeState.rows[0]?.runtime_ref && runtimeState.rows[0].status === 'running') {
      await this.launchScreenSession(runtimeState.rows[0].runtime_ref, id, agentId, `:${displayNumber}`)
    }
    await this.ensureAgentControlLease(computer.id, id, agentId)
    const screen = (await this.listScreens(computer.id)).find((item) => item.agentId === agentId)
    if (!screen) throw new Error('failed to create screen')
    await recordComputerEvent({ computerId: computer.id, screenId: screen.id, agentId, type: 'screen.created' })
    return screen
  }

  private async launchScreenSession(runtimeRef: string, screenId: string, agentId: string, displayRef: string): Promise<void> {
    if (!/^:\d+$/.test(displayRef)) throw new Error('screen display is invalid')
    const runtimeUser = agentRuntimeUser(agentId)
    const launch = await this.runtime.exec(runtimeRef, [
      'sh', '-lc',
      `set -eu
mkdir -p -- "/home/lingxi/agent-private/$AGENT_ID"
id "$RUNTIME_USER" >/dev/null 2>&1 || useradd --no-create-home --home-dir "/home/lingxi/agent-private/$AGENT_ID" --shell /bin/bash --groups lingxi-shared "$RUNTIME_USER"
chown -R "$RUNTIME_USER:lingxi-shared" -- "/home/lingxi/agent-private/$AGENT_ID"
chmod 700 -- "/home/lingxi/agent-private/$AGENT_ID"
pgrep -f "Xvfb $DISPLAY( |$)" >/dev/null || runuser -u "$RUNTIME_USER" -- Xvfb "$DISPLAY" -screen 0 1440x900x24 -nolisten tcp >/tmp/xvfb-$SCREEN_ID.log 2>&1 &
if ! test -s "/tmp/openbox-$SCREEN_ID.pid" || ! kill -0 "$(cat "/tmp/openbox-$SCREEN_ID.pid")" 2>/dev/null; then
  runuser -u "$RUNTIME_USER" -- env DISPLAY="$DISPLAY" HOME="/home/lingxi/agent-private/$AGENT_ID" openbox-session >/tmp/openbox-$SCREEN_ID.log 2>&1 & echo $! >"/tmp/openbox-$SCREEN_ID.pid"
fi
if ! test -s "/tmp/xterm-$SCREEN_ID.pid" || ! kill -0 "$(cat "/tmp/xterm-$SCREEN_ID.pid")" 2>/dev/null; then
  runuser -u "$RUNTIME_USER" -- env DISPLAY="$DISPLAY" HOME="/home/lingxi/agent-private/$AGENT_ID" xterm -title "$AGENT_ID Screen" -geometry 120x34+24+24 >/tmp/xterm-$SCREEN_ID.log 2>&1 & echo $! >"/tmp/xterm-$SCREEN_ID.pid"
fi`,
    ], {
      env: {
        AGENT_ID: agentId,
        RUNTIME_USER: runtimeUser,
        SCREEN_ID: screenId,
        DISPLAY: displayRef,
      },
    })
    if (launch.exitCode !== 0) throw new Error(`screen session failed to start: ${launch.stderr}`)
  }

  private async ensureAgentControlLease(computerId: string, screenId: string, agentId: string): Promise<void> {
    const active = await pool.query(
      `SELECT 1 FROM resource_leases
       WHERE computer_id = $1 AND resource_type = 'screen' AND resource_id = $2 AND expires_at > NOW()
       LIMIT 1`,
      [computerId, screenId],
    )
    if (!active.rows[0]) {
      await this.acquireLease({
        computerId,
        resourceType: 'screen',
        resourceId: screenId,
        holderType: 'agent',
        holderId: agentId,
        ttlMs: 120_000,
      })
    }
  }

  private async requireAgentScreen(companyId: string, agentId: string, screenId: string): Promise<{
    computerId: string; runtimeRef: string; displayRef: string; runtimeUser: string
  }> {
    const { rows } = await pool.query<{ computer_id: string; runtime_ref: string | null; display_ref: string }>(
      `SELECT s.computer_id, c.runtime_ref, s.display_ref
       FROM computer_screens s JOIN user_computers c ON c.id = s.computer_id
       WHERE s.id = $1 AND s.agent_id = $2 AND c.company_id = $3
         AND c.status = 'running' AND c.deleted_at IS NULL LIMIT 1`,
      [screenId, agentId, companyId],
    )
    const row = rows[0]
    if (!row?.runtime_ref || !/^:\d+$/.test(row.display_ref)) throw new Error('agent screen is unavailable')
    return {
      computerId: row.computer_id,
      runtimeRef: row.runtime_ref,
      displayRef: row.display_ref,
      runtimeUser: agentRuntimeUser(agentId),
    }
  }

  private safeAgentPath(path: string, agentId: string): string {
    if (!path.startsWith('/') || path.includes('\0') || path.split('/').includes('..')) throw new Error('invalid computer path')
    const allowed = [
      '/workspace/', '/documents/', '/downloads/', '/home/lingxi/shared/',
      `/home/lingxi/agent-private/${agentId}/`,
    ]
    if (!allowed.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix))) {
      throw new Error('path is outside the agent-accessible computer roots')
    }
    return path
  }

  async execForAgent(args: { companyId: string; agentId: string; screenId: string; command: string[]; cwd?: string }): Promise<ExecResult> {
    const screen = await this.requireAgentScreen(args.companyId, args.agentId, args.screenId)
    if (args.command.length === 0 || args.command.length > 64 || args.command.some((part) => !part || part.length > 4_000)) {
      throw new Error('computer command must contain 1-64 non-empty arguments')
    }
    const cwd = args.cwd ? this.safeAgentPath(args.cwd, args.agentId) : '/workspace'
    const result = await this.runtime.exec(screen.runtimeRef, args.command, {
      cwd,
      user: screen.runtimeUser,
      env: { DISPLAY: screen.displayRef, HOME: `/home/lingxi/agent-private/${args.agentId}` },
    })
    await recordComputerEvent({ computerId: screen.computerId, screenId: args.screenId, agentId: args.agentId, type: 'computer.exec', payload: { command: args.command[0] } })
    return result
  }

  async readFileForAgent(args: { companyId: string; agentId: string; screenId: string; path: string }): Promise<string> {
    const screen = await this.requireAgentScreen(args.companyId, args.agentId, args.screenId)
    const path = this.safeAgentPath(args.path, args.agentId)
    const bytes = await this.runtime.readFile(screen.runtimeRef, path)
    if (bytes.byteLength > 1024 * 1024) throw new Error('computer file is larger than 1 MiB')
    return new TextDecoder().decode(bytes)
  }

  async writeFileForAgent(args: { companyId: string; agentId: string; screenId: string; path: string; content: string }): Promise<void> {
    const screen = await this.requireAgentScreen(args.companyId, args.agentId, args.screenId)
    const path = this.safeAgentPath(args.path, args.agentId)
    if (args.content.length > 1024 * 1024) throw new Error('computer file content is larger than 1 MiB')
    const lease = await this.acquireLease({
      computerId: screen.computerId, resourceType: 'file-operation', resourceId: path,
      holderType: 'agent', holderId: args.agentId, ttlMs: 60_000,
    })
    try {
      await this.runtime.writeFile(screen.runtimeRef, path, new TextEncoder().encode(args.content))
      const ownership = await this.runtime.exec(screen.runtimeRef, ['chown', `${screen.runtimeUser}:lingxi-shared`, path])
      if (ownership.exitCode !== 0) throw new Error(ownership.stderr || 'failed to secure computer file ownership')
      await recordComputerEvent({ computerId: screen.computerId, screenId: args.screenId, agentId: args.agentId, type: 'file.written', payload: { path } })
    } finally {
      await this.releaseLease(lease.id)
    }
  }

  async listFilesForAgent(args: { companyId: string; agentId: string; screenId: string; path: string }): Promise<string[]> {
    const screen = await this.requireAgentScreen(args.companyId, args.agentId, args.screenId)
    const path = this.safeAgentPath(args.path, args.agentId)
    const result = await this.runtime.exec(screen.runtimeRef, ['find', path, '-maxdepth', '2', '-mindepth', '1', '-printf', '%p\\n'], {
      timeoutMs: 15_000,
      user: screen.runtimeUser,
      env: { HOME: `/home/lingxi/agent-private/${args.agentId}` },
    })
    if (result.exitCode !== 0) throw new Error(result.stderr || 'failed to list computer files')
    return result.stdout.split(/\r?\n/).filter(Boolean).slice(0, 500)
  }

  async screenshotForAgent(args: { companyId: string; agentId: string; screenId: string }): Promise<Uint8Array> {
    const screen = await this.requireAgentScreen(args.companyId, args.agentId, args.screenId)
    return this.captureScreen(screen.runtimeRef, screen.displayRef, args.screenId)
  }

  async waitForHumanForAgent(args: { companyId: string; agentId: string; screenId: string }): Promise<void> {
    const screen = await this.requireAgentScreen(args.companyId, args.agentId, args.screenId)
    await pool.query(`UPDATE computer_screens SET status = 'waiting', updated_at = NOW() WHERE id = $1`, [args.screenId])
    await recordComputerEvent({ computerId: screen.computerId, screenId: args.screenId, agentId: args.agentId, type: 'screen.waiting_for_human' })
  }

  async screenStatusForAgent(args: { companyId: string; agentId: string; screenId: string }): Promise<AgentScreenRecord> {
    const { rows } = await pool.query<AgentScreenRecord>(
      `SELECT s.id, s.computer_id AS "computerId", s.agent_id AS "agentId", COALESCE(p.name, s.agent_id) AS "agentName",
         s.status, CASE WHEN l.id IS NULL THEN NULL ELSE jsonb_build_object('type', l.holder_type, 'id', l.holder_id) END AS controller,
         s.created_at AS "createdAt", s.updated_at AS "updatedAt"
       FROM computer_screens s JOIN user_computers c ON c.id = s.computer_id
       LEFT JOIN participants p ON p.id = s.agent_id AND p.company_id = c.company_id
       LEFT JOIN LATERAL (SELECT id, holder_type, holder_id FROM resource_leases WHERE computer_id = s.computer_id
         AND resource_type = 'screen' AND resource_id = s.id AND expires_at > NOW() ORDER BY expires_at DESC LIMIT 1) l ON TRUE
       WHERE s.id = $1 AND s.agent_id = $2 AND c.company_id = $3 LIMIT 1`, [args.screenId, args.agentId, args.companyId],
    )
    if (!rows[0]) throw new Error('screen is unavailable or not owned by this agent')
    return rows[0]
  }

  async openBrowserForAgent(args: { companyId: string; agentId: string; screenId: string; url: string; private?: boolean }): Promise<{ id: string; targetRef: string }> {
    const screen = await this.requireAgentScreen(args.companyId, args.agentId, args.screenId)
    let url: URL
    try { url = new URL(args.url) } catch { throw new Error('browser URL is invalid') }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('browser URL must use http or https')
    await this.requireAgentGuiControl(screen.computerId, args.screenId, args.agentId)
    const target = await this.browserBroker(screen.runtimeRef, '/targets/create', { url: url.toString() })
    if (typeof target.id !== 'string' || !target.id) throw new Error('browser broker did not return a target id')
    const id = `target-${randomUUID()}`
    await pool.query(
      `INSERT INTO browser_targets (id, computer_id, screen_id, agent_id, target_ref, private)
       VALUES ($1,$2,$3,$4,$5,$6)`, [id, screen.computerId, args.screenId, args.agentId, target.id, args.private ?? false],
    )
    await recordComputerEvent({ computerId: screen.computerId, screenId: args.screenId, agentId: args.agentId, type: 'browser.opened', payload: { targetId: id, host: url.host } })
    return { id, targetRef: target.id }
  }

  private async agentBrowserTarget(companyId: string, agentId: string, targetId: string): Promise<{
    computerId: string; runtimeRef: string; targetRef: string; screenId: string
  }> {
    const { rows } = await pool.query<{ computer_id: string; runtime_ref: string | null; target_ref: string; screen_id: string | null }>(
      `SELECT t.computer_id, c.runtime_ref, t.target_ref, t.screen_id
       FROM browser_targets t JOIN user_computers c ON c.id = t.computer_id
       WHERE t.id = $1 AND t.agent_id = $2 AND c.company_id = $3
         AND t.status = 'open' AND c.status = 'running' LIMIT 1`, [targetId, agentId, companyId],
    )
    const row = rows[0]
    if (!row?.runtime_ref || !row.screen_id) throw new Error('browser target is unavailable or not owned by this agent')
    return { computerId: row.computer_id, runtimeRef: row.runtime_ref, targetRef: row.target_ref, screenId: row.screen_id }
  }

  async navigateBrowserForAgent(args: { companyId: string; agentId: string; targetId: string; url: string }): Promise<{ targetRef: string }> {
    const target = await this.agentBrowserTarget(args.companyId, args.agentId, args.targetId)
    let url: URL
    try { url = new URL(args.url) } catch { throw new Error('browser URL is invalid') }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('browser URL must use http or https')
    await this.requireAgentGuiControl(target.computerId, target.screenId, args.agentId)
    const lease = await this.acquireLease({
      computerId: target.computerId, resourceType: 'browser-operation', resourceId: args.targetId,
      holderType: 'agent', holderId: args.agentId, ttlMs: 60_000,
    })
    try {
      await this.browserBroker(target.runtimeRef, '/targets/navigate', { targetId: target.targetRef, url: url.toString() })
      await pool.query(`UPDATE browser_targets SET updated_at = NOW() WHERE id = $1`, [args.targetId])
      await recordComputerEvent({ computerId: target.computerId, screenId: target.screenId, agentId: args.agentId, type: 'browser.navigated', payload: { targetId: args.targetId, host: url.host } })
      return { targetRef: target.targetRef }
    } finally {
      await this.releaseLease(lease.id)
    }
  }

  async browserInputForAgent(args: { companyId: string; agentId: string; targetId: string; input: { type: 'click'; x: number; y: number } | { type: 'text'; text: string } }): Promise<void> {
    const target = await this.agentBrowserTarget(args.companyId, args.agentId, args.targetId)
    if (args.input.type === 'text' && (!args.input.text || args.input.text.length > 4_000)) throw new Error('browser text input must contain 1-4000 characters')
    await this.requireAgentGuiControl(target.computerId, target.screenId, args.agentId)
    const lease = await this.acquireLease({
      computerId: target.computerId, resourceType: 'browser-operation', resourceId: args.targetId,
      holderType: 'agent', holderId: args.agentId, ttlMs: 60_000,
    })
    try {
      const input = args.input.type === 'click'
        ? { type: 'click', x: Math.max(0, Math.min(1439, Math.round(args.input.x))), y: Math.max(0, Math.min(899, Math.round(args.input.y))) }
        : args.input
      await this.browserBroker(target.runtimeRef, '/targets/input', { targetId: target.targetRef, ...input })
      await recordComputerEvent({ computerId: target.computerId, screenId: target.screenId, agentId: args.agentId, type: `browser.${args.input.type}`, payload: { targetId: args.targetId } })
    } finally {
      await this.releaseLease(lease.id)
    }
  }

  async screenshot(userId: string, companyId: string, screenId: string): Promise<Uint8Array> {
    const computer = await this.ensure(userId, companyId)
    const { rows } = await pool.query<{ runtime_ref: string | null; display_ref: string }>(
      `SELECT c.runtime_ref, s.display_ref
       FROM computer_screens s JOIN user_computers c ON c.id = s.computer_id
       WHERE s.id = $1 AND s.computer_id = $2 LIMIT 1`, [screenId, computer.id],
    )
    const row = rows[0]
    if (!row?.runtime_ref) throw new Error('computer is not running')
    if (!/^:\d+$/.test(row.display_ref)) throw new Error('screen display is invalid')
    return this.captureScreen(row.runtime_ref, row.display_ref, screenId)
  }

  async sendHumanInput(
    userId: string,
    companyId: string,
    screenId: string,
    input: { type: 'click'; x: number; y: number; button?: number } | { type: 'text'; text: string } | { type: 'key'; key: string },
  ): Promise<void> {
    const computer = await this.ensure(userId, companyId)
    const { rows } = await pool.query<{ runtime_ref: string | null; display_ref: string; target_ref: string | null }>(
      `SELECT c.runtime_ref, s.display_ref, target.target_ref
       FROM computer_screens s
       JOIN user_computers c ON c.id = s.computer_id
       JOIN resource_leases l ON l.computer_id = s.computer_id
         AND l.resource_type = 'screen' AND l.resource_id = s.id
         AND l.holder_type = 'human' AND l.holder_id = $3 AND l.expires_at > NOW()
       LEFT JOIN LATERAL (
         SELECT target_ref FROM browser_targets
          WHERE screen_id = s.id AND status = 'open'
          ORDER BY updated_at DESC, created_at DESC LIMIT 1
       ) target ON TRUE
       WHERE s.id = $1 AND s.computer_id = $2 AND s.status = 'human_control'
       LIMIT 1`,
      [screenId, computer.id, userId],
    )
    const row = rows[0]
    if (!row?.runtime_ref) throw new Error('take control of this screen before sending input')
    if (!/^:\d+$/.test(row.display_ref)) throw new Error('screen display is invalid')
    await this.acquireLease({
      computerId: computer.id, resourceType: 'screen', resourceId: screenId,
      holderType: 'human', holderId: userId, ttlMs: 120_000,
    })
    let command: string[]
    if (input.type === 'click') {
      const x = Math.max(0, Math.min(1439, Math.round(input.x)))
      const y = Math.max(0, Math.min(899, Math.round(input.y)))
      const button = [1, 2, 3].includes(input.button ?? 1) ? input.button ?? 1 : 1
      command = ['xdotool', 'mousemove', '--sync', String(x), String(y), 'click', String(button)]
    } else if (input.type === 'text') {
      if (!input.text || input.text.length > 4_000) throw new Error('text input must contain 1-4000 characters')
      command = ['xdotool', 'type', '--delay', '20', '--clearmodifiers', '--', input.text]
    } else {
      if (!/^(?:Return|Tab|Escape|BackSpace|Delete|Up|Down|Left|Right|Home|End|Page_Up|Page_Down|ctrl\+[a-z])$/i.test(input.key)) {
        throw new Error('unsupported key')
      }
      command = ['xdotool', 'key', '--clearmodifiers', input.key]
    }
    if (row.target_ref) {
      const brokerInput = input.type === 'click'
        ? { type: 'click', x: Math.max(0, Math.min(1439, Math.round(input.x))), y: Math.max(0, Math.min(899, Math.round(input.y))) }
        : input
      await this.browserBroker(row.runtime_ref, '/targets/input', { targetId: row.target_ref, ...brokerInput })
    } else {
      const result = await this.runtime.exec(row.runtime_ref, command, {
        env: { DISPLAY: row.display_ref },
        timeoutMs: 15_000,
      })
      if (result.exitCode !== 0) throw new Error(`screen input failed: ${result.stderr}`)
    }
    await recordComputerEvent({
      computerId: computer.id,
      screenId,
      type: 'screen.human_input',
      payload: { type: input.type },
    })
  }

  async acquireLease(args: {
    computerId: string; resourceType: string; resourceId: string; holderType: 'agent' | 'human'; holderId: string; ttlMs?: number
  }): Promise<{ id: string; expiresAt: string }> {
    const ttlMs = Math.max(5_000, Math.min(args.ttlMs ?? 120_000, 30 * 60_000))
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${args.computerId}:${args.resourceType}:${args.resourceId}`])
      await client.query(`DELETE FROM resource_leases WHERE computer_id = $1 AND resource_type = $2 AND resource_id = $3 AND expires_at <= NOW()`, [args.computerId, args.resourceType, args.resourceId])
      const active = await client.query<{ holder_type: string; holder_id: string }>(
        `SELECT holder_type, holder_id FROM resource_leases
         WHERE computer_id = $1 AND resource_type = $2 AND resource_id = $3 AND expires_at > NOW() LIMIT 1`,
        [args.computerId, args.resourceType, args.resourceId],
      )
      if (active.rows[0] && (active.rows[0].holder_type !== args.holderType || active.rows[0].holder_id !== args.holderId)) {
        throw new Error(`resource is controlled by ${active.rows[0].holder_type}:${active.rows[0].holder_id}`)
      }
      const id = `lease-${randomUUID()}`
      const expiresAt = new Date(Date.now() + ttlMs).toISOString()
      await client.query(`DELETE FROM resource_leases WHERE computer_id = $1 AND resource_type = $2 AND resource_id = $3`, [args.computerId, args.resourceType, args.resourceId])
      await client.query(
        `INSERT INTO resource_leases (id, computer_id, resource_type, resource_id, holder_type, holder_id, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, args.computerId, args.resourceType, args.resourceId, args.holderType, args.holderId, expiresAt],
      )
      await client.query('COMMIT')
      return { id, expiresAt }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async releaseLease(leaseId: string): Promise<void> {
    await pool.query(`DELETE FROM resource_leases WHERE id = $1`, [leaseId])
  }

  async heartbeatControl(userId: string, companyId: string, screenId: string): Promise<{ expiresAt: string }> {
    const computer = await this.ensure(userId, companyId)
    const screen = (await this.listScreens(computer.id)).find((item) => item.id === screenId)
    if (!screen || screen.status !== 'human_control' || screen.controller?.type !== 'human' || screen.controller.id !== userId) {
      throw new Error('take control of this screen before renewing it')
    }
    const lease = await this.acquireLease({
      computerId: computer.id, resourceType: 'screen', resourceId: screenId,
      holderType: 'human', holderId: userId, ttlMs: 120_000,
    })
    return { expiresAt: lease.expiresAt }
  }

  async takeover(userId: string, companyId: string, screenId: string): Promise<AgentScreenRecord> {
    const computer = await this.ensure(userId, companyId)
    const screen = (await this.listScreens(computer.id)).find((item) => item.id === screenId)
    if (!screen) throw new Error('screen not found')
    await pool.query(`DELETE FROM resource_leases WHERE computer_id = $1 AND resource_type = 'screen' AND resource_id = $2`, [computer.id, screenId])
    await this.acquireLease({ computerId: computer.id, resourceType: 'screen', resourceId: screenId, holderType: 'human', holderId: userId, ttlMs: 120_000 })
    await pool.query(`UPDATE computer_screens SET status = 'human_control', updated_at = NOW() WHERE id = $1`, [screenId])
    await recordComputerEvent({ computerId: computer.id, screenId, agentId: screen.agentId, type: 'screen.human_takeover' })
    return (await this.listScreens(computer.id)).find((item) => item.id === screenId)!
  }

  async returnToAgent(userId: string, companyId: string, screenId: string): Promise<AgentScreenRecord> {
    const computer = await this.ensure(userId, companyId)
    const screen = (await this.listScreens(computer.id)).find((item) => item.id === screenId)
    if (!screen) throw new Error('screen not found')
    await pool.query(
      `DELETE FROM resource_leases WHERE computer_id = $1 AND resource_type = 'screen' AND resource_id = $2
       AND holder_type = 'human' AND holder_id = $3`, [computer.id, screenId, userId],
    )
    await this.acquireLease({ computerId: computer.id, resourceType: 'screen', resourceId: screenId, holderType: 'agent', holderId: screen.agentId, ttlMs: 120_000 })
    await pool.query(`UPDATE computer_screens SET status = 'working', updated_at = NOW() WHERE id = $1`, [screenId])
    await recordComputerEvent({ computerId: computer.id, screenId, agentId: screen.agentId, type: 'screen.returned_to_agent' })
    return (await this.listScreens(computer.id)).find((item) => item.id === screenId)!
  }
}

export const userComputerService = new UserComputerService(createSandboxRuntime())

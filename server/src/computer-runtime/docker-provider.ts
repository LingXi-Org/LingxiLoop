import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface ExecOptions { cwd?: string; env?: Record<string, string>; timeoutMs?: number; user?: string }
export interface ExecResult { exitCode: number; stdout: string; stderr: string }

function safeRef(value: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) throw new Error('invalid runtime reference')
  return value
}

/** Docker implementation owned solely by the trusted-host runtime manager. */
export class DockerProvider {
  constructor(
    private readonly dockerBin = process.env.LINGXILOOP_DOCKER_BIN ?? 'docker',
    private readonly image = process.env.LINGXILOOP_USER_COMPUTER_IMAGE ?? 'ghcr.io/lingxi-org/lingxiloop-user-computer:dev',
  ) {}

  private async docker(args: string[], timeoutMs = 60_000): Promise<{ stdout: string; stderr: string }> {
    try { return await execFileAsync(this.dockerBin, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }) }
    catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') throw new Error('Docker CLI was not found in the runtime manager')
      throw error
    }
  }

  async health(): Promise<void> { await this.docker(['version', '--format', '{{.Server.Version}}'], 10_000) }

  async create(input: { businessId: string; imageVersion: string }): Promise<{ id: string; runtimeRef: string }> {
    const suffix = input.businessId.replace(/[^a-zA-Z0-9_.-]/g, '-').slice(-48)
    const runtimeRef = safeRef(`lingxiloop-user-${suffix}`)
    const exists = await this.docker(['container', 'inspect', runtimeRef]).then(() => true).catch(() => false)
    if (!exists) {
      await this.docker([
        'create', '--name', runtimeRef,
        '--label', `cn.lingxiloop.computer=${input.businessId}`,
        '--label', `cn.lingxiloop.image-version=${input.imageVersion}`,
        '--shm-size', '1g',
        '-v', `${runtimeRef}-home:/home/lingxi`,
        '-v', `${runtimeRef}-workspace:/workspace`,
        '-v', `${runtimeRef}-documents:/documents`,
        '-v', `${runtimeRef}-downloads:/downloads`,
        this.image,
      ], 120_000)
    }
    return { id: runtimeRef, runtimeRef }
  }

  async start(runtimeRef: string): Promise<void> { await this.docker(['start', safeRef(runtimeRef)]) }
  async stop(runtimeRef: string): Promise<void> { await this.docker(['stop', '--time', '15', safeRef(runtimeRef)]) }
  async destroy(runtimeRef: string): Promise<void> {
    const ref = safeRef(runtimeRef)
    await this.docker(['rm', '--force', ref]).catch((error) => {
      if (!String(error).includes('No such container')) throw error
    })
    for (const suffix of ['home', 'workspace', 'documents', 'downloads']) {
      await this.docker(['volume', 'rm', `${ref}-${suffix}`]).catch((error) => {
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
    args.push(safeRef(runtimeRef), ...command)
    try {
      const out = await this.docker(args, options.timeoutMs ?? 60_000)
      return { exitCode: 0, stdout: out.stdout, stderr: out.stderr }
    } catch (error) {
      const value = error as { code?: number; stdout?: string; stderr?: string; message?: string }
      return { exitCode: typeof value.code === 'number' ? value.code : 1, stdout: value.stdout ?? '', stderr: value.stderr ?? value.message ?? String(error) }
    }
  }

  async readFile(runtimeRef: string, path: string): Promise<Uint8Array> {
    const root = await mkdtemp(join(tmpdir(), 'lingxiloop-runtime-read-'))
    const target = join(root, 'payload')
    try { await this.docker(['cp', `${safeRef(runtimeRef)}:${path}`, target]); return new Uint8Array(await readFile(target)) }
    finally { await rm(root, { recursive: true, force: true }) }
  }

  async writeFile(runtimeRef: string, path: string, data: Uint8Array): Promise<void> {
    const root = await mkdtemp(join(tmpdir(), 'lingxiloop-runtime-write-'))
    const source = join(root, 'payload')
    try { await writeFile(source, data); await this.docker(['cp', source, `${safeRef(runtimeRef)}:${path}`]) }
    finally { await rm(root, { recursive: true, force: true }) }
  }

  async exposeService(runtimeRef: string, port: number): Promise<{ providerRef: string; port: number }> {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid service port')
    return { providerRef: `${safeRef(runtimeRef)}:${port}`, port }
  }
}

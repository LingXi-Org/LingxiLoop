import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { visualizeSkillRoot } from './visualize-skill.js'

const execute = promisify(execFile)
/** Original upstream exporter, with generated content as data, never executable arguments. */
export async function renderVisualizeStandalone(html: string, name: string, signal: AbortSignal): Promise<Buffer> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || Buffer.byteLength(html) > 5_000_000) throw new Error('Invalid visualization export')
  if (Buffer.byteLength(html) > 1_000_000) throw new Error('Standalone export requires a fragment under 1 MB (upstream render.py limit)')
  const directory = await mkdtemp(join(tmpdir(), 'lingxiloop-visualize-'))
  try {
    const source = join(directory, `${name}.html`), destination = join(directory, `${name}-standalone.html`)
    await writeFile(source, html, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await execute(process.env.AGENT_OS_PYTHON?.trim() || (process.platform === 'win32' ? 'python' : 'python3'),
      [join(visualizeSkillRoot, 'scripts/render.py'), source, destination],
      { signal, timeout: 30_000, maxBuffer: 64_000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })
    signal.throwIfAborted()
    return await readFile(destination)
  } finally { await rm(directory, { recursive: true, force: true }) }
}

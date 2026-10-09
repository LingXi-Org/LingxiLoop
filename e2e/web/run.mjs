import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { validateCanvasExport } from './export-validation.mjs'

const args = process.argv.slice(2)
const outputFlag = args.findIndex(arg => arg === '--output' || arg.startsWith('--output='))
const output = outputFlag < 0 ? '.e2e/web' : args[outputFlag].includes('=') ? args[outputFlag].slice('--output='.length) : args[outputFlag + 1]
const expectedFile = path.resolve(output, 'canvas-export-expected.json')
await rm(expectedFile, { force: true })
const packageRoot = path.resolve('node_modules/e2e')
const metadata = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(packageRoot, metadata.bin.e2e), 'run', ...args], {
    stdio: 'inherit', windowsHide: true, env: { ...process.env, E2E_CANVAS_EXPECTED_PATH: expectedFile },
  })
  child.once('error', reject)
  child.once('exit', code => resolve(code ?? 1))
})
if (args.includes('--help')) process.exit(exitCode)
await mkdir(output, { recursive: true })
const buildFile = process.env.E2E_BUILD_INDEX ?? (process.env.E2E_BASE_URL ? null : '.e2e/dist-web/index.html')
const build = buildFile ? await readFile(buildFile).then(async content => ({
  file: buildFile, modifiedAt: (await stat(buildFile)).mtime.toISOString(), sha256: createHash('sha256').update(content).digest('hex'),
})).catch(() => null) : null
await writeFile(path.join(output, 'run-metadata.json'), JSON.stringify({
  command: ['npm', 'run', 'test:e2e:web', '--', ...args],
  buildMode: process.env.E2E_BASE_URL ? build ? 'existing production preview via E2E_BASE_URL' : 'external app via E2E_BASE_URL' : 'production Vite build and preview via e2e/serve.mjs',
  browser: process.env.E2E_CDP_URL ? 'installed Chrome over CDP through official @e2e-dev/web' : 'managed official @e2e-dev/web browser',
  build,
}, null, 2))
if (exitCode === 0) {
  try { await validateCanvasExport(output) }
  catch (error) { console.error('Canvas export validation failed:', error.message); process.exitCode = 1 }
}
if (exitCode !== 0) process.exitCode = exitCode

import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const run = (args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...args], { cwd: root, stdio: 'inherit', windowsHide: true })
  child.once('error', reject)
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Visual fixture exited ${code}`)))
})
await run(['build', '--config', 'scripts/vite.ui-experience.config.ts'])
const files = ['DESIGN.md', 'package-lock.json', 'scripts/ui-experience-fixtures.ts', 'scripts/ui-experience-browser-check.tsx', 'scripts/vite.ui-experience.config.ts', 'artifacts/ui-experience/site/scripts/ui-experience-browser-check.html']
const hashes = Object.fromEntries(await Promise.all(files.map(async file => [file, createHash('sha256').update(await readFile(new URL(`../../${file}`, import.meta.url))).digest('hex')])))
await mkdir(new URL('../../artifacts/ui-redesign/', import.meta.url), { recursive: true })
await writeFile(new URL('../../artifacts/ui-redesign/build-manifest.json', import.meta.url), JSON.stringify({
  builtAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()),
  build: 'node node_modules/vite/bin/vite.js build --config scripts/vite.ui-experience.config.ts',
  reproduce: 'npx --no-install e2e run --config e2e.visual.config.ts', hashes,
}, null, 2))
await run(['preview', '--config', 'scripts/vite.ui-experience.config.ts', '--port', '5187', '--host', '127.0.0.1', '--strictPort'])

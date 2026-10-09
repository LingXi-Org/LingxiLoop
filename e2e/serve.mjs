import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const project = process.argv[2]
if (project !== 'web' && project !== 'admin') throw new Error('Expected web or admin')
const root = fileURLToPath(new URL('../', import.meta.url))
const config = project === 'admin' ? ['--config', 'vite.admin.config.ts'] : []
const output = resolve(root, '.e2e', `dist-${project}`)
const env = {
  ...process.env,
  VITE_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  LINGXILOOP_DEV_WS_TARGET: process.env.E2E_WS_URL ?? 'ws://127.0.0.1:5181',
}
const run = (args) => new Promise((done, reject) => {
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...args], { cwd: root, env, stdio: 'inherit', windowsHide: true })
  child.once('error', reject)
  child.once('exit', code => code === 0 ? done() : reject(new Error(`E2E ${project} server exited ${code}`)))
})

// Build into the ignored test directory with the official Turnstile test key.
await run(['build', ...config, '--outDir', output])
await run(['preview', ...config, '--outDir', output, '--host', '127.0.0.1', '--port', project === 'web' ? '5180' : '5198', '--strictPort'])

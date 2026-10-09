import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, rmdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { hashPassword } from 'better-auth/crypto'

const root = fileURLToPath(new URL('../../', import.meta.url))
const environmentFile = path.join(root, '.env.e2e.local')
if (existsSync(environmentFile)) process.loadEnvFile(environmentFile)
const config = fileURLToPath(new URL('./wrangler.e2e.jsonc', import.meta.url))
const state = path.join(root, '.e2e/control-state')
const wrangler = path.join(root, 'node_modules/wrangler/bin/wrangler.js')
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' }
const run = (args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [wrangler, ...args], { cwd: root, env, stdio: 'inherit', windowsHide: true })
  child.once('error', reject)
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Local control command exited ${code}`)))
})

// Only the dedicated local D1 is touched; no remote flag or production config.
await mkdir(state, { recursive: true })
await run(['d1', 'migrations', 'apply', 'DB', '--local', '--config', config, '--persist-to', state])
const now = Math.floor(Date.now() / 1000)
const quote = value => `'${String(value).replaceAll("'", "''")}'`
const statements = []
for (const [role, number] of [['member', 1], ['admin', 2], ['student', 3], ['manager', 4], ['lifecycle', 6]]) {
  const name = `E2E ${role}`
  const id = `e2e-auth-${role}`
  const email = process.env[`E2E_USER_${role.toUpperCase()}_USERNAME`] || `${role}@e2e.lingxiloop.test`
  const password = await hashPassword(process.env[`E2E_USER_${role.toUpperCase()}_PASSWORD`] || 'Local-E2E-password-0001!')
  const appId = `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
  statements.push(
    `INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt,role,banned) VALUES(${quote(id)},${quote(name)},${quote(email)},1,${now},${now},${quote(role === 'admin' ? 'admin' : 'user')},0) ON CONFLICT(id) DO UPDATE SET email=excluded.email,emailVerified=1,role=excluded.role,banned=0`,
    `INSERT INTO account(id,accountId,providerId,issuer,userId,password,createdAt,updatedAt) VALUES(${quote(id)},${quote(id)},'credential','local:credential',${quote(id)},${quote(password)},${now},${now}) ON CONFLICT(id) DO UPDATE SET password=excluded.password,updatedAt=excluded.updatedAt`,
    `INSERT INTO app_user_links(auth_user_id,app_user_id,provisioned_at) VALUES(${quote(id)},${quote(appId)},${Date.now()}) ON CONFLICT(auth_user_id) DO UPDATE SET app_user_id=excluded.app_user_id,suspended_at=NULL`,
    `DELETE FROM session WHERE userId=${quote(id)}`,
  )
}
statements.push('DELETE FROM rateLimit')
const temporary = await mkdtemp(path.join(state, 'seed-'))
const seed = path.join(temporary, 'accounts.sql')
try {
  await writeFile(seed, `${statements.join(';\n')};\n`, { mode: 0o600 })
  await run(['d1', 'execute', 'DB', '--local', '--config', config, '--persist-to', state, '--file', seed])
} finally {
  await rm(seed, { force: true })
  await rmdir(temporary)
}
console.log('[e2e] Local control D1 seeded for browser actors and the sacrificial lifecycle account.')
if (!process.argv.includes('--seed-only')) {
  await run(['dev', '--local', '--config', config, '--persist-to', state, '--ip', '127.0.0.1', '--port', '8797'])
}

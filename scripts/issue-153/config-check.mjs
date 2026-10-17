// Parse Compose using synthetic required substitutions; do not read a .env file.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const results = []
for (const role of ['a', 'b']) {
  const path = `deploy/komodo/lingxiloop-app-${role}/compose.yml`
  const source = readFileSync(path, 'utf8')
  const env = { PATH: process.env.PATH, HOME: process.env.HOME }
  for (const match of source.matchAll(/\$\{(\w+):\?/g)) env[match[1]] = 'synthetic-config-validation'
  const result = spawnSync('docker', ['compose', '--env-file', '/dev/null', '-f', path, 'config', '--format', 'json'], { env, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const config = JSON.parse(result.stdout)
  const web = config.services.lingxiloop, worker = config.services.worker
  assert(web.healthcheck.test.join(' ').includes('/api/readyz'))
  for (const service of [web, worker]) {
    assert(service.healthcheck.test.join(' ').includes('AbortSignal.timeout(4000)'))
    assert.equal(service.healthcheck.timeout, '5s')
  }
  assert.equal(web.environment.NODE_OPTIONS, '--max-old-space-size=320')
  assert.equal(web.environment.DATABASE_POOL_MAX, '8')
  assert.equal(Number(web.mem_limit), 640 * 1024 * 1024)
  assert.equal(Number(worker.mem_limit), 1024 * 1024 * 1024)
  results.push({ path, status: 'passed', probes: ['Web readiness', 'Worker readiness'], unchangedBudget: true })
}
const gateway = readFileSync('deploy/komodo/lingxiloop-app-b/gateway.conf', 'utf8')
assert.match(gateway, /location = \/readyz[\s\S]*?proxy_pass http:\/\/lingxiloop_web\/api\/readyz;/)
assert(!gateway.includes('non_idempotent'))
writeFileSync('scripts/issue-153/evidence/config.json', JSON.stringify({ results,
  gateway: 'Static readiness/POST-retry assertions passed; nginx -t/runtime failover gate recorded separately.' }, null, 2) + '\n')
console.log('Compose A/B parsed; probe deadlines and existing resource budgets checked; gateway static assertions passed.')

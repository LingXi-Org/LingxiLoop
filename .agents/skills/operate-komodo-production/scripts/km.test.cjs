const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const source = () => fs.readFileSync(`${__dirname}/km.cjs`, 'utf8')
function check(env, status = 0, exists = true) {
  let invocation
  let exitCode
  let error
  vm.runInNewContext(source(), {
    require: (name) => name === 'node:fs' ? { existsSync: () => exists } : {
      spawnSync: (...args) => { invocation = args; return { status } },
    },
    process: { env, argv: ['node', 'km.cjs', 'list', 'stacks', '--format', 'json'], exit: (code) => { exitCode = code } },
    console: { error: (message) => { error = message } },
  })
  return { invocation, exitCode, error }
}

const env = { KOMODO_API_KEY: 'test-key', KOMODO_API_SECRET: 'test-secret', WSLENV: 'EXISTING/u:KOMODO_CLI_KEY/w:KOMODO_CLI_SECRET/w', KOMODO_CLI_HOST: 'https://wrong.invalid' }
const ok = check(env, 7)
assert.deepEqual(Array.from(ok.invocation[1]), ['--', '/mnt/c/Users/34395/.codex/bin/wsl/km', 'list', 'stacks', '--format', 'json'])
assert.equal(ok.invocation[0], 'C:\\Windows\\System32\\wsl.exe')
assert.equal(ok.invocation[2].env.KOMODO_CLI_KEY, 'test-key')
assert.equal(ok.invocation[2].env.KOMODO_CLI_SECRET, 'test-secret')
assert.equal(ok.invocation[2].env.KOMODO_CLI_HOST, 'https://ops.christmas1314.xyz')
assert.equal(ok.invocation[2].env.WSLENV, 'EXISTING/u:KOMODO_CLI_KEY:KOMODO_CLI_SECRET:KOMODO_CLI_HOST')
assert.equal(env.WSLENV, 'EXISTING/u:KOMODO_CLI_KEY/w:KOMODO_CLI_SECRET/w')
assert.equal(ok.exitCode, 7)
assert.equal(check(env, null).exitCode, 1)
for (const result of [check({}), check(env, 0, false)]) {
  assert.equal(result.invocation, undefined)
  assert.equal(result.exitCode, 1)
  assert.ok(result.error)
  assert.ok(!result.error.includes('test-secret'))
}
console.log('Komodo wrapper checks passed')

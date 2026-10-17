const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

// Fail closed on wrong targets, missing credentials, missing SSH, and child failures;
// credentials must reach only stdin, never command arguments or a local file.
function check(args, env, status = 0, exists = true) {
  let invocation
  let exitCode
  let error
  let output
  vm.runInNewContext(fs.readFileSync(`${__dirname}/bootstrap.cjs`, 'utf8'), {
    require: name => name === 'node:fs' ? { existsSync: () => exists } : {
      spawnSync: (...args) => { invocation = args; return { status } },
    },
    process: { env, argv: ['node', 'bootstrap.cjs', ...args], exit: code => { exitCode = code } },
    console: { error: message => { error = message }, log: message => { output = message } },
  })
  return { invocation, exitCode, error, output }
}
const env = Object.fromEntries(['KOMODO_DATABASE_USERNAME', 'KOMODO_DATABASE_PASSWORD', 'KOMODO_ADMIN_PASSWORD', 'KOMODO_JWT_SECRET', 'KOMODO_WEBHOOK_SECRET'].map(key => [key, `test-${key}-$'\n`]))
env.UNRELATED_SECRET = 'must-not-transfer'
const ok = check(['validate', 'core'], env, 7)
assert.equal(ok.exitCode, 7)
assert.equal(ok.invocation[0], 'C:\\Windows\\System32\\OpenSSH\\ssh.exe')
assert.deepEqual(Array.from(ok.invocation[1].slice(0, 5)), ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', 'txy3'])
assert(!ok.invocation[1].join(' ').includes('test-'))
const payload = JSON.parse(ok.invocation[2].input)
assert.deepEqual(payload.command, ['docker', 'compose', '-f', '/opt/komodo/bootstrap/core/compose.yml', 'config', '--quiet'])
assert.equal(payload.requireState, false)
assert.deepEqual(payload.env, Object.fromEntries(Object.entries(env).filter(([key]) => key !== 'UNRELATED_SECRET')))
assert.deepEqual(Array.from(ok.invocation[2].stdio), ['pipe', 'inherit', 'inherit'])
assert.deepEqual(JSON.parse(check(['create', 'core'], env).invocation[2].input).command,
  ['docker', 'compose', '-f', '/opt/komodo/bootstrap/core/compose.yml', 'create', '--pull', 'never'])
assert.equal(JSON.parse(check(['up', 'core'], env).invocation[2].input).requireState, true)
const ingress = check(['up', 'control-ingress'], {})
assert.equal(ingress.exitCode, 0)
assert.equal(ingress.output, 'txy3 control-ingress: up completed')
assert.deepEqual(JSON.parse(ingress.invocation[2].input), {
  env: { ACME_EMAIL: 'no-reply@lingxilearn.cn' },
  requireState: false,
  command: ['docker', 'compose', '-f', '/opt/komodo/bootstrap/control-ingress/compose.yml', 'up', '-d', '--pull', 'never'],
})
for (const result of [check(['up', 'core'], {}), check(['down', 'core'], env), check(['up', 'product'], env), check(['up', 'core', 'aly'], env), check(['up', 'core'], env, 0, false)]) {
  assert.equal(result.exitCode, 1)
  assert.equal(result.invocation, undefined)
  assert(result.error && !result.error.includes('test-'))
}
assert.equal(check(['up', 'core'], env, null).exitCode, 1)
console.log('Control-plane bootstrap checks passed')

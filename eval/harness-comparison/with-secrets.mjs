// Run under the existing cloud environment or `sigillo run`. Never export secrets.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export function childEnvironment(source, phase) {
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'SYSTEMROOT']
    .filter(name => source[name] !== undefined).map(name => [name, source[name]]))
  if (phase === 'install') {
    env.NODE_AUTH_TOKEN = source.LINGXIOS_PACKAGES_TOKEN?.trim() || source.NODE_AUTH_TOKEN?.trim()
    assert.ok(env.NODE_AUTH_TOKEN, 'Existing package-read credential is unavailable')
  } else if (phase === 'live') {
    let key = source.DEEPSEEK_API_KEY?.trim()
    if (!key && source.OPENAI_BASE_URL) {
      const url = new URL(source.OPENAI_BASE_URL.trim())
      if (url.protocol === 'https:' && url.hostname === 'api.deepseek.com' && !url.port &&
          !url.username && !url.password && ['/', '/v1', '/v1/'].includes(url.pathname)) {
        key = source.OPENAI_API_KEY?.trim()
      }
    }
    assert.ok(key, 'No official DeepSeek credential in the existing environment; provider/model were not changed')
    env.DEEPSEEK_API_KEY = key
  } else assert.equal(phase, 'smoke', 'Unknown phase')
  return env
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [phase, output] = process.argv.slice(2)
  try {
    const env = childEnvironment(process.env, phase)
    const args = phase === 'install' ? ['install.mjs'] : ['run.mjs', `--${phase}`, output]
    assert.ok(phase === 'install' || output, 'Capture output path is required')
    const child = spawn(process.execPath, args, {
      cwd: fileURLToPath(new URL('.', import.meta.url)), env, stdio: 'inherit',
    })
    child.once('error', () => { console.error('Evaluation child could not start'); process.exitCode = 1 })
    child.once('exit', code => { process.exitCode = code ?? 1 })
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal))
  } catch (error) {
    console.error(error instanceof assert.AssertionError ? error.message : 'Invalid credential routing configuration')
    process.exitCode = 1
  }
}

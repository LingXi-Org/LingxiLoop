import assert from 'node:assert/strict'

type ModelEnvironment = { OPENAI_BASE_URL: string; OPENAI_MODEL: string; OPENAI_API_KEY: string }
const providerBase = 'https://api.siliconflow.cn/v1'
const fixtureKey = 'local-model-profile-fixture'

/** Keep the production model capability selection while making transport hermetic. */
export function installProductionModelTransport(env: ModelEnvironment, localBase: string) {
  const target = new URL(localBase)
  assert.ok(target.protocol === 'http:' && target.hostname === '127.0.0.1' && target.port
    && target.pathname === '/v1' && !target.search && !target.hash && !target.username && !target.password,
  'fixture transport target must be the exact loopback provider')
  const previous = { OPENAI_BASE_URL: env.OPENAI_BASE_URL, OPENAI_MODEL: env.OPENAI_MODEL, OPENAI_API_KEY: env.OPENAI_API_KEY }, original = globalThis.fetch
  let requests = 0, restored = false
  env.OPENAI_BASE_URL = providerBase
  env.OPENAI_MODEL = 'deepseek-ai/DeepSeek-V4.1-Flash'
  env.OPENAI_API_KEY = fixtureKey
  const scoped: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.href === `${providerBase}/chat/completions`) {
      assert.equal(init?.method ?? (input instanceof Request ? input.method : 'GET'), 'POST', 'fixture request scope requires POST')
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
      assert.ok(headers.get('authorization') === `Bearer ${fixtureKey}`, 'fixture credential must be synthetic')
      requests++
      const local = `${target.href}/chat/completions`
      return original(input instanceof Request ? new Request(local, input) : local, init)
    }
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'fixture request scope prohibits external fetch')
    return original(input, init)
  }
  globalThis.fetch = scoped
  return {
    get requests() { return requests },
    restore() {
      if (restored) return
      restored = true
      assert.equal(globalThis.fetch, scoped, 'fixture fetch changed before restoration')
      globalThis.fetch = original
      env.OPENAI_BASE_URL = previous.OPENAI_BASE_URL
      env.OPENAI_MODEL = previous.OPENAI_MODEL
      env.OPENAI_API_KEY = previous.OPENAI_API_KEY
    },
  }
}

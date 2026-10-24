import config from './e2e.forum.config'

export default { ...config, tests: ['e2e/forum/math-roundtrip.e2e.ts'], timeout: 120000,
  output: process.env.FORUM_BROWSER_OUTPUT ?? 'artifacts/forum/math' }

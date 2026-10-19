import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { fixture, frames, stream } from './fixtures.js'
Object.assign(process.env, { DOTENV_CONFIG_PATH: '/dev/null', NODE_ENV: 'test',
  DATABASE_URL: 'postgres://fixture@127.0.0.1:1/perf_test', REDIS_URL: 'redis://127.0.0.1:1',
  WUKONG_USER_TOKEN_SECRET: 'synthetic-perf-fixture', OPENAI_API_KEY: 'synthetic-perf-fixture',
  OPENAI_EMBEDDING_MODEL: 'synthetic', OPENAI_BASE_URL: 'http://127.0.0.1:1' })
const sources = { base: process.argv[2], candidate: process.argv[3] ?? '.' }
const modules = Object.fromEntries(await Promise.all(Object.entries(sources).map(async ([key, root]) => [key,
  await import(pathToFileURL(resolve(root, 'server/src/agent-runtime/assistant-transport.ts')).href)])))
const bytes = frames(fixture('short').events)
const server = createServer(async (request, response) => {
  const variant = request.url === '/perf-api/base' ? 'base' : request.url === '/perf-api/candidate' ? 'candidate' : null
  if (!variant) { response.writeHead(404); response.end(); return }
  const { assistantRunResponse, RunStreamProjection } = modules[variant]
  const result = assistantRunResponse(stream(bytes), new RunStreamProjection('run', true))
  response.writeHead(200, Object.fromEntries(result.headers))
  try { for await (const chunk of result.body!) response.write(chunk); response.end() }
  catch { response.destroy() }
})
server.listen(5321, '127.0.0.1', () => console.log('Synthetic streaming endpoints ready on localhost:5321'))

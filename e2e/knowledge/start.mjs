import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const source = resolve(root, 'third_party/open-notebook')
const cwd = resolve(root, '.e2e/knowledge')
await mkdir(cwd, { recursive: true })
const env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|HOMEDRIVE|HOMEPATH|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PROGRAMFILES(?:\(X86\))?|PROGRAMDATA|PROGRAMW6432|ALLUSERSPROFILE)$/i.test(name))),
  PYTHONPATH: source, PYTHONUNBUFFERED: '1', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', OPEN_NOTEBOOK_RAG_ONLY: '1',
  TIKTOKEN_CACHE_DIR: resolve(source, 'data/tiktoken-cache'),
  SURREAL_URL: 'ws://127.0.0.1:58001/rpc', SURREAL_USER: 'lingxiloop-e2e', SURREAL_PASSWORD: 'lingxiloop-e2e-surreal-local',
  SURREAL_NAMESPACE: 'lingxiloop_e2e', SURREAL_DATABASE: 'lingxiloop_e2e',
  OPEN_NOTEBOOK_PASSWORD: 'lingxiloop-e2e-notebook-local',
  OPEN_NOTEBOOK_R2_PREFIX: 'open-notebook-e2e',
  R2_ENDPOINT: 'http://127.0.0.1:59000', R2_BUCKET: 'lingxiloop-e2e', R2_ACCESS_KEY_ID: 'lingxiloop-e2e', R2_SECRET_ACCESS_KEY: 'lingxiloop-e2e-storage-local',
  OPENAI_API_KEY: 'lingxiloop-e2e-embedding-local', OPENAI_BASE_URL: 'http://127.0.0.1:15056/v1', OPENAI_EMBEDDING_MODEL: 'e2e-constant-vector-1024',
}
await new Promise((done, reject) => {
  const child = spawn('docker', ['compose', '-f', 'e2e/knowledge/compose.yaml', 'up', '-d', '--wait'], { cwd: root, env, stdio: 'inherit', windowsHide: true })
  child.on('error', reject)
  child.on('close', (code) => code === 0 ? done() : reject(new Error(`SurrealDB startup exited ${code}`)))
})
const embeddings = createServer(async (request, response) => {
  if (request.url !== '/v1/embeddings' || request.method !== 'POST' || request.headers.authorization !== `Bearer ${env.OPENAI_API_KEY}`) {
    response.writeHead(401).end(); return
  }
  try {
    let body = ''
    for await (const chunk of request) { body += chunk; if (body.length > 2_000_000) throw new Error('Request too large') }
    const input = JSON.parse(body)
    if (input.model !== env.OPENAI_EMBEDDING_MODEL || !Array.isArray(input.input) || input.input.length > 2048 || input.input.some((value) => typeof value !== 'string')) throw new Error('Invalid embedding input')
    // ponytail: constant vectors verify ingestion/isolation only; use a real embedding provider for ranking quality.
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ data: input.input.map((_, index) => ({ index, embedding: [1, ...Array(1023).fill(0)] })), usage: { prompt_tokens: input.input.length, total_tokens: input.input.length } }))
  } catch { response.writeHead(400).end() }
})
await new Promise((done, reject) => { embeddings.once('error', reject); embeddings.listen(15056, '127.0.0.1', done) })
const bin = resolve(source, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin')
const python = resolve(bin, process.platform === 'win32' ? 'python.exe' : 'python')
const children = [
  spawn(python, ['-m', 'uvicorn', 'api.rag_main:app', '--host', '127.0.0.1', '--port', '15055'], { cwd, env, stdio: 'inherit', windowsHide: true }),
  spawn(resolve(bin, process.platform === 'win32' ? 'surreal-commands-worker.exe' : 'surreal-commands-worker'), ['--import-modules', 'rag_commands', '--max-tasks', '1'], { cwd, env, stdio: 'inherit', windowsHide: true }),
]
const stop = () => { for (const child of children) child.kill(); embeddings.close() }
for (const child of children) { child.on('error', (error) => { console.error(error); process.exitCode = 1; stop() }); child.on('exit', (code) => { if (code) process.exitCode = code; stop() }) }
process.once('SIGINT', stop)
process.once('SIGTERM', stop)

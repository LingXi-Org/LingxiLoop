import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import test from 'node:test'

// Failure model: pg removes its idle error listener on checkout. A broken
// optional SQL socket must be absorbed without an uncaughtException or a leaked
// client; no real database, credentials, or business SQL are needed here.
test('optional presentation socket failure cannot crash the process', async () => {
  const script = `
    import { createServer } from 'node:net'
    let observedQueryDisconnect = false
    const server = createServer(socket => {
      let started = false
      socket.on('error', () => {})
      socket.on('data', bytes => {
        if (!started) {
          started = true
          socket.write(Buffer.from([82,0,0,0,8,0,0,0,0,90,0,0,0,5,73]))
        } else if ([81,80].includes(bytes[0])) {
          observedQueryDisconnect = true
          socket.destroy()
        }
      })
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    process.env.DATABASE_URL = 'postgresql://fixture:fixture@127.0.0.1:' + server.address().port + '/fixture?sslmode=disable'
    process.env.DOTENV_CONFIG_PATH = '/dev/null'
    const { readOptionalToolActivity } = await import('./server/src/agent-runtime/tool-activity.ts')
    const { closeDatabasePools, presentationPool } = await import('./server/src/db/pool.ts')
    const rows = await readOptionalToolActivity({ tenantId: 'tenant', principalId: 'principal', agentId: 'agent', sessionId: 'session', runId: 'run' })
    if (!observedQueryDisconnect) throw new Error('fixture did not disconnect an active query')
    if (rows.length || presentationPool.totalCount || presentationPool.waitingCount) throw new Error('optional client leaked')
    await closeDatabasePools()
    await new Promise(resolve => server.close(resolve))
    console.log('optional socket cleaned up')
  `
  const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
      env: Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|HOME|TMP|TEMP)$/i.test(key))),
      stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000,
    })
    let output = ''
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk })
    child.on('error', reject)
    child.on('close', code => resolve({ code, output }))
  })
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /optional socket cleaned up/)
})

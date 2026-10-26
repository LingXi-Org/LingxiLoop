#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ComposeAdapter } from './adapter.mjs'
import { Executor, Journal } from './executor.mjs'
import { fault } from './journal.mjs'
import { NginxIngress } from './ingress.mjs'

export function authorized(actual, token) {
  const expected = Buffer.from(`Bearer ${token}`), supplied = Buffer.from(actual ?? '')
  return supplied.length === expected.length && timingSafeEqual(supplied,expected)
}
async function jsonBody(request, maxBytes = 1024 * 1024) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) throw fault('CONTENT_TYPE_REQUIRED','application/json is required',415)
  let bytes = 0, chunks = []
  for await (const chunk of request) {
    bytes += chunk.length
    if (bytes > maxBytes) throw fault('REQUEST_TOO_LARGE','Request body exceeds the fixed limit',413)
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw fault('INVALID_JSON','Request body must be JSON',400) }
}
export function createExecutorServer({ executor, token, ingress, dispatch = key => executor.run(key) }) {
  if (typeof token !== 'string' || token.length < 32 || /\s/.test(token)) throw fault('INVALID_CREDENTIAL','Executor bearer secret must contain at least 32 non-whitespace characters',500)
  const pending = new Set()
  const server = createServer(async (request,response) => {
    response.setHeader('content-type','application/json')
    response.setHeader('cache-control','no-store')
    const send = (status,body) => { response.statusCode = status; response.end(JSON.stringify(body)) }
    try {
      if (!authorized(request.headers.authorization,token)) return send(401,{ error: { code:'UNAUTHORIZED' } })
      const url = new URL(request.url,'http://localhost')
      if (request.method === 'GET' && url.pathname === '/health') return send(200,{ ok:true, protocol:'lingxi-release-host/v1', opsShas:executor.adapter.policy.acceptedOpsShas, phases:['prepare','apply','observe','verify','recover','drain','undrain','backup','restore-verify','migrate','recovery-drain','recovery-undrain','source-drain','restore-source','source-undrain'] })
      if (ingress && request.method === 'POST' && url.pathname === '/ingress') return send(200,await ingress.set(await jsonBody(request)))
      if (ingress && request.method === 'GET' && url.pathname === '/ingress') return send(200,await ingress.observed(url.searchParams.get('target')))
      if (request.method === 'POST' && url.pathname === '/manifests') {
        const body = await jsonBody(request)
        if (Object.keys(body).some(key => !['manifest','manifestHash'].includes(key))) throw fault('INVALID_REQUEST','Manifest registration fields are fixed',400)
        return send(201,executor.register(body.manifest,body.manifestHash))
      }
      if(request.method==='POST'&&url.pathname==='/artifact-status')return send(200,await executor.adapter.artifacts.status(await jsonBody(request,4096)))
      if(request.method==='PUT'&&url.pathname==='/artifact-parts'){
        if(!/^application\/octet-stream(?:;|$)/i.test(request.headers['content-type']??''))throw fault('CONTENT_TYPE_REQUIRED','application/octet-stream is required',415)
        const fields=['release-id','target','manifest-hash','config-digest','part-index'].map(name=>request.headers[`x-lingxi-${name}`])
        if(fields.some(value=>typeof value!=='string')||!/^\d{1,4}$/.test(fields[4]))throw fault('INVALID_ARTIFACT_REQUEST','The fixed artifact identity headers and part index are required',400)
        const[releaseId,target,manifestHash,configDigest,partIndex]=fields
        return send(200,await executor.adapter.artifacts.put({releaseId,target,manifestHash,configDigest},Number(partIndex),request))
      }
      if (request.method === 'GET' && url.pathname === '/operations') {
        const key = url.searchParams.get('key')
        if (!key || key.length > 400 || url.searchParams.getAll('key').length !== 1 || [...url.searchParams.keys()].some(key => !['key','waitSeconds'].includes(key))) throw fault('INVALID_KEY','One operation key is required',400)
        const waitValue = url.searchParams.get('waitSeconds') ?? '0'
        if (url.searchParams.getAll('waitSeconds').length > 1 || !/^\d{1,2}(?:\.\d{1,3})?$/.test(waitValue) || Number(waitValue) > 45) throw fault('INVALID_WAIT_SECONDS','waitSeconds must be between 0 and 45 with at most millisecond precision',400)
        const deadline = Date.now() + Number(waitValue) * 1000
        let operation = executor.journal.get(key)
        if (operation && (['running','uncertain'].includes(operation.status) || executor.canObserveStoppedRecoveryDrain?.(operation) === true) && !executor.active.has(key)) operation = await executor.reconcile(operation)
        // Wait only on this existing journal record. This GET never dispatches
        // an intent or repeats a side effect; inactive unknown results retain
        // the existing read-only observation at entry and once at the boundary.
        while (operation && !['succeeded','failed'].includes(operation.status) && Date.now() < deadline && !response.destroyed) {
          await new Promise(resolve => setTimeout(resolve,Math.min(250,deadline-Date.now())))
          operation = executor.journal.get(key)
        }
        if (response.destroyed) return
        if (Number(waitValue) > 0 && operation && (['running','uncertain'].includes(operation.status) || executor.canObserveStoppedRecoveryDrain?.(operation) === true) && !executor.active.has(key)) operation = await executor.reconcile(operation)
        return operation ? send(200,operation) : send(404,{ error:{ code:'OPERATION_NOT_FOUND' } })
      }
      if (request.method === 'POST' && url.pathname === '/operations') {
        const { operation,created } = executor.submit(await jsonBody(request))
        // submit's FULL SQLite transaction is committed before the 202 can be written.
        send(202,operation)
        if (created || executor.canResumeUnstartedRecoveryDrain?.(operation) === true) {
          const work = new Promise(resolve => setImmediate(resolve)).then(() => dispatch(operation.key))
          pending.add(work); work.finally(() => pending.delete(work)).catch(() => {})
        }
        return
      }
      return send(404,{ error:{ code:'NOT_FOUND' } })
    } catch (error) { send(error.status ?? 500,{ error:{ code:error.code ?? 'INTERNAL_ERROR', message:error.code ? error.message : 'Restricted host diagnostics contain details' } }) }
  })
  server.requestTimeout = 75000
  server.headersTimeout = 10000
  server.keepAliveTimeout = 5000
  server.waitForDispatch = () => Promise.allSettled([...pending])
  return server
}

export async function claimProcessLock(path) {
  mkdirSync(dirname(path),{ recursive:true,mode:0o700 })
  const child = spawn('/usr/bin/flock',['--exclusive','--nonblock','--conflict-exit-code','75',path,process.execPath,fileURLToPath(new URL('./lock-keeper.mjs',import.meta.url))],{ shell:false,stdio:['pipe','pipe','ignore'] })
  await new Promise((resolve,reject) => {
    const timer = setTimeout(()=>{ child.kill('SIGKILL');reject(fault('LOCK_STARTUP_FAILED','Kernel lock helper did not become ready',503)) },5000)
    child.once('error',()=>{clearTimeout(timer);reject(fault('LOCK_STARTUP_FAILED','Linux flock is required for executor singleton ownership',503))})
    child.once('exit',()=>{clearTimeout(timer);reject(fault('EXECUTOR_ALREADY_RUNNING','Another process owns this executor journal',503))})
    child.stdout.once('data',data=>{clearTimeout(timer);data.toString().startsWith('LOCKED') ? resolve() : reject(fault('LOCK_STARTUP_FAILED','Kernel lock helper returned invalid evidence',503))})
  })
  // If the lock holder disappears, stop accepting and let startup reconciliation handle pending effects.
  let releasing = false
  child.once('exit',()=>{if(!releasing)process.kill(process.pid,'SIGTERM')})
  return async()=>{ releasing=true; const exited=new Promise(resolve=>child.once('exit',resolve));child.stdin.end();await exited }
}

export async function main(policyPath = process.argv[2]) {
  if (!policyPath) throw Error('Usage: node --experimental-sqlite scripts/release-host/server.mjs /etc/lingxi-release/policy.json')
  const policy = JSON.parse(readFileSync(policyPath,'utf8'))
  if (!['127.0.0.1','::1'].includes(policy.listen?.host)) throw fault('INVALID_POLICY','Executor must bind loopback behind authenticated Tunnel/Access',500)
  const unlock = await claimProcessLock(resolve(policy.stateDirectory,'executor.lock'))
  let journal
  try {
  journal = new Journal(resolve(policy.stateDirectory,'journal.sqlite'))
  const executor = new Executor({ journal,adapter:new ComposeAdapter(policy),log:record => process.stderr.write(`${JSON.stringify(record)}\n`) })
  await executor.reconcileStartup()
  const token = readFileSync(policy.tokenFile,'utf8').trim()
  const server = createExecutorServer({ executor,token,ingress:policy.ingress ? new NginxIngress({ journal,policy:policy.ingress,run:(args,options) => executor.adapter.run(args,options) }) : undefined,dispatch:key => executor.run(key) })
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(policy.listen.port,policy.listen.host,resolve) })
  const shutdown = () => { server.close(async () => { await server.waitForDispatch(); journal.close(); await unlock() }) }
  process.once('SIGTERM',shutdown); process.once('SIGINT',shutdown)
  return { server,executor }
  } catch (error) { journal?.close(); await unlock(); throw error }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { process.stderr.write(`${error.code ?? 'STARTUP_FAILED'}: ${error.code ? error.message : 'Check restricted policy and host diagnostics'}\n`); process.exitCode = 1 })

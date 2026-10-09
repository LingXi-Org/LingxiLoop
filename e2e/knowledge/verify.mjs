import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

// Failure modes: unauthenticated access, duplicate ingestion, changed replay,
// stalled worker, tenant/source leaks, logged content, corrupt upload metadata,
// retry without original content, SSRF, stale chunks after deletion.
const base = 'http://127.0.0.1:15055'
const key = `e2e-${randomUUID()}`
const checks = []
const objects = new S3Client({ endpoint: 'http://127.0.0.1:59000', region: 'auto', forcePathStyle: true, credentials: { accessKeyId: 'lingxiloop-e2e', secretAccessKey: 'lingxiloop-e2e-storage-local' } })
const objectKey = `knowledge-sources/${key}/telemetry.txt`
const sql = (query) => {
  const result = spawnSync('docker', ['compose', '-f', 'e2e/knowledge/compose.yaml', 'exec', '-T', 'surrealdb', '/surreal', 'sql', '--namespace', 'lingxiloop_e2e', '--database', 'lingxiloop_e2e', '--json', '--hide-welcome'], {
    encoding: 'utf8', windowsHide: true, timeout: 30_000, input: `${query}\n`,
  })
  assert.equal(result.status, 0, 'Inspect isolated SurrealDB fixture')
  return JSON.parse(result.stdout)
}
const assertPrivateCommand = (commandId) => {
  assert.match(commandId, /^command:[a-z0-9]+$/i)
  assert.deepEqual(sql(`SELECT VALUE args.content_state FROM ${commandId};`), [[{}]], 'Worker command arguments must omit source content')
}
const request = async (path, method = 'GET', body, status = 200, idempotencyKey = key) => {
  const response = await fetch(`${base}${path}`, {
    method, headers: { Authorization: 'Bearer lingxiloop-e2e-notebook-local', 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey, Connection: 'close' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000),
  })
  assert.equal(response.status, status, `${method} ${path}: ${await response.clone().text()}`)
  return response.json()
}
const completedSource = async (sourceId) => {
  let detail
  for (let attempt = 0; attempt < 90; attempt++) {
    detail = await request(`/api/sources/${sourceId}`)
    if (detail.embedded_chunks > 0 && detail.status === 'completed') return detail
    assert.notEqual(detail.status, 'failed', 'Background ingestion failed')
    await delay(1000)
  }
  assert.fail(`Background ingestion timed out: ${detail?.status}`)
}
try {
  assert.equal((await fetch(`${base}/api/notebooks`, { method: 'POST' })).status, 401)
  checks.push('Bearer authentication rejects unauthenticated requests')
  const ready = await request('/readyz')
  assert.equal(ready.embedding_dimensions, 1024)
  checks.push('Real SurrealDB schema and object-storage readiness')
  const notebook = await request('/api/notebooks', 'POST', { name: key, description: 'Synthetic E2E notebook', external_key: key })
  assert.equal((await request('/api/notebooks', 'POST', { name: key, external_key: key })).id, notebook.id)
  checks.push('Notebook creation is idempotent')
  const payload = { type: 'text', notebooks: [notebook.id], title: 'Greenhouse telemetry', content: 'Greenhouse telemetry sensors report temperature using a gateway.', company_id: key }
  const source = await request('/api/sources/json', 'POST', payload)
  assert.equal((await request('/api/sources/json', 'POST', payload)).id, source.id)
  await request('/api/sources/json', 'POST', { ...payload, content: 'Changed input' }, 409)
  checks.push('Source ingestion replay is idempotent and conflicting replay is rejected')
  assertPrivateCommand(source.command_id)
  checks.push('Queued command arguments omit source content logged by the worker')
  const detail = await completedSource(source.id)
  assert.match(detail.full_text, /Greenhouse telemetry/)
  checks.push('Real background worker extracts, chunks and stores fixture embeddings')
  const search = { query: 'telemetry', notebook_id: notebook.id, source_ids: [source.id], company_id: key, type: 'vector' }
  const hits = await request('/api/search', 'POST', search)
  assert.ok(hits.results.length > 0)
  assert.ok(hits.results.every((hit) => hit.parent_id === source.id))
  assert.deepEqual((await request('/api/search', 'POST', { ...search, company_id: `${key}-other` })).results, [])
  assert.ok((await request('/api/search', 'POST', { ...search, type: 'text' })).results.length > 0)
  assert.deepEqual((await request('/api/search', 'POST', { ...search, type: 'text', company_id: `${key}-other` })).results, [])
  const otherNotebook = await request('/api/notebooks', 'POST', { name: `${key}-other`, external_key: `${key}-other` })
  assert.deepEqual((await request('/api/search', 'POST', { ...search, notebook_id: otherNotebook.id })).results, [])
  checks.push('Vector and full-text retrieval honor tenant and selected-source boundaries')
  await request('/api/sources/json', 'POST', { type: 'link', notebooks: [notebook.id], url: 'http://127.0.0.1/private', company_id: key }, 400, `${key}-ssrf`)
  checks.push('Link ingestion rejects private network targets')
  const content = Buffer.from('Greenhouse file telemetry documents humidity sensors and calibration.')
  await objects.send(new PutObjectCommand({ Bucket: 'lingxiloop-e2e', Key: objectKey, Body: content, ContentType: 'text/plain' }))
  const filePayload = { type: 'file', notebooks: [notebook.id], title: 'File telemetry', storage_key: objectKey, filename: 'telemetry.txt', mime_type: 'text/plain', size_bytes: content.length, company_id: key }
  await request('/api/sources/json', 'POST', { ...filePayload, size_bytes: content.length + 1 }, 409, `${key}-file-size`)
  const file = await request('/api/sources/json', 'POST', filePayload, 200, `${key}-file`)
  assertPrivateCommand(file.command_id)
  assert.match((await completedSource(file.id)).full_text, /humidity sensors/)
  checks.push('Real object upload validates metadata and extracts original file content')
  await request(`/api/sources/${file.id}/retry`, 'POST', undefined, 409)
  // Model a failed persisted job only after completion, using this run's own record.
  assert.deepEqual(sql(`UPDATE ${file.command_id} SET status = 'failed' RETURN VALUE status;`), [['failed']])
  const retried = await request(`/api/sources/${file.id}/retry`, 'POST')
  assert.notEqual(retried.command_id, file.command_id)
  assertPrivateCommand(retried.command_id)
  assert.match((await completedSource(file.id)).full_text, /humidity sensors/)
  checks.push('Retry rejects completed jobs and reprocesses a failed job from its stored asset')
  await request(`/api/sources/${file.id}`, 'DELETE')
  await request(`/api/sources/${source.id}`, 'DELETE')
  await request(`/api/sources/${source.id}`, 'GET', undefined, 404)
  assert.deepEqual((await request('/api/search', 'POST', search)).results, [])
  await request(`/api/notebooks/${notebook.id}`, 'PUT', { archived: true })
  await request(`/api/notebooks/${otherNotebook.id}`, 'PUT', { archived: true })
  checks.push('Source deletion removes retrieval results; notebook archive persists')
} catch (error) {
  process.exitCode = 1
  console.error(error)
} finally {
  await objects.send(new DeleteObjectCommand({ Bucket: 'lingxiloop-e2e', Key: objectKey })).catch(() => { process.exitCode = 1 })
  objects.destroy()
  const output = new URL('../../artifacts/e2e/knowledge-validation.json', import.meta.url)
  await mkdir(new URL('./', output), { recursive: true })
  await writeFile(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), status: process.exitCode ? 'failed' : 'passed', reproduce: 'node e2e/knowledge/start.mjs (keep running), then node e2e/knowledge/verify.mjs', checks, limitations: ['Embeddings use a local constant-vector fixture; semantic ranking quality and paid providers are not verified.'] }, null, 2)}\n`)
}

import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { get } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { brotliCompressSync, brotliDecompressSync, gzipSync, gunzipSync } from 'node:zlib'
import test from 'node:test'
import compression from 'compression'
import express from 'express'
import { sendEditorAsset } from './editor-static.js'

test('editor assets negotiate precompressed bytes, HEAD and identity without double compression', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'slides-asset-'))
  const file = join(directory, 'editor.js'), bytes = Buffer.from('/* retained editor source */'.repeat(100))
  const br = brotliCompressSync(bytes), gz = gzipSync(bytes)
  await Promise.all([writeFile(file, bytes), writeFile(`${file}.br`, br), writeFile(`${file}.gz`, gz)])
  const app = express()
  app.use(compression())
  app.get('/editor.js', (req, res) => { void sendEditorAsset(req, res, file, 'text/javascript', true) })
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const request = (encoding?: string, method = 'GET') => new Promise<{ headers: import('node:http').IncomingHttpHeaders; status: number; bytes: Buffer }>((resolve, reject) => {
    get({ hostname: '127.0.0.1', port: address.port, path: '/editor.js', method,
      headers: encoding ? { 'Accept-Encoding': encoding } : {} }, res => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({ headers: res.headers, status: res.statusCode!, bytes: Buffer.concat(chunks) }))
    }).on('error', reject)
  })
  try {
    const preferred = await request('gzip, br')
    assert.equal(preferred.headers['content-encoding'], 'br')
    assert.equal(preferred.headers['content-type'], 'text/javascript; charset=utf-8')
    assert.match(String(preferred.headers.vary), /Accept-Encoding/)
    assert.match(String(preferred.headers['cache-control']), /immutable/)
    assert.deepEqual(preferred.bytes, br)
    assert.deepEqual(brotliDecompressSync(preferred.bytes), bytes)
    const fallback = await request('gzip;q=1,br;q=0.5,identity;q=0')
    assert.equal(fallback.headers['content-encoding'], 'gzip')
    assert.deepEqual(fallback.bytes, gz)
    assert.deepEqual(gunzipSync(fallback.bytes), bytes)
    const identity = await request()
    assert.equal(identity.headers['content-encoding'], undefined)
    assert.deepEqual(identity.bytes, bytes)
    const head = await request('br', 'HEAD')
    assert.equal(head.headers['content-length'], String(br.length))
    assert.equal(head.bytes.length, 0)
    assert.equal((await request('br;q=0,gzip;q=0,identity;q=0')).status, 406)
    await rm(`${file}.br`)
    assert.equal((await request('br,gzip')).headers['content-encoding'], 'gzip')
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await rm(directory, { recursive: true })
  }
})

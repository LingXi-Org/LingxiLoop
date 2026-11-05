import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import express from 'express'
import { setStaticCacheHeaders } from '../static-cache.js'

test('both app and export HTML avoid stale release entrypoints while hashed chunks remain immutable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lingxiloop-static-cache-'))
  await mkdir(join(directory, 'assets'))
  for (const file of ['index.html', 'artifact-export.html', 'assets/realm-12345678.js', 'robots.txt']) {
    await writeFile(join(directory, file), 'release one')
  }
  const app = express().use(express.static(directory, {
    index: false, maxAge: '1h', setHeaders: (res, file) => setStaticCacheHeaders(res, file, directory),
  }))
  const server = app.listen(0, '127.0.0.1')
  try {
    await once(server, 'listening')
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    for (const file of ['index.html', 'artifact-export.html']) {
      const response = await fetch(`${origin}/${file}`)
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-cache, no-store, must-revalidate')
      assert.equal(await response.text(), 'release one')
    }
    await writeFile(join(directory, 'artifact-export.html'), 'release two, new hashed renderer')
    assert.equal(await (await fetch(`${origin}/artifact-export.html`)).text(), 'release two, new hashed renderer')
    const chunk = await fetch(`${origin}/assets/realm-12345678.js`)
    assert.equal(chunk.headers.get('cache-control'), 'public, max-age=31536000, immutable')
    await chunk.arrayBuffer()
    const ordinary = await fetch(`${origin}/robots.txt`)
    assert.equal(ordinary.headers.get('cache-control'), 'public, max-age=3600')
    await ordinary.arrayBuffer()
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await rm(directory, { recursive: true, force: true })
  }
})

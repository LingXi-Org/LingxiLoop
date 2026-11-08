import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

mock.module('./native/NativeEditor', { defaultExport: () => null })
const { warmEditor, prefetchEditor } = await import('./editor-preload')

test('native intent shares one editor load without editor assets or grants', async () => {
  const requests: string[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (value: string | URL | Request) => { requests.push(String(value)); throw new Error('Unexpected editor fetch') }) as typeof fetch
  try {
    prefetchEditor()
    await Promise.all([warmEditor(), warmEditor(), warmEditor()])
    assert.deepEqual(requests, [])
  } finally { globalThis.fetch = original }
})

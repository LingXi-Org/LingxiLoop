import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

mock.module('./native/NativeEditor', { defaultExport: () => null })
const { warmEditor, warmEditorWhenIdle, prefetchEditor } = await import('./editor-preload')

test('native intent and idle paths never request old editor assets or grants', async () => {
  const requests: string[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (value: string | URL | Request) => { requests.push(String(value)); throw new Error('Unexpected editor fetch') }) as typeof fetch
  try {
    warmEditorWhenIdle('design'); warmEditorWhenIdle('slides')
    prefetchEditor('design', 'board')
    await Promise.all([warmEditor('design'), warmEditor('slides'), warmEditor('slides', 'low')])
    assert.deepEqual(requests, [])
  } finally { globalThis.fetch = original }
})

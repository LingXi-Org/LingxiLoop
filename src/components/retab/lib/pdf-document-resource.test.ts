import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { clearPdfDocumentResource, getPdfDocumentResource, getPdfPageResource, releasePdfDocumentResource, retainPdfDocumentResource, waitForPdfLoadingTask } from './pdf-document-resource'

test('real PDF loading task is disposed after closing and can be reopened', async () => {
  const bytes = await readFile('server/src/__integration__/fixtures/homework/triangle-reference.pdf')
  const content = { key: 'lifecycle-pdf', sourceKind: 'blob' as const, directUrl: null, readBytes: async () => Uint8Array.from(bytes).buffer }
  const first = await getPdfDocumentResource(content)
  retainPdfDocumentResource(content, first)
  const page = await getPdfPageResource(first, 1)
  assert.ok(page.getViewport({ scale: 1 }).width > 0)
  clearPdfDocumentResource(content)
  assert.equal(first.loadingTask.destroyed, false)
  releasePdfDocumentResource(content, first)
  assert.equal(first.loadingTask.destroyed, true)
  const second = await getPdfDocumentResource(content)
  assert.notEqual(first, second)
  assert.ok((await getPdfPageResource(second, 1)).getViewport({ scale: 1 }).width > 0)
  clearPdfDocumentResource(content)
  assert.equal(second.loadingTask.destroyed, true)
})

test('closing before bytes arrive cancels the pending load', async () => {
  let resolveBytes!: (value: ArrayBuffer) => void
  let reading!: () => void
  const started = new Promise<void>(resolve => { reading = resolve })
  const content = { key: 'cancel-pdf', sourceKind: 'blob' as const, directUrl: null, readBytes: () => { reading(); return new Promise<ArrayBuffer>(resolve => { resolveBytes = resolve }) } }
  const pending = getPdfDocumentResource(content)
  await started
  clearPdfDocumentResource(content)
  await assert.rejects(pending, { name: 'AbortError' })
  resolveBytes(new ArrayBuffer(0))
})

test('cancellation settles even if a destroyed loading task never settles', async () => {
  const controller = new AbortController()
  const task = { promise: new Promise<never>(() => {}), destroyed: false, destroy: async () => {} }
  const pending = waitForPdfLoadingTask(task, controller.signal)
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
})

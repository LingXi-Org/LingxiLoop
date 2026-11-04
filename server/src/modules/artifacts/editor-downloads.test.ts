import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { EDITOR_DOWNLOAD_SCRIPT } from './editor-downloads.js'

test('native downloads wait for a host prepared after DOM readiness and install once', async () => {
  const listeners = new Map<string, () => void>(), clicks: string[] = [], revoked: string[] = []
  const document = { readyState: 'loading', addEventListener: (name: string, fn: () => void) => listeners.set('doc:' + name, fn),
    createElement: () => ({ href: '', download: '', click() { clicks.push(this.download) }, remove() {} }), body: { append() {} } }
  const window: { designHost?: { downloads?: { save(input: unknown): Promise<void> } }; addEventListener(name: string, fn: () => void): void } = {
    addEventListener: (name, fn) => listeners.set('window:' + name, fn),
  }
  runInNewContext(EDITOR_DOWNLOAD_SCRIPT, { window, document, Blob, ArrayBuffer,
    URL: { createObjectURL: () => 'blob:owned-export', revokeObjectURL: (url: string) => revoked.push(url) },
    setTimeout: (fn: () => void, delay: number) => { assert.equal(delay, 60_000);fn() } })
  assert.doesNotThrow(() => listeners.get('doc:DOMContentLoaded')!())
  window.designHost = {}
  listeners.get('window:lingxi:design-runtime-ready')!()
  const save = window.designHost.downloads?.save
  assert.equal(typeof save, 'function')
  listeners.get('doc:DOMContentLoaded')!()
  assert.equal(window.designHost.downloads?.save, save)
  await save!({ filename: 'native.html', data: new Blob(['native source']) })
  assert.deepEqual(clicks, ['native.html']);assert.deepEqual(revoked, ['blob:owned-export'])
  await assert.rejects(save!({ filename: 'bad', data: 'not binary' }), /Invalid download/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { installFilesDebugCore, filesDebugEnabled } from '../third_party/baoyu-design/slides-source/modules/files-debug-core.js'
import { installFilesDebugPanel } from '../third_party/baoyu-design/slides-source/modules/files-debug-panel.js'

const install = factory => { const runtime = {filePublishEncodedBytes: value => String(value).length}; factory(runtime)(); return runtime }

test('browser core keeps the pinned disabled debugger and file input contracts', () => {
  const core = install(installFilesDebugCore), native = install(installFilesDebugPanel)
  assert.equal(filesDebugEnabled(() => ({getItem: () => '1'})), true)
  assert.equal(filesDebugEnabled(() => ({getItem: () => '0'})), false)
  assert.equal(filesDebugEnabled(() => {throw Error('denied')}), false)
  for (const value of [null, 'text', {content:'saved'}, new Blob(['binary']), {content:42}]) {
    assert.equal(core.fileInputDebugText(value), native.fileInputDebugText(value))
  }
  const actual = core.createFilesDebugger(), expected = native.createNoopFilesDebugger()
  assert.deepEqual(Object.keys(actual), Object.keys(expected))
  for (const name of Object.keys(actual)) {
    assert.deepEqual(typeof actual[name], typeof expected[name])
    if (typeof actual[name] === 'function' && name !== 'option') assert.deepEqual(actual[name](), expected[name]())
  }
  assert.equal(actual.option()(), true)
})

test('disabled core preserves file port results, arguments, authorization and rejection', async () => {
  const runtime = install(installFilesDebugCore)
  const files = {'slides/one.html':'draft'}, options = {base:'v1'}
  for (const result of [{ok:true,version:'v2'}, {ok:false,code:'conflict'}]) {
    const port = {canWrite:false, async publish(actualFiles, actualOptions) {assert.equal(this,port);assert.equal(actualFiles,files);assert.equal(actualOptions,options);return result}}
    const wrapped = runtime.instrumentFilesPort(port, runtime.createFilesDebugger())
    assert.equal(wrapped.canWrite, false)
    assert.equal(await wrapped.publish(files,options), result)
  }
  const failure = Error('publish denied')
  const port = {publish:async () => {throw failure}}
  await assert.rejects(runtime.instrumentFilesPort(port,runtime.createFilesDebugger()).publish(files,options), error => error === failure)
})

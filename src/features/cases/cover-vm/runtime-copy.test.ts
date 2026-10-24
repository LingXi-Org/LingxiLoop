import assert from 'node:assert/strict'
import test from 'node:test'
import { copyCoverFrameString, COVER_VM_LIMITS } from './protocol'

const json = JSON.stringify({ version: 1, sequence: 0, root: { id: 1, tag: 'svg', attrs: { viewBox: '0 0 400 320' }, children: [] } })
type Handle = { kind: string; value: unknown; dispose(): void }
function fixture(value: unknown = json, kind = 'string', length: unknown = json.length) {
  const calls: string[] = []
  const handle: Handle = { kind, value, dispose() {} }
  const context = {
    typeof: (value: Handle) => value.kind,
    getProp(value: Handle, name: string): Handle {
      assert.equal(value, handle); assert.equal(name, 'length'); calls.push('length')
      return { kind: typeof length, value: length, dispose() { calls.push('dispose-length') } }
    },
    // Model the published fast path's unsupported primitive behavior. The
    // bridge must use getProp after checking typeof, never this object API.
    getLength: () => undefined,
    getNumber: (value: Handle) => { calls.push('number'); return value.value as number },
    getString: (value: Handle) => { calls.push('copy'); return value.value as string },
  }
  return { handle, context, calls }
}
test('copies a primitive frame despite object-only getLength being undefined', () => {
  const f = fixture()
  assert.equal(copyCoverFrameString(f.context, f.handle), json)
  assert.deepEqual(f.calls, ['length', 'number', 'dispose-length', 'copy'])
})
test('rejects unbounded lengths before copying and disposes the temporary handle', () => {
  for (const length of [COVER_VM_LIMITS.bytes + 1, -1, Infinity, NaN, 0.5, '128', {}]) {
    const f = fixture(json, 'string', length)
    assert.throws(() => copyCoverFrameString(f.context, f.handle), /invalid_cover_vm_data/)
    assert.ok(f.calls.includes('dispose-length'))
    assert.ok(!f.calls.includes('copy'))
  }
})
test('rejects objects before reading properties and validates copied UTF-8/data', () => {
  const object = fixture({}, 'object')
  assert.throws(() => copyCoverFrameString(object.context, object.handle))
  assert.deepEqual(object.calls, [])
  const invalid = fixture('{"invalid":true}')
  assert.throws(() => copyCoverFrameString(invalid.context, invalid.handle))
  const wide = fixture('界'.repeat(90000), 'string', 90000)
  assert.throws(() => copyCoverFrameString(wide.context, wide.handle))
})

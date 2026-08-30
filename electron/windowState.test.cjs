/* eslint-env node */
const assert = require('node:assert/strict')
const test = require('node:test')
const { createWindowStateStore } = require('./windowState.cjs')

function store(raw, displays) {
  return createWindowStateStore({
    fs: {
      readFileSync() { return raw },
      writeFileSync() {},
    },
    filePath: () => 'window-state.json',
    displays: () => displays,
  })
}

test('window state restores only valid JSON objects', () => {
  assert.deepEqual(store('{"width":1200}', []).read(), { width: 1200 })
  assert.equal(store('null', []).read(), null)
  assert.equal(store('{', []).read(), null)
})

test('window state rejects disconnected monitor geometry', () => {
  const currentDisplay = [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }]
  const state = store('{}', currentDisplay)
  assert.deepEqual(state.visibleRect({ x: 100, y: 100, width: 1200, height: 800 }), {
    x: 100,
    y: 100,
    width: 1200,
    height: 800,
  })
  assert.equal(state.visibleRect({ x: 3000, y: 100, width: 1200, height: 800 }), null)
})

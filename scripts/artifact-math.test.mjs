import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { adaptDesignMath } from './build-artifact-math.mjs'

test('Design preview math covers both external and inline runtime without changing archived bytes', async () => {
  const original = await readFile('third_party/baoyu-design/upstream/claude-design/scripts/editor/assets/index-DavTckY0.js','utf8')
  const adapted = adaptDesignMath(original, '/* math regression marker */')
  assert.ok(adapted.includes('supportJs:e.dcSupportSource+'))
  assert.ok(adapted.includes('/* math regression marker */'))
  assert.throws(() => adaptDesignMath('unknown upstream', 'math'), /pinned Design/)
})

test('math injection preserves replacement tokens and minified dollar identifiers literally', () => {
  const math = 'class $ {}; const a = new $; if (a instanceof $&&true) { "x".replace(/x/, "$&"); } // $$ $` $\''
  const output = adaptDesignMath('supportJs:e.dcSupportSource}', math)
  assert.equal(JSON.parse(output.slice('supportJs:e.dcSupportSource+'.length, -1)), '\n;' + math)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { publicVisualizeResourceHashes } from '../im/visualize-public-resources'

test('only exact public asset names and valid fixed hashes leave the server manifest boundary', () => {
  const css='a'.repeat(64), bundle='b'.repeat(64), vendor='c'.repeat(64)
  const hashes=publicVisualizeResourceHashes({files:{'visualize.css':{sha256:css},'document.html':{sha256:css},'../state':{sha256:css},'calendar.js':{sha256:'invalid'}}},
    {resources:[{file:'d3-7.9.0.min.js',sha256:vendor},{file:'../../private',sha256:vendor},{file:'unknown.js',sha256:vendor}]},
    {files:{'gen-ui.js':{sha256:bundle},'private.json':{sha256:bundle}}})
  assert.deepEqual(hashes,{'visualize.css':css,'gen-ui.js':bundle,'vendor/d3-7.9.0.min.js':vendor})
  assert.equal(Object.isFrozen(hashes),true)
  assert.deepEqual(publicVisualizeResourceHashes(null,[],{files:{'gen-ui.js':{sha256:42}}}),{})
})

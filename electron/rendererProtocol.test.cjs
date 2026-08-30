/* eslint-env node */
const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { registerRendererScheme, rendererFile } = require('./rendererProtocol.cjs')

test('renderer protocol registers one secure standard app scheme', () => {
  let registrations
  registerRendererScheme({ registerSchemesAsPrivileged(value) { registrations = value } })
  assert.deepEqual(registrations, [
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ])
})

test('renderer paths stay inside dist and reject foreign hosts', () => {
  const distRoot = path.resolve('fixture-dist')
  assert.equal(rendererFile('app://lingxiloop/assets/index.js', distRoot), path.join(distRoot, 'assets', 'index.js'))
  assert.equal(rendererFile('app://foreign/assets/index.js', distRoot), null)
  assert.equal(rendererFile('app://lingxiloop/%2e%2e%2fsecret.txt', distRoot), null)
})

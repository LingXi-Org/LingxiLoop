import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderNativeDcModule, renderNativeEmbedSource } from './native-embed-source.js'

test('legacy JSX is syntax-transformed without executing source and React imports use the isolated runtime', async () => {
  const source = '<div id="root"></div><script type="text/babel">import React, {useState} from "react"; globalThis.__legacyRan=true; const App=()=> <h1>你好</h1>; ReactDOM.createRoot(document.getElementById("root")).render(<App/>);</script>'
  const html = await renderNativeEmbedSource(source, 'html', { runtimeUrl: '/artifact-editor/native-embed-runtime.js', nonce: 'test-nonce' })
  assert.match(html, /React.createElement/)
  assert.match(html, /globalThis.React/)
  assert.doesNotMatch(html, /type="text\/babel"/)
  assert.match(html, /data-lingxi-nonce="test-nonce"/)
  assert.equal('__legacyRan' in globalThis, false)
  assert.ok(html.indexOf('native-embed-runtime.js') < html.indexOf('React.createElement'))
})

test('JSON script data remains data and unsafe runtime URLs are rejected', async () => {
  const source = '<script type="application/json">{"text":"<unclosed>"}</script>'
  const html = await renderNativeEmbedSource(source, 'html', { runtimeUrl: '/runtime.js', nonce: 'nonce' })
  assert.ok(html.includes(source))
  await assert.rejects(renderNativeEmbedSource('', 'html', { runtimeUrl: 'javascript:alert(1)', nonce: 'nonce' }))
})

test('documented DCLogic classes are registered without evaluating them on the server', async () => {
  const source = '<script src="./support.js"></script><x-dc><h1>{{title}}</h1><sc-for list="{{items}}" as="item"><b>{{item.label}}</b></sc-for></x-dc><script type="text/x-dc" data-dc-script data-props=\'{"title":{"default":"Hello"}}\'>class Component extends DCLogic { renderVals(){return {title:this.props.title,items:[]}} }</script>'
  const html = await renderNativeEmbedSource(source, 'html', { runtimeUrl: '/runtime.js', nonce: 'nonce', resourceBaseUrl: '/original/project/' })
  assert.doesNotMatch(html, /src="\.\/support\.js"/)
  assert.doesNotMatch(html, /type="text\/x-dc"/)
  assert.match(html, /__lingxiDCMain = Component/)
  assert.match(html, /<base href="\/original\/project\/">/)
  const child = await renderNativeDcModule(source, '/original/project/Card.dc.html')
  assert.match(child, /__lingxiDCRegister/)
  assert.match(child, /"props":|props:/)
  assert.match(child, /"title":"Hello"/)
})

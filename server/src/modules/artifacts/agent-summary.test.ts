import assert from 'node:assert/strict'
import test from 'node:test'
import { createDocument, createPage } from '../../../../shared/artifact-document.js'
import { agentDocumentSummary, agentPageSummary } from './agent-summary.js'

test('50-page Agent overview excludes embedded assets, original themes and node versions without losing global preconditions', () => {
  const document = createDocument('slides', 'summary')
  document.themes.large = { id: 'large', name: 'Theme', tokens: { text: '#000' }, originalTokens: { source: 'x'.repeat(100_000) } }
  document.assets.image = { id: 'image', contentType: 'image/png', url: `data:image/png;base64,${'A'.repeat(100_000)}` }
  document.versions = { 'document/title': 1, 'theme/large': 2, 'asset/image': 3, 'asset/image/references': 4 }
  for (let index = 0; index < 50; index++) {
    const page = createPage(`p${index}`)
    document.pages[page.id] = page; document.pageOrder.push(page.id)
    for (let node = 0; node < 50; node++) document.versions[`node/${page.id}/n${node}/field/text`] = 5
  }
  const summary = agentDocumentSummary({ document, history: { version: 0, undo: null, redo: null }, pageVersions: {} })
  assert.equal(Object.keys(summary.document.pages).length, 50)
  assert.deepEqual(summary.document.versions, { 'document/themeId': 0, 'document/pageOrder': 0, 'document/title': 1, 'theme/large': 2, 'asset/image': 3, 'asset/image/references': 4 })
  assert.equal(summary.document.themes.large.tokenCount, 1)
  assert.equal(summary.document.assets.image.contentType, 'image/png')
  assert.ok(JSON.stringify(summary).length < 16_000)
})

test('only ephemeral legacy summaries advertise a source snapshot token', () => {
  const document = createDocument('design', 'legacy-summary')
  const snapshot = { document, history: { version: 0, undo: null, redo: null }, pageVersions: {}, original: { version: 'local-0123456789abcdef', files: {}, warnings: [] } }
  assert.equal(agentDocumentSummary(snapshot).sourceVersion, snapshot.original.version)
  assert.equal(agentDocumentSummary({ ...snapshot, pageVersions: { one: 'a'.repeat(64) } }).sourceVersion, undefined)
})

test('canvas metadata and membership CAS tokens remain available without reading node payloads',()=>{
  const document=createDocument('design','canvas-agent'),page=createPage('board')
  page.canvasPageId='sheet';document.pageOrder=[page.id];document.pages[page.id]=page
  document.canvasPages=[{id:'sheet',name:'第一张画布'}]
  document.versions={'document/canvasPages':3,'canvasPage/sheet/members':5,'page/board/field/canvasPageId':7}
  const summary=agentDocumentSummary({document,history:{version:0,undo:null,redo:null},pageVersions:{}})
  assert.equal(summary.document.pages.board.canvasPageId,'sheet')
  assert.equal(summary.document.versions['canvasPage/sheet/members'],5)
  assert.equal(summary.document.versions['document/canvasPages'],3)
  assert.equal(summary.document.versions['page/board/field/canvasPageId'],undefined)
})

test('initial native documents expose zero CAS counters without rewriting stored versions', () => {
  const document = createDocument('design', 'initial-cas')
  const summary = agentDocumentSummary({ document, history: { version: 0, undo: null, redo: null }, pageVersions: {} })
  for (const key of ['document/title', 'document/themeId', 'document/pageOrder', 'document/canvasPages']) assert.equal(summary.document.versions[key], 0, key)
  assert.deepEqual(document.versions, {}, 'reading must not materialize counters in durable content')
})


test('page reads expose initial counters before content and retain observed nonzero versions', () => {
  const page = createPage('initial-page')
  page.notes = 'x'.repeat(20_000)
  const snapshot = { page, seq: 7, version: 'a'.repeat(64), versions: { 'page/initial-page/field/title': 7 } }
  const summary = agentPageSummary(snapshot)
  assert.equal(summary.versions['page/initial-page/exists'], 0)
  assert.equal(summary.versions['page/initial-page/nodeOrder'], 0)
  assert.equal(summary.versions['page/initial-page/field/width'], 0)
  assert.equal(summary.versions['page/initial-page/field/title'], 7)
  assert.equal(summary.seq, snapshot.seq); assert.equal(summary.version, snapshot.version)
  assert.ok(JSON.stringify(summary).indexOf('page/initial-page/exists') < JSON.stringify(summary).indexOf(page.notes))
  assert.deepEqual(snapshot.versions, { 'page/initial-page/field/title': 7 })
})

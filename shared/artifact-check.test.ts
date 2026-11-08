import {createCanvasContents} from './artifact-canvas-pages.js'
import {applyOperations,prepareBatch} from './artifact-operations.js'
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkArtifactDocument } from './artifact-check.js'
import { createDocument, createNode, createPage } from './artifact-document.js'

function fixture() {
  const document = createDocument('design', 'canvas')
  const page = createPage('board')
  page.nodes.title = { ...createNode('text', 'title'), text: 'Authored content' }
  page.nodeOrder = ['title']
  document.pages.board = page
  document.pageOrder = ['board']
  return document
}

test('authored evidence names only indexed nonempty requested native pages', () => {
  const document = fixture()
  document.pages.empty = createPage('empty')
  document.pageOrder.push('empty')
  const report = checkArtifactDocument(document, ['project/pages/board.json', 'project/pages/empty.json', 'project/pages/deleted.json', 'project/old.dc.html', 'project/pages/board.json'])
  assert.equal(report.pageCount, 2)
  assert.equal(report.boardCount, 2)
  assert.deepEqual(report.checkedPageIds, ['board'])
  assert.deepEqual(report.checkedBoardPaths, ['project/pages/board.json'])
  assert.equal(report.problems, 1)
  assert.equal(report.issues[0]?.code, 'empty_page')
})

test('a new blank document is valid but has no authored evidence', () => {
  const document = createDocument('slides', 'deck')
  document.pages.page = createPage('page')
  document.pageOrder = ['page']
  const report = checkArtifactDocument(document)
  assert.equal(report.problems, 0)
  assert.deepEqual(report.checkedPageIds, [])
})

test('schema and reference failures cannot claim completion', () => {
  const document = fixture()
  document.pages.board!.nodes.image = { ...createNode('image', 'image'), assetId: 'missing' }
  document.pages.board!.nodeOrder.push('image')
  const report = checkArtifactDocument(document)
  assert.equal(report.problems, 1)
  assert.deepEqual(report.issues[0], { severity: 'error', code: 'missing_asset', pageId: 'board', nodeId: 'image', message: '图片资源不存在：missing' })
  assert.deepEqual(report.checkedPageIds, [])
  assert.equal(checkArtifactDocument({ ...document, schemaVersion: 999 }).problems, 1)
})

test('isolated embeds remain explicit advisories and are never evaluated', () => {
  const document = fixture()
  document.pages.board!.nodes.embed = { ...createNode('embed', 'embed'), embed: { source: '<script>throw Error("must not execute")</script>', format: 'html' } }
  document.pages.board!.nodeOrder.push('embed')
  const report = checkArtifactDocument(document)
  assert.equal(report.problems, 0)
  assert.equal(report.issues[0]?.code, 'isolated_content')
  assert.equal(report.issues[0]?.severity, 'warning')
  assert.deepEqual(report.checkedPageIds, ['board'])
})

test('group cycles, missing payloads and unindexed nodes are reported with identities', () => {
  const document = fixture(), page = document.pages.board!
  page.nodes.a = { ...createNode('group', 'a'), parentId: 'b' }
  page.nodes.b = { ...createNode('group', 'b'), parentId: 'a' }
  page.nodes.formula = { ...createNode('math', 'formula'), source: '' }
  page.nodes.unindexed = createNode('text', 'unindexed')
  page.nodeOrder.push('a', 'b', 'formula')
  const report = checkArtifactDocument(document)
  assert.ok(report.issues.some(issue => issue.code === 'group_cycle' && issue.nodeId === 'a'))
  assert.ok(report.issues.some(issue => issue.code === 'missing_formula' && issue.nodeId === 'formula'))
  assert.ok(report.issues.some(issue => issue.code === 'node_order' && issue.pageId === 'board'))
  assert.deepEqual(report.checkedPageIds, [])
})


test('free canvas content is checked independently without being counted as a board',()=>{
  const original=fixture(),note={...createNode('note','free'),text:'独立说明',y:-300}
  const doc=applyOperations(original,prepareBatch(original,[...createCanvasContents(original,'canvas-page-1','contents'),{type:'node.insert',pageId:'contents',node:note}])).document
  const report=checkArtifactDocument(doc,['project/pages/contents.json'])
  assert.equal(report.problems,0)
  assert.equal(report.boardCount,1)
  assert.deepEqual(report.checkedPageIds,['contents'])
  assert.deepEqual(report.checkedBoardPaths,[])
})

import assert from 'node:assert/strict'
import test from 'node:test'
import {createDocument,createPage,validateArtifactDocument} from './artifact-document.js'
import {applyOperations,prepareBatch,ArtifactOperationConflict} from './artifact-operations.js'
import {duplicatePages} from './artifact-editor-actions.js'

test('画板四角保存重开、共享撤销和复制保留形状，旧快照不变',()=>{
  const before=createDocument('design','radius'),page=createPage('p','圆角画板');before.pages.p=page;before.pageOrder=['p']
  const original=JSON.stringify(before)
  const patch=[{type:'page.patch' as const,pageId:'p',patch:{radius:[10,20,30,40] as [number,number,number,number]}}]
  const saved=applyOperations(before,prepareBatch(before,patch,'radius'))
  assert.deepEqual(validateArtifactDocument(JSON.parse(JSON.stringify(saved.document))).pages.p.radius,[10,20,30,40])
  const undone=applyOperations(saved.document,prepareBatch(saved.document,saved.inverse,'undo'))
  assert.equal(Object.hasOwn(undone.document.pages.p,'radius'),false)
  const redone=applyOperations(undone.document,prepareBatch(undone.document,undone.inverse,'redo'))
  assert.deepEqual(redone.document.pages.p.radius,[10,20,30,40])
  const copy=applyOperations(redone.document,prepareBatch(redone.document,duplicatePages(redone.document,['p'],()=> 'copy'),'copy'))
  assert.deepEqual(copy.document.pages.copy.radius,[10,20,30,40]);assert.notEqual(copy.document.pages.copy.radius,copy.document.pages.p.radius)
  assert.throws(()=>applyOperations(saved.document,prepareBatch(before,patch,'stale')),ArtifactOperationConflict)
  assert.equal(JSON.stringify(before),original)
})

test('圆角缺省、数值边界及CSS缩放与原版定义一致',async()=>{
  const {normalizePageRadius,pageRadiusCss,pageRadiusPath}=await import('./artifact-page-radius.js')
  assert.equal(normalizePageRadius(0),undefined);assert.equal(normalizePageRadius(-1),undefined)
  assert.equal(normalizePageRadius(9000),4000);assert.equal(normalizePageRadius(12.345),12.35)
  assert.deepEqual(normalizePageRadius([1,2,3,4]),[1,2,3,4]);assert.equal(normalizePageRadius([1,2,3]),undefined)
  assert.equal(normalizePageRadius([1,2,NaN,4]),undefined);assert.equal(pageRadiusCss([10,20,30,40]),'10px 20px 30px 40px')
  assert.match(pageRadiusPath(200,400,300),/^M150 0 H250 A150 150/)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import {createDocument,createNode,createPage} from '../../../../shared/artifact-document'
import {outlineRows,outlineNodeSummary} from './outline-rows'

test('图层按文档顺序分组，折叠的组合不挂载子项',()=>{
  const document=createDocument('design','outline'),page=createPage('page','画板一')
  const group=createNode('group','group'),text={...createNode('text','text'),parentId:'group',text:'中文标题'},image=createNode('image','image')
  page.nodeOrder=['text','group','image'];page.nodes={group,text,image};document.pageOrder=['page'];document.pages={page}
  const collapsed=outlineRows(document,['page'],new Set(['page:page']))
  assert.deepEqual(collapsed.map(row=>row.key),['page:page','node:page:group','node:page:image'])
  const expanded=outlineRows(document,['page'],new Set(['page:page','node:page:group']))
  assert.deepEqual(expanded.map(row=>[row.key,row.level,row.position,row.size]),[['page:page',1,1,1],['node:page:group',2,1,2],['node:page:text',3,1,1],['node:page:image',2,2,2]])
  assert.equal(expanded[2].parentKey,'node:page:group')
  assert.equal(outlineNodeSummary(document,'page',group),'中文标题')
  assert.equal(outlineNodeSummary(document,'page',{...group,name:'自定义名称'}),'自定义名称')
})

test('图层只包含当前画布的画板，未加载页保留可展开身份',()=>{
  const document=createDocument('design','outline'),one=createPage('one','画板一'),two=createPage('two','画板二')
  document.pages={one,two};document.pageOrder=['one','two']
  const rows=outlineRows(document,['two'],new Set(),new Set(['one']))
  assert.deepEqual(rows.map(row=>row.key),['page:two'])
  assert.equal(rows[0].expandable,true)
  assert.deepEqual(outlineRows(document,['two'],new Set(['page:two']),new Set(['one'])).map(row=>row.kind),['page','pending'])
})

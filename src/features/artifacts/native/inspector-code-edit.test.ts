import assert from 'node:assert/strict'
import test from 'node:test'
import {createNode,createPage} from '../../../../shared/artifact-document'
import {nodeCodeEntries,nodeCodePatch} from './inspector-code-edit'

test('代码中的像素几何回到原生字段，外观声明与中文属性保留',()=>{
  const page=createPage('page'),node={...createNode('text','text'),style:{fontSize:32,color:'#222222'}}
  const before=nodeCodeEntries(node,page),after=before.map(entry=>entry.name==='width'?{...entry,value:'480px'}:entry)
  after.push({name:'filter',value:'blur(1px)'},{name:'@data-label',value:'中文测试'})
  const change=nodeCodePatch(node,before,after)
  assert.equal(change.patch.width,480)
  assert.equal(change.patch.css?.filter,'blur(1px)')
  assert.equal(change.patch.css?.width,undefined)
  assert.equal(change.patch.attributes?.['data-label'],'中文测试')
  assert.equal(change.patch.style,undefined)
})

test('混合选择只更改编辑过的共同声明；旧样式不被空代码覆盖',()=>{
  const node={...createNode('text','text'),css:{filter:'blur(1px)'},style:{fontSize:28,color:'#123456'}}
  const change=nodeCodePatch(node,[{name:'filter',value:'blur(1px)'}],[])
  assert.deepEqual(change.unset,['css'])
  assert.equal(change.patch.style,undefined)
})

test('代码属性批次在提交前拒绝事件处理属性',()=>{
  const node=createNode('text','text')
  assert.throws(()=>nodeCodePatch(node,[],[{name:'@onclick',value:'alert(1)'}]),/智能体/)
})

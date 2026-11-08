import assert from 'node:assert/strict'
import test from 'node:test'
import {createNode,createPage} from '../../../../shared/artifact-document'
import {nodeCodeEntries,nodeCodePatch} from './inspector-code-edit'

test('弹性布局的相对偏移只保存在CSS，不误写未参与布局的绝对坐标',()=>{
 const page=createPage('page'),parent=createNode('group','parent'),node=createNode('text','child');parent.layout={mode:'flex'};node.parentId=parent.id;page.nodes[parent.id]=parent;page.nodes[node.id]=node
 const before=nodeCodeEntries(node,page),change=nodeCodePatch(node,page,before,[...before,{name:'left',value:'24px'}])
 assert.equal(change.patch.x,undefined);assert.equal(change.patch.css?.left,'24px')
})

test('代码中的像素几何回到原生字段，外观声明与中文属性保留',()=>{
  const page=createPage('page'),node={...createNode('text','text'),style:{fontSize:32,color:'#222222'}}
  const before=nodeCodeEntries(node,page),after=before.map(entry=>entry.name==='width'?{...entry,value:'480px'}:entry)
  after.push({name:'filter',value:'blur(1px)'},{name:'@data-label',value:'中文测试'})
  const change=nodeCodePatch(node,page,before,after)
  assert.equal(change.patch.width,480)
  assert.equal(change.patch.css?.filter,'blur(1px)')
  assert.equal(change.patch.css?.width,undefined)
  assert.equal(change.patch.attributes?.['data-label'],'中文测试')
  assert.equal(change.patch.style,undefined)
})

test('混合选择只更改编辑过的共同声明；旧样式不被空代码覆盖',()=>{
  const page=createPage('page'),node={...createNode('text','text'),css:{filter:'blur(1px)'},style:{fontSize:28,color:'#123456'}}
  const change=nodeCodePatch(node,page,[{name:'filter',value:'blur(1px)'}],[])
  assert.deepEqual(change.unset,['css'])
  assert.equal(change.patch.style,undefined)
})

test('代码属性批次在提交前拒绝事件处理属性',()=>{
  const page=createPage('page'),node=createNode('text','text')
  assert.throws(()=>nodeCodePatch(node,page,[],[{name:'@onclick',value:'alert(1)'}]),/智能体/)
})

test('行高的像素值保持CSS单位，无单位数才映射为原生倍数',()=>{
  const page=createPage('page'),node={...createNode('text','text'),style:{fontSize:48,lineHeight:1.25}}
  const before=nodeCodeEntries(node,page)
  const pixels=nodeCodePatch(node,page,before,before.map(entry=>entry.name==='line-height'?{...entry,value:'2px'}:entry))
  assert.equal(pixels.patch.style?.lineHeight,undefined)
  assert.equal(pixels.patch.css?.['line-height'],'2px')
  const ratio=nodeCodePatch(node,page,before,before.map(entry=>entry.name==='line-height'?{...entry,value:'2'}:entry))
  assert.equal(ratio.patch.style?.lineHeight,2)
  assert.equal(ratio.patch.css,undefined)
})

test('长度声明不会把缺少单位的非零数值改写为像素',()=>{
  const page=createPage('page'),node=createNode('text','text')
  for(const [name,field]of [['width','width'],['left','x'],['font-size','fontSize']] as const){
    const change=nodeCodePatch(node,page,[],[{name,value:'480'}])
    assert.equal(change.patch.css?.[name],'480')
    assert.equal(field==='fontSize'?change.patch.style?.fontSize:change.patch[field],undefined)
  }
  assert.equal(nodeCodePatch(node,page,[],[{name:'width',value:'0'}]).patch.width,0)
  assert.equal(nodeCodePatch(node,page,[],[{name:'stroke-width',value:'5'}]).patch.style?.strokeWidth,5)
})

test('合法CSS超出原生字段范围时保留声明，交给浏览器绘制',()=>{
  const page=createPage('page'),node=createNode('text','text')
  for(const [name,value] of [['font-size','0px'],['line-height','0'],['font-weight','42'],['width','1000001px']]){
    const change=nodeCodePatch(node,page,[],[{name,value}])
    assert.equal(change.patch.css?.[name],value)
  }
})

test('重要声明保留在CSS中，不能被原生字段丢失优先级',()=>{
  const page=createPage('page'),node=createNode('text','text')
  for(const [name,value]of [['color','#123456 !important'],['font-family','Arial !important'],['font-size','24px !important']]){
    const change=nodeCodePatch(node,page,[],[{name,value}])
    assert.equal(change.patch.css?.[name],value)
    assert.equal(change.patch.style,undefined)
  }
})

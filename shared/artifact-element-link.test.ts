import assert from 'node:assert/strict'
import test from 'node:test'
import {createNode,artifactNodeSchema} from './artifact-document.js'
import {elementLink,elementLinkPatch} from './artifact-element-link.js'
import {isSafeArtifactLink} from './artifact-links.js'

test('source link destinations survive schema validation without enabling active schemes',()=>{
  const node=createNode('text','heading');node.text='中文链接'
  for(const href of ['https://example.test/中文','example.test','../页面.html','#section','mailto:hello@example.test','tel:+861234567890']){
    assert.equal(isSafeArtifactLink(href),true,href)
    const {patch}=elementLinkPatch(node,href),next=artifactNodeSchema.parse({...node,...patch})
    assert.equal(elementLink(next),href)
  }
  for(const href of ['javascript:alert(1)','java\nscript:alert(1)','data:text/html,test','vbscript:test','blob:https://example.test/id']){
    assert.equal(isSafeArtifactLink(href),false,href)
    assert.throws(()=>elementLinkPatch(node,href),/链接格式无效/)
  }
})

test('existing accepted web and fragment marks remain readable, including incomplete URL drafts',()=>{
  for(const href of ['https://','https://example.test/path\\name','#part\\name']){
    const node=createNode('text','legacy-link')
    node.richText={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'原有链接',marks:[{type:'link',attrs:{href}}]}]}]}
    assert.deepEqual(artifactNodeSchema.parse(node).richText,node.richText)
  }
})

test('linking mixed text retains headings, formatting, targets and original input',()=>{
  const node=createNode('text','heading')
  node.richText={type:'doc',content:[{type:'heading',attrs:{level:2},content:[{type:'text',text:'甲',marks:[{type:'bold'},{type:'link',attrs:{href:'https://old.test/',target:'_blank'}}]},{type:'text',text:'乙',marks:[{type:'italic'}]}]}]}
  const original=structuredClone(node)
  assert.equal(elementLink(node),null)
  const {patch}=elementLinkPatch(node,'../目标.html'),next={...node,...patch}
  assert.equal(elementLink(next),'../目标.html')
  const parts=next.richText!.content![0].content!
  assert.deepEqual(parts[0].marks,[{type:'bold'},{type:'link',attrs:{href:'../目标.html',target:'_blank'}}])
  assert.deepEqual(parts[1].marks,[{type:'italic'},{type:'link',attrs:{href:'../目标.html'}}])
  assert.equal(next.richText!.content![0].attrs!.level,2)
  const cleared={...next,...elementLinkPatch(next,'').patch}
  assert.equal(elementLink(cleared),'')
  assert.deepEqual(cleared.richText!.content![0].content!.map(part=>part.marks),[[{type:'bold'}],[{type:'italic'}]])
  assert.deepEqual(node,original)
})

test('repeated destinations are no-ops and removing plain links restores the text tree',()=>{
  const node=createNode('text','heading')
  node.richText={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'内容'}]}]}
  const next={...node,...elementLinkPatch(node,'#target').patch}
  assert.deepEqual(elementLinkPatch(next,'#target'),{patch:{},unset:[]})
  assert.deepEqual(elementLinkPatch(next,'').patch.richText,node.richText)
  assert.deepEqual(elementLinkPatch(node,''),{patch:{},unset:[]})
})

test('whole element links preserve authored attributes and clear only the destination',()=>{
  const node=createNode('image','image');node.attributes={title:'中文图片',target:'_blank',href:'https://old.test/'}
  const {patch}=elementLinkPatch(node,'../图片页.html')
  assert.deepEqual(patch.attributes,{title:'中文图片',target:'_blank',href:'../图片页.html'})
  assert.deepEqual(elementLinkPatch({...node,...patch},'').patch.attributes,{title:'中文图片',target:'_blank'})
  const empty=createNode('image','plain');assert.deepEqual(elementLinkPatch(empty,''),{patch:{},unset:[]})
})

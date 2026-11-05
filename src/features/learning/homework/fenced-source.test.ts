import assert from 'node:assert/strict'
import { test } from 'node:test'
import { recoverFencedCode } from '@/features/content-editor/fenced-code'
import type { ContentDocument } from '@/features/content-editor/document'
import type { ContentBlock } from '@/features/content-editor/schema'
const paragraph=(id:string,text:string,italic=false)=>({id,type:'paragraph',props:{textAlignment:'left',textColor:'default',backgroundColor:'default'},content:[{type:'text',text,styles:italic?{italic:true}:{}}],children:[]} as ContentBlock)
const code='x = 2+3*4\nprint(x)'
const source='```python\n'+code+'\n```'
const importCode=()=>[{id:'new-code',type:'codeBlock',props:{language:'python'},content:[{type:'text',text:code,styles:{}}],children:[]} as ContentBlock]
const document=(blocks:ContentBlock[],projection=source):ContentDocument=>({format:'blocknote',version:1,blocks,projection,sections:[projection]})
test('604 current exact-fence recovery preserves surrounding authored italic and code operators',()=>{
  const italic=paragraph('italic','保留斜体',true)
  const result=recoverFencedCode(document([paragraph('opening',source),italic]),source,importCode)
  assert.equal(result.blocks[0].type,'codeBlock')
  assert.equal(result.blocks[0].id,'opening')
  assert.equal(result.blocks[1],italic)
})
test('604 styled or ambiguous native paragraphs and stale recovery source are never destructively converted',()=>{
  for(const original of [document([paragraph('styled',source,true)]),document([paragraph('a',source),paragraph('b',source)]),document([paragraph('a',source)],'新内容')]) {
    assert.equal(recoverFencedCode(original,source,importCode),original)
  }
})

import assert from 'node:assert/strict'
import test from 'node:test'
import {mergeElementFontStates} from './element-font-selection'
import {elementFontSelectionVariantPatch,elementFontSelectionFamilyChoice} from './element-font-selection'
import {createNode,createPage} from '../../../../shared/artifact-document'

test('多选合并比较自有声明，计算值一致不能掩盖混合声明',()=>{
 const states=[{value:'500',fallback:'500',companionValue:null},{value:null,fallback:'500',companionValue:null}]
 const before=JSON.stringify(states),merged=mergeElementFontStates(states)
 assert.equal(merged.value,null);assert.equal(merged.mixed,true);assert.equal(merged.fallback,'500');assert.equal(merged.companionMixed,false);assert.equal(JSON.stringify(states),before)
})

test('所有自有声明为空时保持未声明，计算值不同只清除共同回退',()=>{
 const merged=mergeElementFontStates([{value:null,fallback:'700'},{value:null,fallback:'400'}])
 assert.equal(merged.value,null);assert.equal(merged.mixed,false);assert.equal(merged.fallback,undefined)
})

test('伴随声明独立合并，多选不携带单元素伴随回退',()=>{
 const merged=mergeElementFontStates([{value:'700',companionValue:'italic',companionFallback:'italic'},{value:'700',companionValue:'normal',companionFallback:'normal'}])
 assert.equal(merged.value,'700');assert.equal(merged.mixed,false);assert.equal(merged.companionValue,null);assert.equal(merged.companionMixed,true);assert.equal('companionFallback' in merged,false)
})

test('共同变量保留原文本，中文作者值不翻译或改写',()=>{
 const merged=mergeElementFontStates([{value:'var(--中文字重,600)',fallback:'600'},{value:'var(--中文字重,600)',fallback:'600'}])
 assert.equal(merged.value,'var(--中文字重,600)');assert.equal(merged.mixed,false);assert.equal(merged.fallback,'600')
 assert.equal(mergeElementFontStates([{value:'宋体'},{value:'Arial'}]).mixed,true)
})

test('混合伴随声明选择常规时统一清除，不逐元素推断斜体',()=>{
 const node=createNode('text','one'),page=createPage('page');node.style={fontWeight:700,fontStyle:'italic'}
 const merged=mergeElementFontStates([{value:'700',companionValue:'italic'},{value:'700',companionValue:'normal'}])
 const result=elementFontSelectionVariantPatch(node,page,{weight:400,style:'normal'},merged)
 assert.equal(result.patch.style?.fontWeight,400);assert.ok(result.unset.includes('style.fontStyle'));assert.equal(result.patch.style?.fontStyle,undefined)
})

test('共同斜体切换常规显式覆盖，当前共同值重复选择不写入',()=>{
 const node=createNode('text','one'),page=createPage('page');node.css={'font-weight':'700','font-style':'italic',color:'red'}
 const merged=mergeElementFontStates([{value:'700',companionValue:'italic'},{value:'700',companionValue:'italic'}])
 assert.deepEqual(elementFontSelectionVariantPatch(node,page,{weight:700,style:'italic'},merged),{patch:{},unset:[]})
 const result=elementFontSelectionVariantPatch(node,page,{weight:400,style:'normal'},merged)
 assert.equal(result.patch.style?.fontStyle,'normal');assert.deepEqual(result.patch.css,{color:'red'})
})

test('混合字体统一使用固定来源目录的通用回退，不翻译作者字体名称',()=>{
 const choice=(family:string)=>elementFontSelectionFamilyChoice({value:family,family,label:'自定义字体'}).family
 assert.equal(choice('Arial'),'Arial, sans-serif');assert.equal(choice('Georgia'),'Georgia, serif');assert.equal(choice('Courier New'),'Courier New, monospace');assert.equal(choice('Merriweather'),'Merriweather, serif');assert.equal(choice('宋体'),'"宋体"')
})

test('单选缺省字形读取真实标题粗体与继承斜体，多选不误用单项继承',()=>{
 const single=mergeElementFontStates([{value:null,fallback:'700',companionValue:null,companionFallback:'italic'}])
 assert.equal(single.companionFallback,'italic')
 const node=createNode('text','single'),page=createPage('page'),result=elementFontSelectionVariantPatch(node,page,{weight:400,style:'normal'},single)
 assert.equal(result.patch.style?.fontWeight,400);assert.equal(result.patch.style?.fontStyle,'normal')
 const multi=mergeElementFontStates([{value:null,fallback:'700',companionFallback:'italic'},{value:null,fallback:'700',companionFallback:'italic'}])
 assert.equal('companionFallback' in multi,false)
})

test('单选自有inherit斜体声明优先于计算值，重选当前字形零写入',()=>{
 const node=createNode('text','single'),page=createPage('page');node.style={fontWeight:700};node.css={'font-style':'inherit'}
 const single=mergeElementFontStates([{value:'700',fallback:'700',companionValue:'inherit',companionFallback:'italic'}])
 assert.deepEqual(elementFontSelectionVariantPatch(node,page,{weight:700,style:'normal'},single),{patch:{},unset:[]})
})

import assert from 'node:assert/strict'
import test from 'node:test'
import {createNode,createPage,type ArtifactNode,type ArtifactPage} from '../../../../shared/artifact-document'
import {parseElementFontWeight,elementFontWeightText} from './element-font-variant'

import {mergeElementFontStates,elementFontSelectionVariantPatch} from './element-font-selection'

const singleVariant=(node:ArtifactNode,page:ArtifactPage,variant:Parameters<typeof elementFontSelectionVariantPatch>[2],computed:{weight:number;italic:boolean})=>elementFontSelectionVariantPatch(node,page,variant,mergeElementFontStates([{value:elementFontWeightText(node),companionValue:node.css?.['font-style']??node.style.fontStyle,fallback:String(computed.weight),companionFallback:computed.italic?'italic':'normal'}]))

test('还原字重同时清除自有字重与字形声明，保留装饰和其他作者属性',()=>{
 const node=createNode('text','text'),page=createPage('page');node.style={fontWeight:700,fontStyle:'italic',textDecoration:'underline',fontFamily:'Arial'};node.css={'font-weight':'600 !important','font-style':'oblique 10deg',color:'red'}
 const before=JSON.stringify(node),result=singleVariant(node,page,null,{weight:600,italic:true})
 assert.ok(result.unset.includes('style.fontWeight'));assert.ok(result.unset.includes('style.fontStyle'));assert.deepEqual(result.patch.css,{color:'red'});assert.equal(result.patch.style?.textDecoration,undefined);assert.equal(JSON.stringify(node),before)
})

test('选择字形替换冲突CSS，显式普通字形覆盖父级斜体但不改变字体',()=>{
 const node=createNode('text','text'),page=createPage('page');node.style={fontFamily:'Arial'};node.css={'font-weight':'700 !important','font-style':'italic',color:'red'}
 const result=singleVariant(node,page,{weight:400,style:'normal'},{weight:700,italic:true})
 assert.equal(result.patch.style?.fontWeight,400);assert.equal(result.patch.style?.fontStyle,'normal');assert.equal(result.patch.style?.fontFamily,undefined);assert.deepEqual(result.patch.css,{color:'red'})
})

test('当前自有字形不写回，继承字形的明确选择成为可保存声明',()=>{
 const node=createNode('text','text'),page=createPage('page');node.style={fontWeight:700,fontStyle:'italic'}
 assert.deepEqual(singleVariant(node,page,{weight:700,style:'italic'},{weight:700,italic:true}),{patch:{},unset:[]})
 node.style={};const result=singleVariant(node,page,{weight:700,style:'italic'},{weight:700,italic:true});assert.equal(result.patch.style?.fontWeight,700);assert.equal(result.patch.style?.fontStyle,'italic')
})


test('字重字面解析采用来源语义，变量与优先级表达式保留文本输入',()=>{
 for(const [input,expected]of [['700',700],[' 500.5 ',500.5],['normal',400],['bold',700]] as const)assert.equal(parseElementFontWeight(input),expected)
 for(const input of ['var(--weight)','calc(400 + 100)','inherit','bolder','700 !important','+700','7e2','BOLD',''])assert.equal(parseElementFontWeight(input),undefined)
 const node=createNode('text','text');node.style={fontWeight:700};node.css={'font-weight':'var(--weight)'};assert.equal(elementFontWeightText(node),'var(--weight)');delete node.css;assert.equal(elementFontWeightText(node),'700');node.style={};assert.equal(elementFontWeightText(node),'')
})


test('来源字形当前值采用自有伴随声明，重选普通字形保留inherit而不覆盖实际继承的斜体',()=>{
 const node=createNode('text','text'),page=createPage('page');node.style={fontWeight:700};node.css={'font-style':'inherit'}
 assert.deepEqual(singleVariant(node,page,{weight:700,style:'normal'},{weight:700,italic:true}),{patch:{},unset:[]})
})

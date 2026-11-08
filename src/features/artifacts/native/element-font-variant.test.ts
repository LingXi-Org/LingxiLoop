import assert from 'node:assert/strict'
import test from 'node:test'
import {createNode,createPage} from '../../../../shared/artifact-document'
import {elementFontVariantPatch} from './element-font-variant'

test('还原字重同时清除自有字重与字形声明，保留装饰和其他作者属性',()=>{
 const node=createNode('text','text'),page=createPage('page');node.style={fontWeight:700,fontStyle:'italic',textDecoration:'underline',fontFamily:'Arial'};node.css={'font-weight':'600 !important','font-style':'oblique 10deg',color:'red'}
 const before=JSON.stringify(node),result=elementFontVariantPatch(node,page,null,{weight:600,italic:true})
 assert.ok(result.unset.includes('style.fontWeight'));assert.ok(result.unset.includes('style.fontStyle'));assert.deepEqual(result.patch.css,{color:'red'});assert.equal(result.patch.style?.textDecoration,undefined);assert.equal(JSON.stringify(node),before)
})

test('选择字形替换冲突CSS，显式普通字形覆盖父级斜体但不改变字体',()=>{
 const node=createNode('text','text'),page=createPage('page');node.style={fontFamily:'Arial'};node.css={'font-weight':'700 !important','font-style':'italic',color:'red'}
 const result=elementFontVariantPatch(node,page,{weight:400,style:'normal'},{weight:700,italic:true})
 assert.equal(result.patch.style?.fontWeight,400);assert.equal(result.patch.style?.fontStyle,'normal');assert.equal(result.patch.style?.fontFamily,undefined);assert.deepEqual(result.patch.css,{color:'red'})
})

test('当前自有字形不写回，继承字形的明确选择成为可保存声明',()=>{
 const node=createNode('text','text'),page=createPage('page');node.style={fontWeight:700,fontStyle:'italic'}
 assert.deepEqual(elementFontVariantPatch(node,page,{weight:700,style:'italic'},{weight:700,italic:true}),{patch:{},unset:[]})
 node.style={};const result=elementFontVariantPatch(node,page,{weight:700,style:'italic'},{weight:700,italic:true});assert.equal(result.patch.style?.fontWeight,700);assert.equal(result.patch.style?.fontStyle,'italic')
})

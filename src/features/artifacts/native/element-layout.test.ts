import assert from 'node:assert/strict'
import test from 'node:test'
import {createNode,createPage} from '../../../../shared/artifact-document'
import {elementLayoutPatch} from './element-layout'
const page=createPage('page')
const node={...createNode('text','text'),style:{padding:4,paddingX:8,paddingY:12},css:{'padding-left':'7px','margin-left':'auto',filter:'blur(1px)'},implicitHeight:true}
test('统一内边距替换四边覆盖和旧轴值，保留其他属性与自适应',()=>{
 const before=JSON.stringify(node),result=elementLayoutPatch(node,page,{padding:'20'})
 assert.equal(result.patch.style?.padding,20)
 assert.ok(result.unset.includes('style.paddingX'));assert.ok(result.unset.includes('style.paddingY'))
 assert.deepEqual(result.patch.css,{'margin-left':'auto',filter:'blur(1px)','box-sizing':'content-box'})
 assert.equal(result.patch.implicitHeight,undefined);assert.equal(JSON.stringify(node),before)
})
test('单边修改保留同轴另一边，统一外边距清除旧的自动边距覆盖',()=>{
 assert.deepEqual(elementLayoutPatch(node,page,{'padding-top':'15'}).patch.css,{...node.css,'padding-top':'15px','box-sizing':'content-box'})
 const result=elementLayoutPatch(node,page,{margin:'-20'})
 assert.deepEqual(result.patch.css,{'padding-left':'7px',filter:'blur(1px)',margin:'-20px'})
})
test('还原内边距删除作者声明与轴值，而不改动宽高和外边距',()=>{
 const result=elementLayoutPatch(node,page,{padding:null})
 assert.ok(result.unset.includes('style.padding'));assert.ok(result.unset.includes('style.paddingX'));assert.ok(result.unset.includes('style.paddingY'))
 assert.deepEqual(result.patch.css,{'margin-left':'auto',filter:'blur(1px)'})
 assert.equal(result.patch.width,undefined);assert.equal(result.patch.height,undefined)
})
test('新内边距沿用来源内容盒，保留作者明确指定的边框盒',()=>{
 assert.equal(elementLayoutPatch({...node,style:{},css:{}},page,{padding:'20'}).patch.css?.['box-sizing'],'content-box')
 const explicit={...node,css:{'box-sizing':'border-box'}}
 assert.equal(elementLayoutPatch(explicit,page,{'padding-top':'20'}).patch.css?.['box-sizing'],'border-box')
})
test('统一或单边内边距的数字输入不得小于零，外边距允许负数',()=>{
 assert.equal(elementLayoutPatch({...node,style:{},css:{}},page,{padding:'-20'}).patch.style?.padding,0)
 assert.equal(elementLayoutPatch(node,page,{'padding-left':'-20'}).patch.css?.['padding-left'],'0px')
 assert.equal(elementLayoutPatch(node,page,{'margin-left':'-20'}).patch.css?.['margin-left'],'-20px')
})

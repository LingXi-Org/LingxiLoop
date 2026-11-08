import assert from 'node:assert/strict'
import test from 'node:test'
import {createNode,createPage} from '../../../../shared/artifact-document'
import {elementFontFamilyPatch} from './element-font-properties'
import {editorFontMenuVariants} from './editor-fonts'

test('字体选择替换作者CSS而保留原字重、斜体及其他属性',()=>{
 const node=createNode('text','text'),page=createPage('page');node.style={fontFamily:'Arial',fontWeight:700,fontStyle:'italic'};node.css={'font-family':'Georgia !important',color:'red'}
 const before=JSON.stringify(node),result=elementFontFamilyPatch(node,page,{value:'Bebas Neue',family:'Bebas Neue',label:'贝巴斯体'})
 assert.equal(result.patch.style?.fontFamily,'Bebas Neue');assert.equal(result.patch.style?.fontWeight,undefined);assert.equal(result.patch.style?.fontStyle,undefined)
 assert.deepEqual(result.patch.css,{color:'red'});assert.equal(JSON.stringify(node),before)
})

test('相同字面字体也解除主题引用，还原清除字面值和主题回退',()=>{
 const node=createNode('text','text'),page=createPage('page');node.style={fontFamily:'Arial',themeFont:'font.sans',themeFontFallback:'sans-serif',fontWeight:700}
 const literal=elementFontFamilyPatch(node,page,{value:'Arial',family:'Arial',label:'阿里亚尔体'});assert.ok(literal.unset.includes('style.themeFont'));assert.ok(literal.unset.includes('style.themeFontFallback'))
 const reset=elementFontFamilyPatch(node,page,null);assert.ok(reset.unset.includes('style.fontFamily'));assert.ok(reset.unset.includes('style.themeFont'));assert.ok(reset.unset.includes('style.themeFontFallback'));assert.equal(reset.patch.style?.fontWeight,undefined)
 const themed={...node,style:{themeFont:'font.sans',themeFontFallback:'Arial'}};assert.ok(elementFontFamilyPatch(themed,page,null).unset.includes('style.themeFont'))
})

test('来源字重菜单保留当前未列出的字形，不更改文档或重复已列字形',()=>{
 assert.deepEqual(editorFontMenuVariants('Bebas Neue',700,'italic'),[{weight:700,style:'italic',label:'粗体斜体'},{weight:400,style:'normal',label:'常规'}])
 assert.equal(editorFontMenuVariants('Arial',700,'italic').length,4)
})

test('重新选择当前字面字体不丢失作者回退栈或优先级声明',()=>{
 const node=createNode('text','same-family'),page=createPage('page');node.style={fontFamily:'Arial, sans-serif'}
 const font={value:'Arial',family:'Arial',label:'阿里亚尔体'}
 assert.deepEqual(elementFontFamilyPatch(node,page,font),{patch:{},unset:[]})
 node.css={'font-family':'Arial, serif !important'};assert.deepEqual(elementFontFamilyPatch(node,page,font),{patch:{},unset:[]})
})

import assert from 'node:assert/strict'
import test from 'node:test'
import {elementFontGroups} from './element-font-picker'

test('来源字体目录26项按原字体名排序，显示文字全中文',()=>{
 const groups=elementFontGroups([])
 assert.equal(groups.length,1);assert.equal(groups[0].fonts.length,26);assert.equal(groups[0].label,undefined)
 assert.deepEqual(groups[0].fonts.map(font=>font.value),['Arial','Bebas Neue','Caveat','Courier New','DM Sans','Garamond','Georgia','Helvetica','Inter','Lato','Lora','Manrope','Merriweather','Montserrat','Nunito','Open Sans','Playfair Display','Poppins','Raleway','Roboto','Space Grotesk','Tahoma','Times New Roman','Trebuchet MS','Verdana','Work Sans'])
 assert.ok(groups[0].fonts.every(font=>/[\p{Script=Han}]/u.test(font.label)&&!/[A-Za-z]/.test(font.label)&&!font.theme))
})

test('本设计字体优先且大小写去重，保留与全部目录重复出现的当前字体',()=>{
 const groups=elementFontGroups(['arial','Georgia','ARIAL'])
 assert.deepEqual(groups.map(group=>group.label),['此设计中','全部字体']);assert.deepEqual(groups[0].fonts.map(font=>font.value),['Arial','Georgia'])
 assert.equal(groups[1].fonts[0].value,'Arial');assert.equal(groups[0].fonts[0].label,'阿里亚尔体')
})

test('作者自定义与通用字体可选，中文标签与可移植声明分开且不写主题引用',()=>{
 const groups=elementFontGroups(['My Document Font','sans-serif'],'Other Custom Font')
 assert.deepEqual(groups[0].fonts.map(font=>font.family),['Other Custom Font','My Document Font','sans-serif'])
 assert.deepEqual(groups[0].fonts.map(font=>font.label),['自定义字体 1','自定义字体 2','无衬线体']);assert.ok(groups[0].fonts.every(font=>!font.theme))
})

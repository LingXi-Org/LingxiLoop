import assert from 'node:assert/strict'
import test from 'node:test'
import {elementFontChoice} from './element-font-display'
import {editorFontChoice} from './editor-fonts'

test('Design字体按钮采用来源显示名，与通用字体在前的菜单当前项一致',()=>{
 assert.equal(elementFontChoice('system-ui, Arial')?.label,'阿里亚尔体')
 assert.equal(elementFontChoice('ui-sans-serif, "LingxiLoopEditor Inter", sans-serif')?.label,'英特体')
 assert.equal(elementFontChoice('Arial, sans-serif')?.label,'阿里亚尔体')
 assert.equal(elementFontChoice('My Document Font, sans-serif'),undefined)
 assert.equal(editorFontChoice('system-ui, Arial')?.label,'无衬线体')
})

import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { nativeBlock } from './native'
test('upstream native schema, slash menus, tables, blocks, undo and lossless reopen',async({app,browser,screen})=>{
  await app.open('/e2e/content-editor.html')
  const editor=()=>screen.getByLabel('原生正文',{exact:true})
  await expect(editor()).toBeVisible({timeout:120000})
  await expect(editor()).toContainText('原有内容')
  await expect(browser.locator('[aria-label="原生正文"] [data-content-type="checkListItem"]')).toBeVisible()
  await editor().focus()
  await browser.keyboard.press('Control+End')
  await browser.keyboard.press('Enter')
  await browser.keyboard.type('追加中文')
  await browser.keyboard.press('Control+z')
  await expect(editor()).not.toContainText('追加中文')
  await browser.keyboard.press('Control+Shift+z')
  await expect(editor()).toContainText('追加中文')
  await nativeBlock(browser,screen,'原生正文','table','表格')
  await browser.keyboard.type('观察')
  await browser.keyboard.press('Tab')
  await browser.keyboard.type('结论')
  await screen.getByRole('button','保存并重新打开',{exact:true}).tap()
  await expect(browser.locator('[aria-label="已保存文档"] table')).toBeVisible()
  const before=await browser.evaluate(()=>JSON.parse(localStorage.getItem('native-219')!))
  expect(before.document.blocks.some((block:{type:string})=>block.type==='table')).toBe(true)
  expect(before.document.legacyMarkdown).toContain('$x^2$')
  await expect(editor()).toContainText('结论')
  await screen.getByRole('button','保存并重新打开',{exact:true}).tap()
  expect(await browser.evaluate(()=>JSON.parse(localStorage.getItem('native-219')!).document)).toEqual(before.document)
  await app.screenshot('native-desktop-roundtrip')
  await browser.setViewport({width:390,height:900})
  expect(await browser.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await app.screenshot('native-mobile-table')
})

test('all 14 default native block types remain insertable with official controls',async({app,browser,screen})=>{
  await app.open('/e2e/content-editor.html')
  const editor=()=>screen.getByLabel('原生正文',{exact:true})
  await expect(editor()).toBeVisible({timeout:120000})
  for(const [query,title,type] of [
    ['h2','二级标题','heading'],['paragraph','段落','paragraph'],['bullet','无序列表','bulletListItem'],
    ['number','有序列表','numberedListItem'],['checklist','检查清单','checkListItem'],['折叠','可折叠列表','toggleListItem'],
    ['code','代码块','codeBlock'],['quote','引用','quote'],['table','表格','table'],['image','图片','image'],
    ['audio','音频','audio'],['video','视频','video'],['file','文件','file'],['separator','分页符','divider'],
  ]) {
    await editor().fill('')
    await nativeBlock(browser,screen,'原生正文',query,title)
    await browser.keyboard.press('Escape')
    await screen.getByRole('button','保存并重新打开',{exact:true}).tap()
    const blocks=await browser.evaluate(()=>JSON.parse(localStorage.getItem('native-219')!).document?.blocks.map((block:{type:string})=>block.type))
    expect(blocks).toContain(type)
  }
  await editor().fill('')
  await browser.keyboard.press('Control+b')
  await browser.keyboard.type('原生粗体')
  await browser.keyboard.press('Control+b')
  await screen.getByRole('button','保存并重新打开',{exact:true}).tap()
  expect(await browser.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('native-219')!).document.blocks))).toContain('"bold":true')
  await app.screenshot('default-native-controls')
})

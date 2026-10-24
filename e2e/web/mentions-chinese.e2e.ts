import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

test.describe('Chinese mentions', {...(process.env.E2E_GROUP_MENTIONS_FIXTURE==='1'?{}:{skip:'Requires the isolated synthetic mentions fixture.'})},()=>{
  for(const width of [1440,390]) test(`stream, history, copy, quotes and selected mentions stay Chinese (${width})`,async({app,browser,screen})=>{
    await browser.setViewport({width,height:1100})
    await app.open('/e2e/mentions-chinese.html')
    for(let i=0;i<7;i++) {
      expect(await browser.evaluate(()=>!/@[a-z]/i.test(document.querySelector('.native-message-content')?.textContent??''))).toBe(true)
      await screen.getByRole('button','推进流式片段').tap()
    }
    for(const name of ['司南','明理','砺思','溯源','寻知','成器']) await expect(screen.getByLabel('成员名册')).toContainText(name)
    await expect(browser.locator('.native-message-content')).toContainText('@未识别成员')
    await browser.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{Reflect.set(window,'syntheticClipboard',text)}}});return true})
    await screen.getByRole('button','复制正文').tap()
    expect(await browser.evaluate(()=>!/@[a-z]/i.test(String(Reflect.get(window,'syntheticClipboard'))))).toBe(true)
    await expect(screen.getByLabel('复制内容')).toContainText('@司南')
    await screen.getByRole('button','复制表格',{exact:true}).tap()
    await browser.locator('button[title="复制为 Markdown"]').tap()
    expect(await browser.evaluate(()=>String(Reflect.get(window,'syntheticClipboard')).includes('@明理') && !String(Reflect.get(window,'syntheticClipboard')).includes('sage'))).toBe(true)
    await screen.getByRole('button','引用正文').tap()
    await expect(browser.locator('[data-slot="composer-quote-text"]')).toContainText('@明理')
    await screen.getByRole('button','修改中文名').tap()
    await screen.getByRole('button','刷新历史').tap()
    await expect(browser.locator('[data-mention-id="sage"]').first()).toContainText('新的明理')
    await browser.locator('[contenteditable="true"]').fill('@新的')
    await browser.keyboard.press('Enter')
    await expect(browser.locator('[data-directive-id="sage"]')).toContainText('新的明理')
    expect(await browser.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
    await app.screenshot(`mentions-chinese-${width}`)
  })
})

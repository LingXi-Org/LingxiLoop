import type { Browser } from '@e2e-dev/web'
import { expect, type Screen } from 'e2e'

/** Drive the official UI; never mutate editor internals or insert a synthetic document. */
export async function nativeBlock(browser: Browser, screen: Screen, label: string, query: string, title: string) {
  const trailing = browser.locator(`[aria-label="${label}"] .bn-trailing-block`)
  if (await trailing.count()) await trailing.last().tap()
  else {
    await screen.getByLabel(label, { exact: true }).focus()
    await browser.keyboard.press('Control+End')
    await browser.keyboard.press('Enter')
  }
  await browser.keyboard.press('/')
  await browser.keyboard.type(query)
  await expect(screen.getByRole('option', new RegExp(`^${title}`)).first()).toBeVisible()
  await browser.keyboard.press('Enter')
}
export async function nativeHeading(browser: Browser, screen: Screen, label: string, heading: string, paragraph: string) {
  await screen.getByLabel(label, { exact: true }).fill('')
  await browser.keyboard.press('Control+Alt+0')
  await browser.keyboard.press('/')
  await browser.keyboard.type('h2')
  await expect(screen.getByRole('option', /二级标题/).first()).toBeVisible()
  await browser.keyboard.press('Enter')
  await browser.keyboard.type(heading)
  await browser.keyboard.press('Enter')
  await browser.keyboard.type(paragraph)
}
export async function nativeUpload(browser: Browser, screen: Screen, label: string, path: string, kind = 'image') {
  const title = ({image:'图片',file:'文件',audio:'音频',video:'视频'} as Record<string,string>)[kind]
  await nativeBlock(browser,screen,label,kind,title)
  await expect(screen.getByRole('tab','上传',{exact:true})).toBeVisible()
  await browser.locator('[role="tabpanel"] input[type="file"]').setInputFiles([path])
  await expect.poll(()=>browser.evaluate(label=>{
    const host=document.querySelector(`[aria-label="${label}"]`)
    return Array.from(host?.querySelectorAll('[src],a[href]')??[]).map(node=>node.getAttribute('src')??node.getAttribute('href')).some(url=>url?.startsWith('/api/files?key='))
  },label)).toBe(true)
}

/** Synthetic clipboard event exercises upstream's real Markdown paste handler. */
export async function nativePaste(browser: Browser, screen: Screen, label: string, markdown: string) {
  await browser.locator(`[aria-label="${label}"][contenteditable="true"]:visible`).fill('')
  await browser.evaluate(({label,markdown})=>{
    const clipboardData=new DataTransfer();clipboardData.setData('text/plain',markdown)
    const target=Array.from(document.querySelectorAll(`[aria-label="${label}"][contenteditable="true"]`)).find(node=>node.getClientRects().length)!
    target.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}))
    return true
  },{label,markdown})
}
export async function nativeLink(browser: Browser, screen: Screen, label: string, url: string) {
  await screen.getByLabel(label,{exact:true}).focus()
  await browser.keyboard.press('Control+End')
  await browser.keyboard.press('Enter')
  await browser.keyboard.type(url)
  await browser.keyboard.press('Home')
  await browser.keyboard.press('Shift+End')
  await expect(screen.getByRole('button','添加链接',{exact:true})).toBeVisible()
  await screen.getByRole('button','添加链接',{exact:true}).tap()
  await browser.locator('input[placeholder="编辑链接地址"]').fill(url)
  await browser.keyboard.press('Enter')
}

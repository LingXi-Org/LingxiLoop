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
  await expect(screen.getByRole('option', new RegExp(title))).toBeVisible()
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
  await browser.locator('.bn-file-panel input[type="file"]').setInputFiles([path])
  await expect.poll(()=>browser.evaluate(label=>{
    const host=document.querySelector(`[aria-label="${label}"]`)
    return Array.from(host?.querySelectorAll('[src],a[href]')??[]).map(node=>node.getAttribute('src')??node.getAttribute('href')).some(url=>url?.startsWith('/api/files?key='))
  },label)).toBe(true)
}

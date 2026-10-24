import { test, type Browser } from '@e2e-dev/web'
import { expect } from 'e2e'
import { nativePaste } from '../content-editor/native'

const newTitle = '公式与排版回归-' + Date.now()
const oldTitle = '旧帖排版回归-' + Date.now()
const markdown = String.raw`${newTitle}

## 面积

行内 $S=\frac{bh}{2}$ 与普通文字。

$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$

> 观察图形
> 再计算面积

3. 测量
4. 计算
   - 保留子步骤

| 底 | 高 |
| --- | --- |
| 6 | 4 |

~~~python
area = 6 * 4 / 2
~~~

~~~mermaid
graph LR
 A[测量] --> B[面积]
~~~

末尾段落。`
const headers = { 'content-type': 'application/json', 'x-company-id': 'e2e-school', 'x-project-id': 'e2e-classroom' }
async function savedPost(browser: Browser, title: string) {
  return browser.evaluate(async ({title,headers}) => {
    const response = await fetch(`/api/courses/e2e-course/forum?search=${encodeURIComponent(title)}`,{headers})
    const {items} = await response.json()
    return items.find((item:{title:string})=>item.title===title)
  },{title,headers})
}
function checkSavedMath(item: Awaited<ReturnType<typeof savedPost>>) {
  expect(item.editorDocument.projection.trim()).toBe(item.body)
  const blocks = item.editorDocument.blocks
  expect(blocks.flatMap((block:{content:unknown})=>Array.isArray(block.content)?block.content:[]).filter((part:{type:string})=>part.type==='math').map((part:{content:string})=>part.content)).toEqual([String.raw`S=\frac{bh}{2}`])
  expect(blocks.find((block:{type:string})=>block.type==='mathBlock').content[0].text).toBe(String.raw`\sum_{i=1}^{n} i = \frac{n(n+1)}{2}`)
  expect(blocks.find((block:{type:string})=>block.type==='codeBlock').content[0].text).toBe('area = 6 * 4 / 2')
  expect(blocks.find((block:{type:string})=>block.type==='numberedListItem').props.start).toBe(3)
}

test('math pasted into a new forum post survives teacher and student reading', async ({ app, browser, screen }) => {
  await app.open('/')
  await browser.evaluate(async () => (await fetch('/api/fixture-role/teacher')).ok)
  await app.open('/?project=e2e-classroom&view=forum')
  await expect(screen.getByLabel('搜索学习论坛')).toBeVisible({ timeout: 120000 })
  await screen.getByRole('button', '展开发布框', { exact: true }).tap()
  await nativePaste(browser, screen, '内容正文', markdown)
  await app.screenshot('pasted-formulas-editor')
  await screen.getByRole('region','发布学习论坛内容').getByRole('button','发布',{exact:true}).tap()
  const post = browser.locator('article[aria-label="' + newTitle + '"]')
  await expect(post).toBeVisible()
  checkSavedMath(await savedPost(browser,newTitle))
  await expect(post.getByRole('table')).toBeVisible()
  await expect(browser.locator('article[aria-label="' + newTitle + '"] .mermaid-diagram svg,article[aria-label="' + newTitle + '"] [data-content-type="diagram"] svg')).toBeVisible()
  await post.getByRole('link',newTitle,{exact:true}).tap()
  await expect(browser.locator('[data-memo-detail] .content-document')).toBeVisible()
  const teacherMath = await browser.locator('[data-memo-detail] math').count()
  await app.screenshot('pasted-formulas-teacher')
  await browser.evaluate(async () => (await fetch('/api/fixture-role/student')).ok)
  await app.open('/?project=e2e-classroom&view=forum')
  await expect(post).toBeVisible()
  await post.getByRole('link',newTitle,{exact:true}).tap()
  await expect(browser.locator('[data-memo-detail] .content-document')).toBeVisible()
  const studentMath = await browser.locator('[data-memo-detail] math').count()
  await browser.setViewport({width:390,height:900})
  expect(await browser.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
  await app.screenshot('pasted-formulas-student')
  expect({ teacherMath, studentMath }).toEqual({ teacherMath: 2, studentMath: 2 })
  await browser.setViewport({width:1440,height:1000})
})

test('legacy forum structure and formulas survive edit save and reload', async ({ app, browser, screen }) => {
  await app.open('/')
  await browser.evaluate(async () => (await fetch('/api/fixture-role/teacher')).ok)
  const created = await browser.evaluate(async ({markdown,headers,oldTitle}) => {
    const response = await fetch('/api/courses/e2e-course/forum', {method:'POST',headers,body:JSON.stringify({kind:'share',title:oldTitle,body:markdown,tags:[],links:[],attachments:[]})})
    return {status:response.status,body:await response.json()}
  }, {markdown,headers,oldTitle})
  expect(created.status).toBe(201)
  await app.open('/?project=e2e-classroom&view=forum')
  const post = browser.locator('article[aria-label="' + oldTitle + '"]')
  await expect(post).toBeVisible({timeout:120000})
  await expect(browser.locator('article[aria-label="' + oldTitle + '"] math').first()).toBeVisible()
  await app.screenshot('legacy-before-edit')
  await post.getByRole('button','管理：' + oldTitle).tap()
  await screen.getByRole('menuitem','编辑内容',{exact:true}).tap()
  const editor=screen.getByRole('region','编辑学习论坛内容').getByLabel('内容正文')
  await expect(editor).toBeVisible()
  await editor.focus(); await browser.keyboard.press('Control+End'); await browser.keyboard.press('Enter'); await browser.keyboard.type('追加说明。')
  await app.screenshot('legacy-editing')
  await screen.getByRole('region','编辑学习论坛内容').getByRole('button','保存修改',{exact:true}).tap()
  await browser.reload()
  await expect(post).toBeVisible()
  await expect(post).toContainText('追加说明。')
  const saved = await savedPost(browser,oldTitle)
  checkSavedMath(saved)
  // Reopening and saving canonical JSON must preserve block IDs and content.
  await post.getByRole('button','管理：' + oldTitle).tap()
  await screen.getByRole('menuitem','编辑内容',{exact:true}).tap()
  await expect(editor).toBeVisible()
  await screen.getByRole('region','编辑学习论坛内容').getByRole('button','保存修改',{exact:true}).tap()
  await expect(editor).not.toBeVisible()
  expect((await savedPost(browser,oldTitle)).editorDocument).toEqual(saved.editorDocument)
  // Discussion titles are API-editable; the share composer exposes body only.
  const renamed = oldTitle + '-已修改'
  expect(await browser.evaluate(async({saved,renamed,headers})=>(await fetch(`/api/courses/e2e-course/forum/post/${saved.id}`,{
    method:'PUT',headers,body:JSON.stringify({kind:'share',title:renamed,body:saved.body,editorDocument:saved.editorDocument,tags:[],links:[],attachments:[]}),
  })).status,{saved,renamed,headers})).toBe(200)
  await browser.reload()
  expect((await savedPost(browser,renamed)).editorDocument).toEqual(saved.editorDocument)
  await app.screenshot('legacy-after-reload')
  await screen.getByRole('link',renamed,{exact:true}).tap()
  await expect(browser.locator('[data-memo-detail] .content-document')).toBeVisible()
  const layout=await browser.evaluate(()=>{
    const body=document.querySelector('[data-memo-detail] .content-document')!
    return {math:body.querySelectorAll('math').length,quote:body.querySelectorAll('[data-content-type="quote"]').length,table:body.querySelectorAll('table').length,width:body.getBoundingClientRect().width,parent:body.parentElement!.getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth}
  })
  console.log('ROUNDTRIP_LAYOUT',JSON.stringify(layout))
  expect(layout.math).toBe(2); expect(layout.quote).toBe(1); expect(layout.table).toBe(1)
  expect(layout.width / layout.parent).toBeGreaterThan(0.95)
  expect(layout.overflow).toBe(false)
  await app.screenshot('legacy-detail-after-reload')
})

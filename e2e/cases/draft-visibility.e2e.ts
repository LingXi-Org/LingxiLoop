import { test, type Browser } from '@e2e-dev/web'
import { expect, type JsonValue } from 'e2e'
import { nativePaste } from '../content-editor/native'

const title = '草稿边界验收-' + Date.now()
const secret = '合成未发布正文：仅管理者可见。'
const headers = { 'content-type':'application/json','x-company-id':'cases-school' }
const url = '/cases?project=cases-classroom&view=cases'
async function request(browser: Browser, path: string, method='GET', body: JsonValue=null) {
  return browser.evaluate(async({path,method,body,headers})=>{
    const response=await fetch(path,{method,headers,...(body===null?{}:{body:JSON.stringify(body)})})
    return {status:response.status,data:await response.json().catch(()=>null)}
  },{path,method,body,headers})
}
async function role(browser: Browser, name: string) {
  expect((await request(browser,`/api/fixture-role/${name}`)).status).toBe(200)
}

test('saved drafts stay private in reader lists and direct links; published snapshots stay unchanged',async({app,browser,screen})=>{
  await app.open('/')
  await role(browser,'teacher')
  await app.open(url)
  await screen.getByRole('button','新建案例',{exact:true}).tap()
  await screen.getByLabel('标题',{exact:true}).fill(title)
  await nativePaste(browser,screen,'摘要','合成未发布摘要')
  await nativePaste(browser,screen,'正文',secret)
  await screen.getByLabel('分类',{exact:true}).fill('合成草稿分类')
  await screen.getByRole('button','保存草稿',{exact:true}).tap()
  await expect(screen.getByRole('status').first()).toContainText('草稿已保存')
  const draft=(await request(browser,`/api/cases?q=${encodeURIComponent(title)}`)).data.items[0]
  expect(draft.status).toBe('draft')
  expect(draft.publishedVersion).toBe(null)
  expect(draft.body).toContain(secret)
  await role(browser,'teacher2')
  expect((await request(browser,`/api/cases/${draft.id}`)).data.canManage).toBe(true)
  await role(browser,'student')
  for(const query of ['',`?q=${encodeURIComponent(title)}`,'?category='+encodeURIComponent('合成草稿分类')]) {
    const list=(await request(browser,'/api/cases'+query)).data
    expect(list.canManage).toBe(false)
    expect(JSON.stringify(list)).not.toContain(title)
    expect(JSON.stringify(list)).not.toContain(secret)
    expect(list.categories).not.toContain('合成草稿分类')
  }
  expect((await request(browser,`/api/cases/${draft.id}`)).status).toBe(404)
  await app.open(url)
  await expect(screen.getByLabel('关键词搜索')).toBeVisible()
  await expect(screen.getByRole('heading',title,{exact:true})).toHaveCount(0)
  await expect(screen.getByRole('button','新建案例',{exact:true})).toHaveCount(0)
  await app.open(`/cases/${draft.id}?project=cases-classroom&view=cases`)
  await expect(screen.getByRole('alert')).toBeVisible()
  await expect(screen.getByText(secret,{exact:true})).toHaveCount(0)
  await app.screenshot('reader-draft-denied')
  await role(browser,'teacher2')
  const published=(await request(browser,`/api/cases/${draft.id}/publish`,'POST',{version:draft.version})).data
  expect(published.status).toBe('published')
  const nextSecret='修订草稿：尚未发布'
  expect((await request(browser,`/api/cases/${draft.id}`,'PUT',{title,summary:'修订摘要',body:nextSecret,category:'修订分类',tags:[],cover:null,version:published.version})).status).toBe(200)
  await role(browser,'student')
  expect((await request(browser,`/api/cases/${draft.id}`)).data.body).toBe(published.body)
  expect(JSON.stringify((await request(browser,'/api/cases')).data)).not.toContain(nextSecret)
  await browser.reload()
  await expect(screen.getByText(secret,{exact:true})).toBeVisible()
  await expect(screen.getByText(nextSecret,{exact:true})).toHaveCount(0)
  await app.screenshot('reader-published-snapshot')
})

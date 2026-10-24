import { test, type Browser } from '@e2e-dev/web'
import { expect, type JsonValue } from 'e2e'
import { nativePaste } from '../content-editor/native'

const title = '草稿边界验收-' + Date.now()
const secret = title + '：合成未发布正文。'
const draftCategory = title + '-草稿分类'
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

test('explicit case views keep teacher and student readers on published snapshots while authorized management sees drafts',async({app,browser,screen})=>{
  await app.open('/')
  await role(browser,'teacher')
  await app.open(url)
  await expect(screen.getByRole('button','管理案例',{exact:true})).toBeVisible()
  await expect(screen.getByRole('button','新建案例',{exact:true})).toHaveCount(0)
  await screen.getByRole('button','管理案例',{exact:true}).tap()
  await expect(browser).toHaveURL(/caseView=manage/)
  await screen.getByRole('button','新建案例',{exact:true}).tap()
  await screen.getByLabel('标题',{exact:true}).fill(title)
  await nativePaste(browser,screen,'摘要',title+'-未发布摘要')
  await nativePaste(browser,screen,'正文',secret)
  await screen.getByLabel('分类',{exact:true}).fill(draftCategory)
  await screen.getByRole('button','保存草稿',{exact:true}).tap()
  await expect(screen.getByRole('status').first()).toContainText('草稿已保存')
  const management=(await request(browser,`/api/cases?view=manage&q=${encodeURIComponent(title)}`)).data
  expect(management.view).toBe('manage')
  const draft=management.items[0]
  expect(draft.view).toBe('manage')
  expect(draft.status).toBe('draft')
  expect(draft.publishedVersion).toBe(null)
  expect(draft.body).toContain(secret)
  await app.screenshot('teacher-management-draft')

  for(const teacher of ['teacher','teacher2']) {
    await role(browser,teacher)
    const managed=await request(browser,`/api/cases/${draft.id}?view=manage`)
    expect(managed.status).toBe(200)
    expect(managed.data.canManage).toBe(true)
    expect(managed.data.body).toContain(secret)
    for(const query of ['',`?q=${encodeURIComponent(title)}`,'?category='+encodeURIComponent(draftCategory)]) {
      const list=(await request(browser,'/api/cases'+query)).data
      expect(list.view).toBe('reader')
      expect(list.canManage).toBe(true)
      expect(JSON.stringify(list)).not.toContain(title)
      expect(JSON.stringify(list)).not.toContain(secret)
      expect(list.categories).not.toContain(draftCategory)
    }
    expect((await request(browser,`/api/cases/${draft.id}`)).status).toBe(404)
  }
  await app.open(url)
  await expect(screen.getByRole('heading',title,{exact:true})).toHaveCount(0)
  await expect(screen.getByRole('button','新建案例',{exact:true})).toHaveCount(0)
  await app.screenshot('teacher-default-reader-draft-hidden')
  await screen.getByRole('button','管理案例',{exact:true}).tap()
  await expect(screen.getByRole('heading',title,{exact:true})).toBeVisible()
  await screen.getByRole('button','阅读案例',{exact:true}).tap()
  await expect(browser).not.toHaveURL(/caseView=manage/)
  await expect(screen.getByRole('heading',title,{exact:true})).toHaveCount(0)

  await role(browser,'student')
  for(const path of ['/api/cases?view=manage',`/api/cases/${draft.id}?view=manage`]) {
    const denied=await request(browser,path)
    expect(denied.status).toBe(403)
    expect(JSON.stringify(denied.data)).not.toContain(secret)
  }
  const studentList=(await request(browser,'/api/cases')).data
  expect(studentList.view).toBe('reader')
  expect(studentList.canManage).toBe(false)
  expect(JSON.stringify(studentList)).not.toContain(title)
  expect(studentList.categories).not.toContain(draftCategory)
  expect((await request(browser,`/api/cases/${draft.id}`)).status).toBe(404)
  await app.open(url)
  await expect(screen.getByLabel('关键词搜索')).toBeVisible()
  await expect(screen.getByRole('button','管理案例',{exact:true})).toHaveCount(0)
  await app.open(`/cases/${draft.id}?project=cases-classroom&view=cases&caseView=manage`)
  await expect(screen.getByRole('alert')).toBeVisible()
  await expect(screen.getByText(secret,{exact:true})).toHaveCount(0)
  await expect(screen.getByRole('button','编辑案例',{exact:true})).toHaveCount(0)
  await app.screenshot('student-forced-management-denied')

  await role(browser,'teacher2')
  const published=(await request(browser,`/api/cases/${draft.id}/publish`,'POST',{version:draft.version})).data
  expect(published.status).toBe('published')
  expect(published.view).toBe('manage')
  const nextSecret=title+'-修订草稿：尚未发布'
  const edited=await request(browser,`/api/cases/${draft.id}`,'PUT',{title,summary:'修订摘要',body:nextSecret,category:'修订分类',tags:[],cover:null,version:published.version})
  expect(edited.status).toBe(200)
  expect(edited.data.hasUnpublishedChanges).toBe(true)
  expect(edited.data.view).toBe('manage')
  expect((await request(browser,`/api/cases/${draft.id}?view=manage`)).data.body).toBe(nextSecret)
  for(const reader of ['teacher2','student']) {
    await role(browser,reader)
    const article=(await request(browser,`/api/cases/${draft.id}`)).data
    expect(article.view).toBe('reader')
    expect(article.body).toBe(published.body)
    expect(JSON.stringify((await request(browser,'/api/cases')).data)).not.toContain(nextSecret)
    await app.open(`/cases/${draft.id}?project=cases-classroom&view=cases`)
    await expect(screen.getByText(secret,{exact:true})).toBeVisible()
    await expect(screen.getByText(nextSecret,{exact:true})).toHaveCount(0)
    await expect(screen.getByRole('button','编辑案例',{exact:true})).toHaveCount(0)
    await app.screenshot(`${reader}-reader-published-snapshot`)
    if(reader==='teacher2') {
      await screen.getByRole('button','管理案例',{exact:true}).tap()
      await expect(screen.getByText(nextSecret,{exact:true})).toBeVisible()
      await expect(screen.getByRole('button','编辑案例',{exact:true})).toBeVisible()
      await app.screenshot('teacher-management-unpublished-revision')
      await screen.getByRole('button','阅读案例',{exact:true}).tap()
      await expect(screen.getByText(secret,{exact:true})).toBeVisible()
      await expect(screen.getByText(nextSecret,{exact:true})).toHaveCount(0)
    }
  }
})

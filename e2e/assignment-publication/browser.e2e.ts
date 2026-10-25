import { test, type Browser } from '@e2e-dev/web'
import { expect, type TestFixtures } from 'e2e'

async function openHomework(screen: TestFixtures['screen']) {
  await screen.getByRole('button', '发布', { exact: true }).tap()
  await screen.getByRole('menuitem', '发布作业', { exact: true }).tap()
}


async function observeReactKeys(browser:Browser,reset=true) {
  await browser.evaluate(reset=>{
    const key='issue381-react-key-warnings'
    if(reset)localStorage.setItem(key,'[]')
    for(const method of ['error','warn'] as const){
      const original=console[method].bind(console)
      console[method]=(...args:unknown[])=>{
        const text=args.map(value=>typeof value==='string'?value:'').join(' ')
        if(/same key|unique.*key|Encountered two children/i.test(text)){
          const warnings=JSON.parse(localStorage.getItem(key)??'[]') as string[]
          localStorage.setItem(key,JSON.stringify([...warnings,text]))
        }
        original(...args)
      }
    }
    return true
  },reset)
}
const noKeyWarnings=async(browser:Browser)=>expect(await browser.evaluate(()=>JSON.parse(localStorage.getItem('issue381-react-key-warnings')??'[]'))).toEqual([])

// Written before the fix: the first assertion fails on the conversation-only entry.
test('381 header opens homework authoring without navigating to chat', async ({ app, browser, screen }) => {
  await app.open('/')
  await browser.evaluate(async () => (await fetch('/api/fixture-role/teacher')).ok)
  await app.open('/?project=e2e-classroom&view=forum')
  await expect(screen.getByLabel('搜索学习论坛')).toBeVisible({ timeout: 120000 })
  await observeReactKeys(browser)
  await openHomework(screen)
  await expect(screen.getByRole('region', '创建课程作业')).toBeVisible()
  expect(await browser.evaluate(() => new URL(location.href).searchParams.get('view'))).toBe('forum')
  expect(await browser.evaluate(() => new URL(location.href).searchParams.has('conversation'))).toBe(false)
  await noKeyWarnings(browser)
})

test('381 saved human draft survives lost response and publishes once to the student forum',async({app,browser,screen})=>{
  const title=`Issue381 正式课程作业 ${Date.now()}`
  const open=async(role:string)=>{
    await app.open('/');await browser.evaluate(async role=>(await fetch(`/api/fixture-role/${role}`)).ok,role)
    await app.open('/?project=e2e-classroom&view=forum')
    await expect(screen.getByLabel('搜索学习论坛')).toBeVisible({timeout:120000})
  }
  const counts=()=>browser.evaluate(async()=>fetch('/api/fixture-teacher-entry').then(response=>response.json()))
  await open('teacher')
  await observeReactKeys(browser)
  const before=await counts()
  await openHomework(screen)
  const form=screen.getByRole('region','创建课程作业')
  await form.getByLabel('作业标题',{exact:true}).fill(title)
  await form.getByLabel('作业要求',{exact:true}).fill('说明三角形面积公式并计算底为8高为5的面积。')
  await form.getByLabel('验收标准',{exact:true}).fill('独立说明面积为何是底乘高的一半。\n正确计算面积并注明单位。')
  await browser.evaluate(async()=>(await fetch('/api/fixture-teacher-draft/lost',{method:'POST'})).ok)
  await form.getByRole('button','保存并检查草稿',{exact:true}).tap()
  await expect(form.getByRole('alert')).toBeVisible()
  await expect(form.getByLabel('作业标题',{exact:true})).toHaveValue(title)
  expect((await counts()).homeworks).toBe(before.homeworks+1)
  await app.screenshot('381-lost-response-preserves-input')
  await form.getByRole('button','保存并检查草稿',{exact:true}).tap()
  const card=form.getByLabel('作业草稿',{exact:true})
  await expect(card).toBeVisible()
  const id=await card.getAttribute('data-homework-id')
  expect(Boolean(id)).toBe(true)
  await expect(card.getByRole('button','确认发布',{exact:true})).toBeDisabled()
  expect((await counts()).homeworks).toBe(before.homeworks+1)
  expect((await counts()).rooms).toBe(before.rooms)
  await app.screenshot('381-human-draft-awaits-validation')
  // Explicit synthetic validation receipt: exercises real human publication,
  // not the model's judgment quality. No real provider is called in this suite.
  await browser.evaluate(async id=>(await fetch(`/api/fixture-teacher-homework/${id}/ready`,{method:'POST'})).ok,id)
  await browser.reload()
  await observeReactKeys(browser,false)
  await openHomework(screen)
  await expect(card.getByRole('button','确认发布',{exact:true})).toBeEnabled({timeout:15000})
  await browser.evaluate(()=>{
    const target=window as unknown as {issue381Errors:string[]};target.issue381Errors=[]
    window.addEventListener('error',event=>target.issue381Errors.push(event.message))
    window.addEventListener('unhandledrejection',event=>target.issue381Errors.push(String(event.reason)))
    return true
  })
  await card.getByRole('button','确认发布',{exact:true}).tap()
  await expect(card.getByText('已发布',{exact:true})).toBeVisible()
  await card.getByRole('button','在论坛查看作业',{exact:true}).tap()
  try{await expect(form).toBeHidden()}catch(error){
    console.info('381 publication DOM',await browser.evaluate(()=>({region:document.querySelector('[aria-label="创建课程作业"]')?.textContent??null,errors:(window as unknown as {issue381Errors:string[]}).issue381Errors})))
    throw error
  }
  await expect(screen.getByRole('link',title,{exact:true})).toBeVisible()
  expect(await browser.evaluate(()=>new URL(location.href).searchParams.get('view'))).toBe('forum')
  await noKeyWarnings(browser)
  await open('student')
  await expect(screen.getByRole('button','发布作业',{exact:true})).toHaveCount(0)
  await expect(screen.getByRole('link',title,{exact:true})).toBeVisible()
  await screen.getByRole('link',title,{exact:true}).tap()
  await expect(screen.getByRole('heading','验收标准',{exact:true})).toBeVisible()
  await expect(screen.getByRole('button','开始学习',{exact:true})).toBeVisible()
  await expect(screen.getByRole('button','预览并提交',{exact:true})).toBeDisabled()
  await browser.setViewport({width:390,height:844})
  await browser.evaluate(()=>{document.documentElement.classList.add('dark');return true})
  expect(await browser.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await app.screenshot('381-student-formal-homework')
  await browser.setViewport({width:1440,height:1000})
})

test('381 authoring cancels late assistant navigation and isolates course drafts',async({app,browser,screen})=>{
  await app.open('/');await browser.evaluate(async()=>(await fetch('/api/fixture-role/teacher')).ok)
  await app.open('/?project=e2e-classroom&view=forum')
  await expect(screen.getByLabel('搜索学习论坛')).toBeVisible({timeout:120000})
  await observeReactKeys(browser)
  await browser.evaluate(async()=>(await fetch('/api/fixture-teacher-entry/hold',{method:'POST'})).ok)
  await screen.getByRole('button','教师助手',{exact:true}).tap()
  await expect(screen.getByRole('button','教师助手',{exact:true})).toBeDisabled()
  await openHomework(screen)
  await expect(screen.getByRole('region','创建课程作业')).toBeVisible()
  await screen.getByRole('region','创建课程作业').getByLabel('作业标题',{exact:true}).fill('仅属于原课程的草稿')
  await browser.evaluate(async()=>(await fetch('/api/fixture-teacher-entry/pass',{method:'POST'})).ok)
  await expect.poll(()=>browser.evaluate(async()=>fetch('/api/fixture-teacher-entry').then(response=>response.json()).then(result=>result.pending))).toBe(0)
  expect(await browser.evaluate(()=>new URL(location.href).searchParams.has('conversation'))).toBe(false)
  await browser.evaluate(()=>{history.pushState({},'', '/?project=forum-other&view=forum');dispatchEvent(new PopStateEvent('popstate'));return true})
  await expect(screen.getByText('Other Forum Course',{exact:true}).first()).toBeVisible()
  await expect(screen.getByRole('region','创建课程作业')).toBeHidden()
  await openHomework(screen)
  await expect(screen.getByRole('region','创建课程作业').getByLabel('作业标题',{exact:true})).toHaveValue('')
  await app.open('/?project=e2e-classroom&view=forum')
  await openHomework(screen)
  await expect(screen.getByRole('region','创建课程作业').getByLabel('作业标题',{exact:true})).toHaveValue('仅属于原课程的草稿')
  await screen.getByRole('region','创建课程作业').getByLabel('作业标题',{exact:true}).focus()
  expect(await browser.evaluate(()=>document.activeElement?.tagName ?? null)).toBe('INPUT')
  await noKeyWarnings(browser)
  await app.screenshot('381-course-scoped-keyboard-draft')
})

test('381 late creation receipt cannot overwrite newer edits after returning to the same course',async({app,browser,screen})=>{
  await app.open('/');await browser.evaluate(async()=>(await fetch('/api/fixture-role/teacher')).ok)
  await app.open('/?project=e2e-classroom&view=forum')
  await expect(screen.getByLabel('搜索学习论坛')).toBeVisible({timeout:120000})
  await observeReactKeys(browser)
  await openHomework(screen)
  const form=screen.getByRole('region','创建课程作业')
  await form.getByLabel('作业标题',{exact:true}).fill('381 原请求草稿')
  await form.getByLabel('作业要求',{exact:true}).fill('说明计算过程。')
  await form.getByLabel('验收标准',{exact:true}).fill('独立说明每一步。')
  await browser.evaluate(async()=>{
    const original=window.fetch.bind(window)
    const state=window as unknown as {issue381CreationCompleted:boolean};state.issue381CreationCompleted=false
    window.fetch=async(...args)=>{
      const result=await original(...args)
      if(args[1]?.method==='PUT'&&String(args[0]).endsWith('/draft')){await result.clone().text();state.issue381CreationCompleted=true}
      return result
    }
    return (await fetch('/api/fixture-teacher-draft/hold',{method:'POST'})).ok
  })
  await form.getByRole('button','保存并检查草稿',{exact:true}).tap()
  await expect.poll(()=>browser.evaluate(async()=>fetch('/api/fixture-teacher-entry').then(response=>response.json()).then(result=>result.pendingDrafts))).toBe(1)
  const navigate=async(project:string)=>browser.evaluate(project=>{history.pushState({},'',`/?project=${project}&view=forum`);dispatchEvent(new PopStateEvent('popstate'));return true},project)
  await navigate('forum-other')
  await expect(screen.getByText('Other Forum Course',{exact:true}).first()).toBeVisible()
  await navigate('e2e-classroom')
  await expect(screen.getByLabel('搜索学习论坛')).toBeVisible()
  await openHomework(screen)
  await expect(form).toHaveCount(1)
  await form.getByLabel('作业标题',{exact:true}).fill('381 返回后新的未保存编辑')
  await expect.poll(()=>browser.evaluate(()=>{
    const key=Object.keys(localStorage).find(key=>key.endsWith(':create-homework:e2e-course'))
    return key?JSON.parse(localStorage.getItem(key)??'null')?.value?.title??null:null
  })).toBe('381 返回后新的未保存编辑')
  await browser.evaluate(async()=>(await fetch('/api/fixture-teacher-draft/release',{method:'POST'})).ok)
  await expect.poll(()=>browser.evaluate(()=>(window as unknown as {issue381CreationCompleted:boolean}).issue381CreationCompleted)).toBe(true)
  await browser.evaluate(async()=>{await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));return true})
  await browser.reload()
  await observeReactKeys(browser,false)
  await openHomework(screen)
  await expect(form.getByLabel('作业标题',{exact:true})).toHaveValue('381 返回后新的未保存编辑')
  await expect(form.getByRole('button','保存并检查草稿',{exact:true})).toBeEnabled()
  await noKeyWarnings(browser)
  await app.screenshot('381-late-receipt-preserves-newer-edit')
})

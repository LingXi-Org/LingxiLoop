/** Focused browser acceptance against real product UI/routers and an isolated,
 * formally migrated PostgreSQL test database. Run with Node 22 + --import tsx;
 * requires playwright (or PLAYWRIGHT_MODULE) and Chromium, never a model key.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer, transformWithEsbuild } from 'vite'
import { pool } from '../server/src/db/pool.ts'
import { buildApiTestApp, ensureSchemaOnce, installFakeWukong, resetAllTables, seedUserMembership, teardownAll } from '../server/src/__integration__/_helpers.ts'
const target = new URL(process.env.DATABASE_URL)
assert.equal(process.env.NODE_ENV, 'test')
assert.equal(target.hostname, '127.0.0.1')
assert.match(target.pathname, /_test$/)
assert.equal(process.env.OPENAI_API_KEY, 'integration-test-key')
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const company = 'browser-course-school', admin = 'browser-course-admin', teacher = 'browser-course-teacher'
await ensureSchemaOnce(); installFakeWukong()
async function seed() {
  await resetAllTables()
  await pool.query("INSERT INTO companies(id,name,slug,type,plan_id,status) VALUES($1,'课程引导验收公司',$1,'EDUCATION','plan-education','ACTIVE')", [company])
  await seedUserMembership(admin, company, { isAdmin: true, displayName: '公司管理员' })
  await seedUserMembership(teacher, company, { isAdmin: false, displayName: '课程教师' })
  await pool.query('UPDATE users SET email_verified_at=NOW()')
}
const app = await buildApiTestApp(admin)
const entry = `
import React from 'react'; import {createRoot} from 'react-dom/client';
import '/src/styles/globals.css';
import {DesktopApp} from '/src/desktop/DesktopApp';
import {useLearningSpaces} from '/src/desktop/useLearningSpaces';
import {useAuth} from '/src/stores/auth';
import {GlobalInteractionProvider} from '/src/components/GlobalInteractionProvider';
import {TooltipProvider} from '/src/components/ui/tooltip';
const params=new URLSearchParams(location.search);
document.documentElement.classList.toggle('dark',params.has('dark'));
useAuth.setState({authenticated:true,ready:true,user:{id:'${admin}',name:'公司管理员',email:'browser@test.local'},activeCompanyId:'${company}',companies:[{id:'${company}',name:'课程引导验收公司',slug:'browser',role:params.has('student')?'student':'teacher',isAdmin:!params.has('student'),status:'ACTIVE'}]});
function Fixture(){const spaces=useLearningSpaces(); return <TooltipProvider><GlobalInteractionProvider><DesktopApp learningSpaces={spaces}/></GlobalInteractionProvider></TooltipProvider>}
createRoot(document.getElementById('root')).render(<Fixture/>);`
const vite = await createServer({ server:{host:'127.0.0.1',port:5199,strictPort:true}, plugins:[{
  name:'focused-course-onboarding-acceptance',
  resolveId(id){if(id==='/__course-check.tsx')return '\0course-check.tsx'},
  async load(id){if(id==='\0course-check.tsx')return (await transformWithEsbuild(entry,'course-check.tsx',{loader:'tsx',jsx:'automatic'})).code},
  configureServer(server){
    server.middlewares.use(app)
    server.middlewares.use(async(req,res,next)=>{
      if(!req.url?.startsWith('/__course-check?'))return next()
      const html=await server.transformIndexHtml('/__course-check.html','<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/__course-check.tsx"></script></body></html>')
      res.setHeader('content-type','text/html');res.end(html)
    })
  },
}]})
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']})
const output='artifacts/course-onboarding'; await mkdir(output,{recursive:true})
const receipts=[]
try {
  await vite.listen()
  for(const [label,viewport,dark] of [['desktop',{width:1440,height:900},false],['mobile',{width:390,height:844},true]]){
    await seed()
    const context=await browser.newContext({viewport,reducedMotion:'reduce'})
    const page=await context.newPage()
    page.on('pageerror',error=>console.log('browser page error:',error.message))
    page.on('response',response=>{if(response.status()>=400)console.log('browser response:',response.status(),new URL(response.url()).pathname)})
    await page.goto(`http://127.0.0.1:5199/__course-check?${dark?'dark=1':''}`)
    await page.getByRole('heading',{name:'先创建一门课程'}).waitFor({timeout:60000}).catch(async error=>{await page.screenshot({path:`${output}/${label}-failure.png`});console.log('body:',(await page.locator('body').innerText()).slice(0,600));throw error})
    assert.equal(await page.locator('[data-slot="skeleton"]').count(),0)
    await page.reload() // Existing administrator returning later receives the same guide.
    await page.getByRole('heading',{name:'先创建一门课程'}).waitFor()
    await page.screenshot({path:`${output}/${label}-setup.png`,fullPage:true})
    let failNextReload = false, failOnce = label === 'desktop'
    await page.route('**/api/courses', async route => {
      if (route.request().method() === 'POST' && failOnce) { failNextReload = true; failOnce = false }
      await route.continue()
    })
    await page.route('**/api/learning/spaces*', async route => {
      if (failNextReload) { failNextReload = false; await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'temporary fixture failure'})}) }
      else await route.continue()
    })
    await page.getByLabel('课程名称',{exact:true}).fill(`${label} 第一门课程`)
    await page.getByLabel('课程简介（选填）').fill('真实数据库课程创建与教师分配验收')
    await page.getByRole('button',{name:'创建课程',exact:true}).click()
    if (label === 'desktop') {
      await page.getByRole('button',{name:'继续进入课程',exact:true}).waitFor()
      assert.equal((await pool.query('SELECT count(*)::int n FROM courses')).rows[0].n,1)
      await page.getByRole('button',{name:'继续进入课程',exact:true}).click()
    }
    await page.getByRole('button',{name:'添加课程教师',exact:true}).waitFor({timeout:30000})
    await page.getByRole('button',{name:'添加课程教师',exact:true}).click()
    await page.getByRole('combobox').click()
    await page.getByRole('option',{name:/课程教师/}).click()
    await page.getByRole('button',{name:'确认加入本课程'}).click()
    await page.getByRole('dialog',{name:'添加课程教师'}).waitFor({state:'hidden'})
    const granted=(await pool.query("SELECT count(*)::int n FROM project_memberships WHERE user_id=$1 AND role='TEACHER' AND status='ACTIVE'",[teacher])).rows[0].n
    assert.equal(granted,1)
    await page.screenshot({path:`${output}/${label}-members.png`,fullPage:true})
    await page.getByRole('button',{name:/切换工作区/}).click()
    await page.getByRole('menuitem',{name:'新建课程',exact:true}).click()
    await page.getByRole('dialog',{name:'新建课程',exact:true}).waitFor()
    await page.getByLabel('课程名称',{exact:true}).fill(`${label} 第二门课程`)
    await page.getByRole('button',{name:'创建课程',exact:true}).click()
    await page.getByRole('dialog',{name:'新建课程',exact:true}).waitFor({state:'hidden'})
    await page.getByRole('button',{name:'添加课程教师',exact:true}).waitFor()
    assert.equal((await pool.query('SELECT count(*)::int n FROM courses')).rows[0].n,2)
    await page.reload()
    await page.getByRole('button',{name:/切换工作区/}).waitFor()
    assert.equal(await page.getByRole('heading',{name:'先创建一门课程'}).count(),0)
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
    receipts.push({label,viewport,dark,reloadGuide:true,createdCourses:2,teacherGrants:granted,retryWithoutDuplicate:label==='desktop',realProductRouters:true})
    await context.close()
  }
  await seed()
  const page=await browser.newPage()
  await page.goto('http://127.0.0.1:5199/__course-check?student=1')
  await page.getByRole('heading',{name:'当前没有可用的学习空间'}).waitFor()
  assert.equal(await page.getByRole('heading',{name:'先创建一门课程'}).count(),0)
  await page.getByRole('button',{name:/切换工作区/}).click()
  assert.equal(await page.getByRole('menuitem',{name:'新建课程',exact:true}).count(),0)
  receipts.push({studentGuide:false,studentCreateEntry:false})
  await writeFile(`${output}/results.json`,JSON.stringify({passed:true,syntheticOnly:true,modelCalls:0,receipts},null,2)+'\n')
  console.log(JSON.stringify({passed:true,receipts}))
} finally { await browser.close();await vite.close();await teardownAll() }

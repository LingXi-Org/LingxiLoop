import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
test('retired learning URLs, reload and browser history cannot restore old screens',async({app,browser,screen})=>{
  await app.open('/')
  await browser.evaluate(async()=> (await fetch('/api/fixture-role/student')).ok)
  // Course dashboards are restored; only retired library/content URLs normalize.
  for(const view of ['library','course-content']){
    await app.open(`/?project=e2e-classroom&view=${view}`)
    await expect.poll(()=>browser.evaluate(()=>new URLSearchParams(location.search).get('view'))).toBe('conversations')
    await expect(screen.getByRole('button','论坛',{exact:true})).toBeVisible()
  }
  await browser.reload()
  await expect.poll(()=>browser.evaluate(()=>new URLSearchParams(location.search).get('view'))).toBe('conversations')
  await browser.back()
  await expect.poll(()=>browser.evaluate(()=>new URLSearchParams(location.search).get('view'))).toBe('conversations')
  await browser.forward()
  await expect.poll(()=>browser.evaluate(()=>new URLSearchParams(location.search).get('view'))).toBe('conversations')
  expect(await browser.evaluate(async()=>{
    const paths=['/api/courses/e2e-classroom/activities','/api/projects/e2e-classroom/learning/objectives','/api/projects/e2e-classroom/learning/missions']
    return Promise.all(paths.map(async path=>(await fetch(path)).status))
  })).toEqual([404,404,404])
  await app.screenshot('retired-navigation-normalized')
})

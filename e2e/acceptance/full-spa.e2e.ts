import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { mkdir, writeFile } from 'node:fs/promises'
import { mintSession, expireSession } from './session-fixture.mjs'

test('full SPA restores a synthetic D1 session, expires it and accepts a fresh session', {timeout:120000}, async ({app,screen,browser}) => {
  const session=await mintSession()
  await browser.setCookies([session.cookie])
  await app.open('/?project=e2e-classroom')
  await expect(screen.getByRole('navigation','工作区与功能')).toBeVisible({timeout:45000})
  await expect(screen.getByRole('button','新建对话').first()).toBeVisible()
  await app.screenshot('full-spa-session-restored')
  await browser.reload()
  await expect(screen.getByRole('navigation','工作区与功能')).toBeVisible()
  const before=await browser.evaluate(async () => (await fetch('/api/session',{credentials:'include'})).status)
  expect(before).toBe(200)
  expireSession(session.id)
  const expired=await browser.evaluate(async () => (await fetch('/api/session',{credentials:'include'})).status)
  expect(expired).toBe(401)
  await browser.reload()
  await expect(screen.getByLabel('邮箱')).toBeVisible()
  await expect(screen.getByRole('navigation','工作区与功能')).toBeHidden()
  await app.screenshot('full-spa-session-expired')
  const fresh=await mintSession()
  await browser.setCookies([fresh.cookie])
  await browser.reload()
  await expect(screen.getByRole('navigation','工作区与功能')).toBeVisible({timeout:45000})
  await expect(screen.getByRole('button','新建对话').first()).toBeVisible()
  await app.screenshot('full-spa-session-renewed')
  await mkdir('.e2e/full-spa-acceptance/counts',{recursive:true})
  await writeFile('.e2e/full-spa-acceptance/counts/session.json',JSON.stringify({before,expired,restored:true,fullSPA:true,realLocalD1:true,loginCaptchaQualified:false},null,2))
})

// Full React shell, actual Worker session validation and signed product API.
// Only transport failure is injected; no successful server response is mocked.
for (const fault of ['network-before-accept','database-pause','expired-session'] as const) {
  test(`full SPA ${fault} preserves recovery and never duplicates a durable human send`,{timeout:150000},async ({app,screen,browser})=>{
    const {messageFacts,pauseTestDatabase}=await import('./session-fixture.mjs')
    const session=await mintSession()
    await browser.setCookies([session.cookie])
    await app.open('/?project=e2e-classroom')
    await expect(screen.getByRole('navigation','工作区与功能')).toBeVisible({timeout:45000})
    await screen.getByRole('button','新建对话').first().tap()
    const dialog=screen.getByRole('dialog','新建对话')
    await dialog.getByLabel('搜索参与者').fill('E2E student')
    await dialog.getByRole('checkbox').first().check()
    await dialog.getByRole('button','开始对话').tap()
    await expect(dialog).toBeHidden()
    const text=`SPA acceptance ${crypto.randomUUID()}`
    const conversationUrl=await browser.evaluate(()=>location.href)
    let expiredUiPath:string|undefined
    const send='**/api/im/channels/*/messages/accept'
    if(fault==='network-before-accept') await browser.route(send,route=>route.abort())
    if(fault==='database-pause') pauseTestDatabase(true)
    if(fault==='expired-session') await browser.route(send,async route=>{expireSession(session.id);await route.continue()})
    try {
      await browser.locator('[contenteditable="true"]').fill(text)
      await screen.getByRole('button','发送').tap()
      if(fault==='expired-session') {
        // Both requests use the real session: typing can receive 401 first and
        // return the shell to login; the send client can instead block its outbox.
        await expect.poll(async()=>
          (await screen.getByText('自动发送已停止',{exact:true}).count())+
          (await screen.getByLabel('邮箱').count()),{timeout:30000}).toBe(1)
        expiredUiPath=(await screen.getByLabel('邮箱').count())?'login':'blocked-send'
        expect(await browser.evaluate(async ()=>(await fetch('/api/session',{credentials:'include'})).status)).toBe(401)
        await app.screenshot('full-spa-expired-session-blocked')
      } else {
        await expect.poll(()=>browser.evaluate(()=>JSON.parse(localStorage.getItem('lingxiloop.chat.outbox.v2:e2e-school:00000000-0000-4000-8000-000000000001')??'[]').length)).toBe(1)
        await browser.locator('[contenteditable="true"]').fill('故障期间保留的草稿')
        await app.screenshot(`full-spa-${fault}-pending`)
      }
    } finally {
      if(fault==='database-pause') pauseTestDatabase(false)
      if(fault==='network-before-accept'||fault==='expired-session') await browser.unroute(send)
    }
    if(fault==='expired-session') {
      expect((await messageFacts(text)).acceptances).toBe(0)
      const fresh=await mintSession()
      await browser.setCookies([fresh.cookie])
      if(expiredUiPath==='login') await app.open(conversationUrl)
      await expect(screen.getByRole('navigation','工作区与功能')).toBeVisible({timeout:45000})
      // Authorization rejection must not automatically dispatch an old send.
      await browser.evaluate(()=>window.dispatchEvent(new Event('online')))
      expect((await messageFacts(text)).acceptances).toBe(0)
    } else {
      await browser.evaluate(()=>window.dispatchEvent(new Event('online')))
      await expect.poll(()=>messageFacts(text),{timeout:45000}).toEqual({acceptances:1,accepted:1,imMessages:1})
      await expect(browser.locator('[contenteditable="true"]')).toContainText('故障期间保留的草稿')
      await expect.poll(()=>browser.evaluate(()=>JSON.parse(localStorage.getItem('lingxiloop.chat.outbox.v2:e2e-school:00000000-0000-4000-8000-000000000001')??'[]').length)).toBe(0)
    }
    await browser.locator('[contenteditable="true"]').fill(`${text} next`)
    await screen.getByRole('button','发送').tap()
    await expect.poll(()=>messageFacts(`${text} next`),{timeout:45000}).toEqual({acceptances:1,accepted:1,imMessages:1})
    if(fault==='expired-session') expect((await messageFacts(text)).acceptances).toBe(0)
    await app.screenshot(`full-spa-${fault}-recovered`)
    await mkdir('.e2e/full-spa-acceptance/counts',{recursive:true})
    await writeFile(`.e2e/full-spa-acceptance/counts/${fault}.json`,JSON.stringify({fault,expiredUiPath,original:await messageFacts(text),next:await messageFacts(`${text} next`),fullSPA:true,loginCaptchaQualified:false},null,2))
  })
}

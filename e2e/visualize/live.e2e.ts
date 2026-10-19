import {test} from '@e2e-dev/web'
import {expect} from 'e2e'
import {mkdir,writeFile} from 'node:fs/promises'

// Defined before the live model/worker fixture. This entry must use real native
// messages, real resource/state APIs and real model ledger; no browser routes.
test('real model question → generated message → visualization → adjustment → continued explanation',async({app,browser,screen})=>{
  await app.open('/e2e/visualize/live.html')
  await expect(browser.locator('[data-testid="gen-ui-card"]').first()).toHaveAttribute('data-gen-ui-phase','ready',{timeout:90000})
  const guest=browser.frameLocator('iframe[data-visualize-guest]:visible').frameLocator('iframe[data-visualize-content]')
  const slider=guest.getByRole('slider').first()
  await expect(slider).toBeVisible()
  const before=await browser.evaluate(async()=>await fetch('/__visualize_live/stats').then(response=>response.json())) as {modelCalls:number;assistantCount:number;states:unknown}
  expect(before.modelCalls).toBeGreaterThan(0)
  const screenshots={generated:await app.screenshot('live-generated'),adjusted:'',continued:''}
  await slider.focus()
  await browser.keyboard.press('Home')
  await browser.keyboard.press('ArrowRight')
  await browser.keyboard.press('Tab')
  await expect.poll(async()=>JSON.stringify((await browser.evaluate(async()=>await fetch('/__visualize_live/stats').then(response=>response.json()))).states)).not.toBe(JSON.stringify(before.states))
  const adjusted=await browser.evaluate(async()=>await fetch('/__visualize_live/stats').then(response=>response.json())) as {modelCalls:number;assistantCount:number;states:unknown}
  expect(adjusted.modelCalls).toBe(before.modelCalls)
  screenshots.adjusted=await app.screenshot('live-adjusted-before-follow-up')
  await guest.getByRole('button','继续讲解',{exact:true}).tap()
  // Real bridge may request explicit confirmation; preserve the native dialog.
  const confirmation=screen.getByRole('button','发送',{exact:true})
  if(await confirmation.count())await confirmation.tap()
  await expect.poll(async()=>Number((await browser.evaluate(async()=>await fetch('/__visualize_live/stats').then(response=>response.json()))).assistantCount),{timeout:180000}).toBeGreaterThan(before.assistantCount)
  screenshots.continued=await app.screenshot('live-continued-explanation')
  const after=await browser.evaluate(async()=>await fetch('/__visualize_live/stats').then(response=>response.json()))
  const output=process.env.E2E_VISUALIZE_LIVE_OUTPUT??'.e2e/visualize-live'
  await mkdir(output,{recursive:true})
  await writeFile(`${output}/live-interaction.json`,JSON.stringify({status:'passed',before,adjusted,after,screenshots,modelResponses:'real provider via published LingxiOS and shared ledger',rendering:'NativeMessageContent + production visualize host'},null,2))
})

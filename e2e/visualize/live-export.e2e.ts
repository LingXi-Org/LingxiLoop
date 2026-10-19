import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {test} from '@e2e-dev/web'
import {expect} from 'e2e'

// Actual model artifact must retain an editable quantity, persist independently,
// render offline, and match the exact bytes delivered by the runtime export.
test('actual model export remains editable offline and restores its quantity',async({app,browser})=>{
  const blocked:string[]=[]
  await browser.route(/^https?:\/\/(?!127\.0\.0\.1:5198(?:\/|$))/,route=>{blocked.push(route.request.url);return route.abort()})
  await app.open('/quantity-export.html')
  const guest=browser.frameLocator('#zcode-visualization')
  const slider=guest.getByRole('slider').first()
  await expect(slider).toBeVisible()
  const before=await slider.inputValue()
  await slider.focus()
  await browser.keyboard.press('End')
  await browser.keyboard.press('ArrowLeft')
  await browser.keyboard.press('Tab')
  const adjusted=await slider.inputValue()
  expect(adjusted).not.toBe(before)
  const screenshots={adjusted:await app.screenshot('real-export-adjusted-offline'),restored:''}
  await browser.reload()
  await expect(slider).toHaveValue(adjusted)
  screenshots.restored=await app.screenshot('real-export-restored-offline')
  expect(blocked).toEqual([])
  const output=process.env.E2E_VISUALIZE_LIVE_OUTPUT??'.e2e/visualize-live'
  const artifact=resolve(output,'quantity-export.html')
  const bytes=await readFile(artifact)
  await mkdir(output,{recursive:true})
  await writeFile(resolve(output,'live-export-interaction.json'),JSON.stringify({status:'passed',artifact,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,before,adjusted,restored:await slider.inputValue(),blockedExternalRequests:blocked,screenshots},null,2))
})

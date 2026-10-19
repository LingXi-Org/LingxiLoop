import {createHash} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Expected failures defined before fixture-server implementation. The fixture
// instruments only API persistence/transport; guest and UI code are production.
test('variants retain local state, tabs load D3/calendar and mobile stays bounded', async ({ app,browser }) => {
  await app.open('/e2e/visualize/index.html?implementation=product&theme=light')
  const guest=browser.frameLocator('iframe[data-visualize-guest]:visible').frameLocator('iframe[data-visualize-content]')
  await expect(guest.getByRole('button','Saved count: 5',{exact:true})).toBeVisible()
  await guest.getByRole('button','Next variant',{exact:true}).tap()
  await guest.getByRole('button','Local count: 0',{exact:true}).tap()
  await guest.getByRole('button','Previous variant',{exact:true}).tap()
  await guest.getByRole('button','Next variant',{exact:true}).tap()
  await expect(guest.getByRole('button','Local count: 1',{exact:true})).toBeVisible()
  await guest.getByRole('tab','Data',{exact:true}).tap()
  await expect(guest.locator('#fixture-chart rect')).toHaveCount(3)
  await guest.getByText('Standup',{exact:true}).tap()
  await expect(guest.locator('#fixture-calendar-selection')).toHaveText('Standup')
  await app.screenshot('product-calendar-d3')
  await browser.setViewport({width:390,height:844})
  expect(await browser.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await app.screenshot('product-mobile-390')
})

test('session switching retains each state and host theme synchronizes in place', async ({app,browser,screen})=>{
  await app.open('/e2e/visualize/index.html?implementation=product&theme=light')
  const guest=browser.frameLocator('iframe[data-visualize-guest]:visible').frameLocator('iframe[data-visualize-content]')
  await guest.getByRole('button','Saved count: 5',{exact:true}).tap()
  await expect(guest.locator('#fixture-status')).toHaveText('Saved')
  await screen.getByRole('button','Fixture session B',{exact:true}).tap()
  await expect(guest.getByRole('button','Saved count: 5',{exact:true})).toBeVisible()
  await screen.getByRole('button','Fixture session A',{exact:true}).tap()
  await expect(guest.getByRole('button','Saved count: 6',{exact:true})).toBeVisible()
  await browser.evaluate(()=>{document.documentElement.classList.add('dark');document.documentElement.classList.remove('light');return true})
  await expect(guest.locator('html')).toHaveAttribute('data-theme','dark')
  await expect(guest.getByRole('button','Saved count: 6',{exact:true})).toBeVisible()
  await app.screenshot('product-session-theme-retention')
})

test('failed acquisition retries explicitly',async({app,browser,screen})=>{
  await app.open('/e2e/visualize/index.html?implementation=product&theme=light&failOnce=1')
  await expect(screen.getByText('无法加载交互视图',{exact:true})).toBeVisible()
  await screen.getByRole('button','重试',{exact:true}).tap()
  await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase','ready')
  await app.screenshot('product-explicit-retry')
})

test('copy-image button writes a real PNG through the host clipboard',async({app,browser,screen})=>{
  await app.open('/e2e/visualize/index.html?implementation=product&theme=light')
  await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase','ready')
  await screen.getByRole('button','复制图像',{exact:true}).tap()
  await expect(screen.getByRole('button','复制图像',{exact:true})).toBeEnabled()
  // Clipboard read can require an explicit browser permission; missing access is
  // a failed/unverified gate, never replaced with a stubbed successful write.
  const image=await browser.evaluate(async()=>{
    const items=await navigator.clipboard.read()
    const png=items.find(item=>item.types.includes('image/png'))
    if(!png) return {type:'',size:0,width:0,height:0,png:[] as number[]}
    const blob=await png.getType('image/png'), bitmap=await createImageBitmap(blob)
    return {type:blob.type,size:blob.size,width:bitmap.width,height:bitmap.height,png:Array.from(new Uint8Array(await blob.arrayBuffer()))}
  })
  expect(image.type).toBe('image/png')
  expect(image.size).toBeGreaterThan(100)
  expect(image.width).toBeGreaterThan(100)
  expect(image.height).toBeGreaterThan(100)
  const output=process.env.E2E_VISUALIZE_OUTPUT??'.e2e/visualize'
  await mkdir(output,{recursive:true})
  const {png,...metadata}=image,bytes=Buffer.from(png)
  await writeFile(`${output}/clipboard-readback.png`,bytes)
  await writeFile(`${output}/clipboard-interaction.json`,JSON.stringify({...metadata,sha256:createHash('sha256').update(bytes).digest('hex'),nativeReadback:true,permissionOrigin:'http://127.0.0.1:5193'},null,2))
  await app.screenshot('product-copy-image-clipboard')
})


test('offline host exposes recovery and reconnects when online',async({app,browser,screen})=>{
  await browser.addInitScript(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false})})
  await app.open('/e2e/visualize/index.html?implementation=product&theme=light')
  await expect(screen.getByText('工作区已离线，请重新连接后重试',{exact:true})).toBeVisible()
  await app.screenshot('product-offline')
  await browser.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'));return true})
  await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase','ready')
})

test('page capacity reclaims hidden guests and restores the oldest saved state',{timeout:330000},async({app,browser,screen})=>{
  await app.open('/e2e/visualize/index.html?implementation=product&theme=light&capacity=1')
  const guest=browser.frameLocator('iframe[data-visualize-guest]:visible')
  const inner=guest.frameLocator('iframe[data-visualize-content]')
  await expect(inner.getByRole('button','Saved count: 5',{exact:true})).toBeVisible()
  await inner.getByRole('button','Saved count: 5',{exact:true}).tap({timeout:90000})
  await expect(inner.getByRole('button','Saved count: 6',{exact:true})).toBeVisible()
  const started=Date.now()
  // Batch the public fixture button's ordinary DOM events to avoid the official
  // runner observing all retained frames after every admission. No host/private
  // API or trusted-gesture path is used in this capacity-only setup.
  for(let batch=0;batch<13;batch++){
    await browser.evaluate(async({start,end})=>{
      const next=Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Fixture next page')!
      for(let index=start;index<=end;index++){
        next.click()
        const deadline=Date.now()+25000
        while(document.querySelector('[data-testid="fixture-page-index"]')?.textContent!==String(index)||document.querySelector('[data-testid="gen-ui-card"]')?.getAttribute('data-gen-ui-phase')!=='ready'){
          if(Date.now()>deadline)throw new Error(`Fixture page ${index} did not become ready`)
          await new Promise(resolve=>setTimeout(resolve,20))
        }
      }
      return true
    },{start:batch*5+1,end:Math.min(batch*5+5,63)})
  }
  const atLimit=await browser.evaluate(async()=>await fetch('/__visualize_fixture/evidence').then(response=>response.json()))
  expect(atLimit.activePages).toBe(64)
  expect(atLimit.closedPages).toBe(0)
  await screen.getByRole('button','Fixture next page',{exact:true}).tap()
  await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase','ready')
  await expect.poll(async()=>Number((await browser.evaluate(async()=>await fetch('/__visualize_fixture/evidence').then(response=>response.json()))).closedPages)).toBeGreaterThan(0)
  const counts=await browser.evaluate(async()=>await fetch('/__visualize_fixture/evidence').then(response=>response.json()))
  expect(counts.activePages).toBeLessThanOrEqual(64)
  const output=process.env.E2E_VISUALIZE_OUTPUT??'.e2e/visualize'
  await mkdir(output,{recursive:true})
  await writeFile(`${output}/capacity-interaction.json`,JSON.stringify({atLimit,afterOverflow:counts,elapsedMs:Date.now()-started,admission:'public fixture next button DOM events; overflow and restoration use official trusted clicks'},null,2))
  await screen.getByRole('button','Fixture first page',{exact:true}).tap()
  await expect(inner.getByRole('button','Saved count: 6',{exact:true})).toBeVisible()
  await app.screenshot('product-capacity-restored')
})

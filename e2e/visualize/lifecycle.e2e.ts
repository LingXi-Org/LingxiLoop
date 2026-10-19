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
    if(!png) return {type:'',size:0,width:0,height:0}
    const blob=await png.getType('image/png'), bitmap=await createImageBitmap(blob)
    return {type:blob.type,size:blob.size,width:bitmap.width,height:bitmap.height}
  })
  expect(image.type).toBe('image/png')
  expect(image.size).toBeGreaterThan(100)
  expect(image.width).toBeGreaterThan(100)
  expect(image.height).toBeGreaterThan(100)
})


test('offline host exposes recovery and reconnects when online',async({app,browser,screen})=>{
  await browser.addInitScript(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false})})
  await app.open('/e2e/visualize/index.html?implementation=product&theme=light')
  await expect(screen.getByText('工作区已离线，请重新连接后重试',{exact:true})).toBeVisible()
  await app.screenshot('product-offline')
  await browser.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'));return true})
  await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase','ready')
})

test('page capacity reclaims hidden guests and restores the oldest saved state',{timeout:600000},async({app,browser,screen})=>{
  await app.open('/e2e/visualize/index.html?implementation=product&theme=light&capacity=1')
  const guest=browser.frameLocator('iframe[data-visualize-guest]:visible')
  const inner=guest.frameLocator('iframe[data-visualize-content]')
  await inner.getByRole('button','Saved count: 5',{exact:true}).tap()
  await expect(inner.getByRole('button','Saved count: 6',{exact:true})).toBeVisible()
  for(let index=1;index<=65;index++){
    await screen.getByRole('button','Fixture next page',{exact:true}).tap()
    await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase','ready')
  }
  const counts=await browser.evaluate(async()=>await fetch('/__visualize_fixture/evidence').then(response=>response.json()))
  expect(counts.activePages).toBeLessThanOrEqual(64)
  expect(counts.closedPages).toBeGreaterThan(0)
  await screen.getByRole('button','Fixture first page',{exact:true}).tap()
  await expect(inner.getByRole('button','Saved count: 6',{exact:true})).toBeVisible()
  await app.screenshot('product-capacity-restored')
})

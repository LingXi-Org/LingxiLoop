import { mkdir, writeFile } from 'node:fs/promises'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Acceptance contract written before Web host implementation. Both entries must
// render the exact same fixture; only the original/product component import differs.
for (const implementation of ['upstream', 'product']) {
  for (const theme of ['light', 'dark']) {
    test(`${implementation}: complete card interaction (${theme})`, {timeout:300000}, async ({ app, browser, screen }) => {
      await app.open(`/e2e/visualize/index.html?implementation=${implementation}&theme=${theme}`)
      await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase', 'ready')
      const guest = browser.frameLocator('iframe[data-visualize-guest]:visible').frameLocator('iframe[data-visualize-content]')
      await expect(guest.locator('[data-fixture-ready="true"]')).toBeVisible()
      const environment = await browser.evaluate(async () => {
        await document.fonts.ready
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        return { dpr:devicePixelRatio, width:innerWidth, height:innerHeight, font:getComputedStyle(document.body).fontFamily, userAgent:navigator.userAgent, theme:document.documentElement.classList.contains('dark')?'dark':'light' }
      })
      expect(environment.dpr).toBe(1)
      expect(environment.width).toBe(1440)
      expect(environment.height).toBe(960)
      expect(environment.theme).toBe(theme)
      await browser.mouse.move(0, 0)
      const screenshots: Record<string,string> = {}
      screenshots.card = await app.screenshot(`${implementation}-${theme}-card`)
      const height = await browser.locator('[data-testid="gen-ui-anchor"]').getAttribute('style')
      await guest.getByRole('button','Show detail',{exact:true}).tap()
      await expect(guest.getByText('Rain, wind, birds, and distant water.',{exact:true})).toBeVisible()
      await expect.poll(() => browser.locator('[data-testid="gen-ui-anchor"]').getAttribute('style')).not.toBe(height)
      await guest.getByRole('button','Show detail',{exact:true}).tap()
      await screen.getByRole('button','调整设计',{exact:true}).focus()
      expect(await browser.evaluate(()=>getComputedStyle(document.querySelector('[data-testid="gen-ui-actions"]')!).opacity)).toBe('1')
      await screen.getByRole('button','调整设计',{exact:true}).tap()
      await expect(screen.getByText('Player settings',{exact:true})).toBeVisible()
      await expect(screen.getByText('Editorial settings',{exact:true})).toBeVisible()
      await screen.getByRole('slider','Corner radius (px)',{exact:true}).focus()
      await browser.keyboard.press('Home')
      await browser.keyboard.press('ArrowRight')
      await screen.getByLabel('Accent',{exact:true}).fill('#c83260')
      await screen.getByRole('checkbox','Playing',{exact:true}).uncheck()
      await screen.getByLabel('Density',{exact:true}).selectOption({value:'compact'})
      await expect(guest.locator('#fixture-render')).toHaveText('radius=1; accent=#c83260; playing=false; density=compact')
      screenshots.controls = await app.screenshot(`${implementation}-${theme}-controls`)
      const presentation=await browser.evaluate(()=>{
        const styles=(element:Element|null)=>{if(!element)return null;const css=getComputedStyle(element),rect=element.getBoundingClientRect();return {font:css.font,fontFamily:css.fontFamily,fontSize:css.fontSize,lineHeight:css.lineHeight,color:css.color,background:css.backgroundColor,border:css.border,borderRadius:css.borderRadius,padding:css.padding,width:rect.width,height:rect.height}}
        const panel=document.querySelector('[data-testid="gen-ui-tweaks"]')
        return {body:styles(document.body),card:styles(document.querySelector('[data-testid="gen-ui-card"]')),panel:styles(panel),select:styles(panel?.querySelector('select')??null),buttons:Array.from(panel?.querySelectorAll('button')??[]).map(element=>({text:element.textContent,...styles(element)}))}
      })
      await screen.getByRole('button','预览原始值',{exact:true}).tap()
      await expect(guest.locator('#fixture-render')).toHaveText('radius=18; accent=#7c3aed; playing=true; density=normal')
      await screen.getByRole('button','预览原始值',{exact:true}).tap()
      await expect(guest.locator('#fixture-render')).toHaveText('radius=1; accent=#c83260; playing=false; density=compact')
      await screen.getByRole('button','重置',{exact:true}).tap()
      await expect(guest.locator('#fixture-render')).toHaveText('radius=18; accent=#7c3aed; playing=true; density=normal')
      await screen.getByRole('slider','Corner radius (px)',{exact:true}).focus()
      await browser.keyboard.press('ArrowRight')
      await screen.getByRole('button','提交设计变更',{exact:true}).tap()
      await expect(browser.locator('[data-testid="fixture-follow-ups"]')).toContainText('Corner radius')
      await expect(browser.locator('[data-testid="fixture-follow-ups"]')).toContainText('19')
      await guest.getByRole('button','Saved count: 5',{exact:true}).tap()
      await expect(guest.getByRole('button','Saved count: 6',{exact:true})).toBeVisible()
      await expect(guest.locator('#fixture-status')).toHaveText('Saved')
      await screen.getByRole('button','放大',{exact:true}).tap()
      await expect(screen.getByRole('dialog')).toBeVisible()
      await expect(guest.getByRole('button','Saved count: 6',{exact:true})).toBeVisible()
      screenshots.dialog = await app.screenshot(`${implementation}-${theme}-dialog`)
      await screen.getByRole('button','收起',{exact:true}).tap()
      await expect(screen.getByRole('dialog')).toHaveCount(0)
      await expect(guest.getByRole('button','Saved count: 6',{exact:true})).toBeVisible()
      await browser.reload()
      await expect(guest.getByRole('button','Saved count: 6',{exact:true})).toBeVisible()
      const output=process.env.E2E_VISUALIZE_OUTPUT??'.e2e/visualize'
      await mkdir(output,{recursive:true})
      await writeFile(`${output}/${implementation}-${theme}-interaction.json`,JSON.stringify({implementation,theme,environment,presentation,screenshots,status:'passed',checks:['ready','height','keyboard-toolbar','groups','range','color','toggle','select','original','reset','submit','save','expand-collapse','reload']},null,2))
    })
  }
}

test('standalone render.py export runs offline and retains independent widget state', async ({ app, browser }) => {
  await browser.route(/^https?:\/\/(?!127\.0\.0\.1:5193(?:\/|$))/, route => route.abort())
  await app.open('/e2e/visualize/generated/export.html')
  const guest=browser.frameLocator('#zcode-visualization')
  await expect(guest.getByRole('button','Count: 5',{exact:true})).toBeVisible()
  await guest.getByRole('button','Count: 5',{exact:true}).tap()
  await expect(guest.getByRole('button','Count: 6',{exact:true})).toBeVisible()
  await expect(guest.locator('#export-chart rect')).toHaveCount(1)
  await expect(guest.getByText('Offline meeting',{exact:true})).toBeVisible()
  await browser.reload()
  await expect(guest.getByRole('button','Count: 6',{exact:true})).toBeVisible()
  await app.screenshot('standalone-export-offline')
})

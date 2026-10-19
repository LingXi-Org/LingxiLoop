import {mkdir,writeFile} from 'node:fs/promises'
import {test} from '@e2e-dev/web'
import {expect} from 'e2e'

// Final presentation-only recapture after correcting the original Web entry
// inputs. Full parameter/state behavior is recorded in the earlier parity runs.
for(const implementation of ['upstream','product'])for(const theme of ['light','dark']){
  test(`${implementation}: upstream Web presentation (${theme})`,{timeout:240000},async({app,browser,screen})=>{
    await app.open(`/e2e/visualize/index.html?implementation=${implementation}&theme=${theme}`)
    await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase','ready')
    const guest=browser.frameLocator('iframe[data-visualize-guest]:visible').frameLocator('iframe[data-visualize-content]')
    await expect(guest.locator('[data-fixture-ready="true"]')).toBeVisible()
    const environment=await browser.evaluate(async()=>{
      await document.fonts.ready
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))
      const root=document.documentElement,body=getComputedStyle(document.body)
      return {dpr:devicePixelRatio,width:innerWidth,height:innerHeight,font:body.fontFamily,color:body.color,colorScheme:getComputedStyle(root).colorScheme,themeClasses:root.className,themeSurface:root.getAttribute('data-zcode-browser-theme-surface'),userAgent:navigator.userAgent}
    })
    expect(environment.dpr).toBe(1)
    expect(environment.width).toBe(1440)
    expect(environment.height).toBe(960)
    expect(environment.themeClasses).toContain(`theme-zai-${theme}`)
    expect(environment.colorScheme).toBe(theme)
    expect(environment.themeSurface).toBe(theme)
    await browser.mouse.move(0,0)
    const screenshots:Record<string,string>={}
    screenshots.card=await app.screenshot(`${implementation}-${theme}-card`)
    await screen.getByRole('button','调整设计',{exact:true}).tap({timeout:90000})
    await expect(screen.getByText('Player settings',{exact:true})).toBeVisible()
    await expect(screen.getByText('Editorial settings',{exact:true})).toBeVisible()
    await browser.mouse.move(0,0)
    screenshots.controls=await app.screenshot(`${implementation}-${theme}-controls`)
    const presentation=await browser.evaluate(()=>{
      const inspect=(element:Element|null)=>{
        if(!element)return null
        const css=getComputedStyle(element),rect=element.getBoundingClientRect()
        return {font:css.font,fontFamily:css.fontFamily,fontSize:css.fontSize,color:css.color,colorScheme:css.colorScheme,background:css.backgroundColor,border:css.border,borderRadius:css.borderRadius,width:rect.width,height:rect.height}
      }
      const panel=document.querySelector('[data-testid="gen-ui-tweaks"]')
      return {body:inspect(document.body),card:inspect(document.querySelector('[data-testid="gen-ui-card"]')),panel:inspect(panel),label:inspect(panel?.querySelector('label')??null),select:inspect(panel?.querySelector('select')??null),buttons:Array.from(panel?.querySelectorAll('button')??[]).map(element=>({text:element.textContent,...inspect(element)}))}
    })
    await screen.getByRole('button','放大',{exact:true}).tap({timeout:90000})
    await expect(screen.getByRole('dialog')).toBeVisible()
    await expect(guest.locator('[data-fixture-ready="true"]')).toBeVisible()
    await browser.mouse.move(0,0)
    screenshots.dialog=await app.screenshot(`${implementation}-${theme}-dialog`)
    const output=process.env.E2E_VISUALIZE_OUTPUT??'.e2e/visualize-web-final'
    await mkdir(output,{recursive:true})
    await writeFile(`${output}/${implementation}-${theme}-interaction.json`,JSON.stringify({implementation,theme,environment,presentation,screenshots,status:'passed',checks:['upstream-Web-theme','ready','card','controls','dialog'],controlState:'original defaults, no parameter edits'},null,2))
  })
}

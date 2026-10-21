import { mkdir, writeFile } from 'node:fs/promises'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Real pinned resources/guest/SDK. Only HTTP fault timing is synthetic.
// Failure inventory: perf/issue-274/FAILURE-MODEL.md.
for (const mode of ['stall-once', 'drop-once', '503-once', 'slow-body', 'slow-headers', 'offline', 'denied', 'retry-after']) {
  test(`resource recovery: ${mode}`, async ({ app, browser, screen }) => {
    await app.open('/e2e/visualize/loading.html?count=1')
    const observation = await browser.evaluate(async mode => {
      await fetch(`/__visualize_fixture/resource-fault?mode=${mode}`)
      const errors: string[] = []
      const rejected = (event: PromiseRejectionEvent) => errors.push(event.reason?.name ?? 'unknown')
      addEventListener('unhandledrejection', rejected)
      const start = performance.now()
      const stamps: Record<string, number> = {}
      let content = false, painting = false
      const result = await new Promise<{phase: string; error: string; elapsed: number}>((resolve, reject) => {
        const done = (phase: string) => {
          clearTimeout(timer);observer.disconnect();removeEventListener('message', message)
          resolve({phase, error: phase === 'error' ? document.querySelector('[data-testid="gen-ui-card"]')?.textContent ?? '' : '', elapsed: performance.now() - start})
        }
        const inspect = () => {
          const card=document.querySelector('[data-testid="gen-ui-card"]')
          const frame=card?.querySelector('iframe[data-visualize-guest]')
          if(frame)stamps.frame??=performance.now()-start
          const phase=card?.getAttribute('data-gen-ui-phase')
          if(phase==='error')done(phase)
          if(phase==='ready'&&content&&frame?.checkVisibility()&&!painting) {
            painting=true
            requestAnimationFrame(()=>requestAnimationFrame(()=>done('ready')))
          }
        }
        const message=(event:MessageEvent)=>{
          const frame=document.querySelector<HTMLIFrameElement>('iframe[data-visualize-guest]')
          if(!frame||event.source!==frame.contentWindow)return
          if(event.data?.method==='ui/notifications/initialized')stamps.initialized=performance.now()-start
          if(event.data?.method==='ui/notifications/size-changed'&&event.data.params?.height>100)content=true
          inspect()
        }
        const observer=new MutationObserver(inspect)
        observer.observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-gen-ui-phase','style']})
        addEventListener('message',message)
        const timer=setTimeout(()=>{observer.disconnect();removeEventListener('message',message);reject(new Error('No terminal phase after 17s'))},17000)
        Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='进入 A')!.click()
      })
      removeEventListener('unhandledrejection',rejected)
      const requests=performance.getEntriesByType('resource').filter(entry=>entry.name.includes('/visualize/pages')).map(item=>{
        const entry=item as PerformanceResourceTiming,url=new URL(entry.name)
        return {name:url.searchParams.get('name')??url.pathname.split('/').at(-1)??'unknown',start:entry.startTime-start,end:entry.responseEnd-start,bytes:entry.transferSize}
      })
      return {...result,stamps,errors,requests,transport:await fetch('/__visualize_fixture/resource-evidence').then(response=>response.json()) as {attempts:{name:string;attempt:number;start:number;end?:number;outcome?:string}[]}}
    },mode)
    const output=process.env.E2E_VISUALIZE_OUTPUT??'.e2e/visualize-resources'
    await mkdir(output,{recursive:true})
    await writeFile(`${output}/${mode}.json`,JSON.stringify(observation,null,2))
    const successes=['stall-once','drop-once','503-once','slow-body','slow-headers']
    expect(observation.phase).toBe(successes.includes(mode)?'ready':'error')
    expect(observation.errors).toHaveLength(0)
    const attempts=observation.transport.attempts.filter(item=>item.name==='gen-ui.js')
    expect(attempts).toHaveLength(['stall-once','drop-once','503-once','slow-headers','offline'].includes(mode)?2:1)
    if(mode==='stall-once')expect(observation.elapsed).toBeLessThan(10000)
    if(mode==='slow-body')expect(observation.elapsed).toBeGreaterThan(8000)
    if(mode==='slow-headers') {
      // Both GETs take 6s to first byte: preserve the original response instead
      // of aborting it at 5s and waiting another full 6s for the recovery GET.
      expect(observation.elapsed).toBeLessThan(9000)
      expect(attempts[0].outcome).toBe('complete')
    }
    if(successes.includes(mode)) {
      expect(observation.requests.filter(item=>item.name==='pages')).toHaveLength(1)
      for(const name of new Set(observation.transport.attempts.map(item=>item.name))) {
        if(name!=='gen-ui.js')expect(observation.transport.attempts.filter(item=>item.name===name)).toHaveLength(1)
      }
    } else {
      expect(observation.error).toContain('gen-ui.js')
      expect(observation.elapsed).toBeLessThan(5000)
    }
    if(mode==='offline') {
      await browser.evaluate(async()=>{await fetch('/__visualize_fixture/resource-fault');return true})
      await screen.getByRole('button','重试',{exact:true}).tap()
    }
    if(successes.includes(mode)||mode==='offline') {
      const guest=browser.frameLocator('iframe[data-visualize-guest]:visible').frameLocator('iframe[data-visualize-content]')
      await expect(guest.locator('[data-fixture-ready="true"]')).toBeVisible()
      await expect(guest.locator('#fixture-chart rect')).toHaveCount(3)
      await guest.locator('#fixture-play').tap()
      await expect(guest.locator('#fixture-play-label')).toHaveText('Play')
      if(mode==='offline') {
        await expect.poll(()=>browser.evaluate(async()=>fetch('/__visualize_fixture/evidence').then(response=>response.json()).then(data=>data.activePages))).toBe(1)
        const recovered=await browser.evaluate(async()=>({
          pages:await fetch('/__visualize_fixture/evidence').then(response=>response.json()),
          resources:await fetch('/__visualize_fixture/resource-evidence').then(response=>response.json()),
        }))
        await writeFile(`${output}/offline-recovered.json`,JSON.stringify(recovered,null,2))
        expect(recovered.resources.attempts.filter((item:{name:string})=>item.name==='gen-ui.js')).toHaveLength(3)
      }
      await app.screenshot(`usable-${mode}`)
    }
  })
}

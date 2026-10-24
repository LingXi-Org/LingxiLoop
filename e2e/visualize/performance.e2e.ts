import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

test('measure saved static, interactive, fresh-page, retained and first-visible-card startup', async ({app,browser}) => {
  const threeOnly = process.env.E2E_VISUALIZE_377_THREE_ONLY === '1'
  await browser.addInitScript(() => {
    const now = () => performance.timeOrigin + performance.now()
    if (window === window.top) {
      const events: unknown[] = []
      Object.assign(window,{visualizePerfEvents:events})
      new PerformanceObserver(list=>{for(const entry of list.getEntries())events.push({event:'longtask',at:performance.timeOrigin+entry.startTime,duration:entry.duration})}).observe({type:'longtask',buffered:true})
      addEventListener('message',event => {
        if(event.data?.visualizePerf === true) events.push(event.data)
        if(event.data?.method==='ui/initialize')events.push({event:'sdk-initialize',at:now()})
      })
      const seen = new WeakSet<Element>()
      new MutationObserver(()=>{
        const card=document.querySelector('[data-testid="gen-ui-card"]')
        if(card?.getAttribute('data-gen-ui-phase')==='ready'&&!seen.has(card)){seen.add(card);events.push({event:'ready',at:now()})}
      }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-gen-ui-phase']})
      return
    }
    const frameId = crypto.randomUUID()
    let painted = false
    const sample = (event: string, token?: string) => {
      const scene = document.querySelector<HTMLElement>('[data-perf-scene]')
      const svg = scene?.querySelector('svg')
      if(!scene || !svg || svg.getBoundingClientRect().width < 20 || svg.getBoundingClientRect().height < 20) return
      const button = scene.querySelector<HTMLButtonElement>('#perf-action')
      const box = button?.getBoundingClientRect()
      window.top!.postMessage({visualizePerf:true,frameId,event,token,at:now(),kind:scene.dataset.perfScene,
        count:Number(scene.querySelector<HTMLElement>('#perf-result')?.dataset.count ?? 0),
        button:box?{x:box.x+box.width/2,y:box.y+box.height/2}:null},'*')
    }
    const inspect = () => {
      if(!painted && document.querySelector('[data-perf-scene] svg')) {
        painted = true
        requestAnimationFrame(()=>requestAnimationFrame(()=>sample('paint')))
      }
      if(Number(document.querySelector<HTMLElement>('#perf-result')?.dataset.count ?? 0)>0) sample('operation')
    }
    const observer = new MutationObserver(inspect)
    observer.observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-count']})
    addEventListener('click',event=>{if(event.isTrusted && (event.target as Element)?.closest('#perf-action'))sample('click')},true)
    addEventListener('message',event=>{
      if(event.source!==parent || typeof event.data?.visualizePerfProbe!=='string')return
      const inner=document.querySelector<HTMLIFrameElement>('iframe[data-visualize-content]')
      if(inner)inner.contentWindow?.postMessage(event.data,'*')
      else requestAnimationFrame(()=>requestAnimationFrame(()=>sample('probe',event.data.visualizePerfProbe)))
    })
    inspect()
  })
  await app.open('/e2e/visualize/performance.html')
  const samples: unknown[] = []
  const select = async (id:string,kind:'static'|'interactive',count:number,resourceMs:number,stateMs:number,retained=false) => {
    const entry=await browser.evaluate(async ({id,kind,count,resourceMs,stateMs})=>{
      await fetch('/__visualize_fixture/performance',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({resourceMs,stateMs})})
      const before=await fetch('/__visualize_fixture/performance').then(response=>response.json())
      const start=performance.timeOrigin+performance.now()
      const eventStart=(window as unknown as {visualizePerfEvents:unknown[]}).visualizePerfEvents.length
      ;(window as unknown as {selectVisualizePerf(value:unknown):void}).selectVisualizePerf({id,kind,count})
      return {start,eventStart,requestStart:before.requests.length}
    },{id,kind,count,resourceMs,stateMs})
    await expect(browser.locator('[data-perf-selection]')).toHaveAttribute('data-perf-selection',id)
    await expect.poll(()=>browser.evaluate(()=>document.querySelector('[data-testid="gen-ui-card"]')?.getAttribute('data-gen-ui-phase')??'missing')).toBe('ready')
    const observation=await browser.evaluate(async ({start,eventStart,requestStart,retained})=>{
      const frame=Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe[data-visualize-guest]')).find(frame=>frame.checkVisibility())
      if(!frame?.contentWindow)throw new Error('Visible frame missing')
      const events=(window as unknown as {visualizePerfEvents:{event:string;token?:string;duration?:number;at:number;frameId:string;button:{x:number;y:number}|null;kind:string;count:number}[]}).visualizePerfEvents
      const token=crypto.randomUUID()
      frame.contentWindow.postMessage({visualizePerfProbe:token},'*')
      const deadline=performance.now()+8000
      while(!events.slice(eventStart).some(event=>event.token===token)){
        if(performance.now()>deadline)throw new Error('No actual SVG measurement')
        await new Promise(requestAnimationFrame)
      }
      const probe=events.slice(eventStart).find(event=>event.token===token)!
      const paint=retained?probe:events.slice(eventStart).find(event=>event.event==='paint' && event.frameId===probe.frameId)??probe
      const rectangle=frame.getBoundingClientRect()
      const server=await fetch('/__visualize_fixture/performance').then(response=>response.json())
      const pageLabels=new Map<string,number>()
      return {paintMs:paint.at-start,readyMs:events.slice(eventStart).find(event=>event.event==='ready')!.at-start,initializations:events.slice(eventStart).filter(event=>event.event==='sdk-initialize').length,frameId:probe.frameId,kind:probe.kind,count:probe.count,resourceHashes:server.resourceHashes,
        button:probe.button?{x:rectangle.x+probe.button.x,y:rectangle.y+probe.button.y}:null,
        serverRequests:server.requests.slice(requestStart),
        longtasks:events.slice(eventStart).filter(event=>event.event==='longtask').map(event=>({at:event.at,duration:event.duration??0})),
        resources:performance.getEntriesByType('resource').filter(item=>item.startTime+performance.timeOrigin>=start && item.name.includes('/visualize/pages')).map(item=>{
          const value=item as PerformanceResourceTiming,url=new URL(value.name)
          const page=/\/pages\/([^/]+)/.exec(url.pathname)?.[1]
          if(page&&!pageLabels.has(page))pageLabels.set(page,pageLabels.size+1)
          return {name:url.searchParams.get('name')??url.pathname.split('/').at(-1)??'',page:page?(pageLabels.get(page)??null):null,start:value.startTime+performance.timeOrigin-start,end:value.responseEnd+performance.timeOrigin-start,bytes:value.transferSize}
        })}
    },{...entry,retained})
    let interaction:unknown=null
    if(observation.button){
      await browser.mouse.move(observation.button.x,observation.button.y);await browser.mouse.down();await browser.mouse.up()
      interaction=await browser.evaluate(async ({frameId,start,eventStart})=>{
        const events=(window as unknown as {visualizePerfEvents:{frameId:string;event:string;at:number;count:number}[]}).visualizePerfEvents
        const deadline=performance.now()+8000
        let click:typeof events[number]|undefined,result:typeof events[number]|undefined
        while(true){
          click=events.slice(eventStart).reverse().find(event=>event.frameId===frameId&&event.event==='click')
          result=events.slice(eventStart).reverse().find(event=>event.frameId===frameId&&event.event==='operation'&&event.at>=(click?.at??Infinity))
          if(click&&result)break
          if(performance.now()>deadline)throw new Error('Actual control did not save state')
          await new Promise(requestAnimationFrame)
        }
        return {fromOpenMs:result.at-start,operationMs:result.at-click.at,count:result.count}
      },{frameId:observation.frameId,start:entry.start,eventStart:entry.eventStart})
    }
    const sample={id,kind,count,resourceMs,stateMs,retained,observation,interaction}
    samples.push(sample)
    console.log('SAVED_VISUALIZE_SAMPLE',JSON.stringify(sample))
    return observation
  }
  if (!threeOnly) {
  for(const [resourceMs,stateMs] of [[0,0],[300,300]])for(const kind of ['static','interactive'] as const)for(const sample of [0,1]){
    await app.open(`/e2e/visualize/performance.html?case=${resourceMs}-${kind}-${sample}`)
    await select(`${resourceMs}-${kind}-${sample}`,kind,1,resourceMs,stateMs)
  }
  const original=await select('retained-original','interactive',1,300,300)
  await select('warm-new-page','interactive',1,300,300)
  const reopened=await select('retained-original','interactive',1,300,300,true)
  expect(reopened.frameId).toBe(original.frameId)
  expect(reopened.count).toBe(1)
  expect(reopened.resources.filter(resource=>resource.name==='pages'||resource.name.includes('.'))).toHaveLength(0)
  }
  await app.open('/e2e/visualize/performance.html?case=three-cold')
  await select('first-visible-of-three','interactive',3,300,300)
  const output=(process.env.E2E_VISUALIZE_377_BASELINE==='1'?'.e2e/377-before':'.e2e/377-after')+(threeOnly?'-three':'')
  await mkdir(output,{recursive:true})
  const environment=await browser.evaluate(()=>({userAgent:navigator.userAgent,dpr:devicePixelRatio,width:innerWidth,height:innerHeight}))
  await writeFile(`${output}/timings.json`,JSON.stringify({baseline:process.env.E2E_VISUALIZE_377_BASELINE==='1',baselineHost:'0d1271a0cf92b22e01b456c7473f4e446027bd28',candidateHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),environment,generation:'not measured',scope:'open already saved and delivered synthetic content',samples},null,2))
  await app.screenshot('saved-visualization-usable')
  if(process.env.E2E_VISUALIZE_377_BASELINE!=='1')for(const value of samples){
    const sample=value as {id:string;retained:boolean;observation:{paintMs:number;readyMs:number;initializations:number;resources:{name:string;bytes:number}[]};interaction:{fromOpenMs:number;operationMs:number}|null}
    const limits=sample.retained?[180,100,300]:sample.id==='first-visible-of-three'?[2400,2600,2800]:sample.id.startsWith('0-')?[900,950,1150]:sample.id.startsWith('300-')?[1950,2000,2200]:[850,850,1050]
    expect(sample.observation.paintMs).toBeLessThanOrEqual(limits[0]);expect(sample.observation.readyMs).toBeLessThanOrEqual(limits[1])
    if(sample.interaction){expect(sample.interaction.fromOpenMs).toBeLessThanOrEqual(limits[2]);expect(sample.interaction.operationMs).toBeLessThanOrEqual(100)}
    if(sample.retained||sample.id==='warm-new-page'||sample.id==='retained-original'){
      expect(sample.observation.resources.filter(resource=>resource.name.includes('.'))).toHaveLength(0)
      if(!sample.retained){expect(sample.observation.resources.filter(resource=>resource.name==='pages')).toHaveLength(1);expect(sample.observation.resources.filter(resource=>resource.name==='state')).toHaveLength(1)}
    }
    if(sample.id==='warm-new-page'){expect(sample.observation.paintMs).toBeLessThanOrEqual(1210.5*.75);expect(sample.observation.readyMs).toBeLessThanOrEqual(1192.8*.75)}
  }
})

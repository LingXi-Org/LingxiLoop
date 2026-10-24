import {test} from '@e2e-dev/web'
import {expect} from 'e2e'
import {writeFile} from 'node:fs/promises'
import {connectLiveCoverPage} from './live-cdp'

test('saved real cover: actual Worker pointer/touch lifecycle, history and reduced motion',async({app,browser,screen})=>{
 await browser.addInitScript(()=>{
  const NativeWorker=window.Worker
  const tracker={workers:[] as any[],events:[] as any[],frames:[] as any[]}
  ;(window as any).__coverVM=tracker
  // Instrumentation delegates construction/messages/termination to the actual
  // native Worker. No VM, asset, renderer or canvas output is replaced.
  window.Worker=class extends NativeWorker{
   constructor(url:string|URL,options?:WorkerOptions){
    super(url,options)
    if(options?.name!=='case-cover-vm')return
    const worker={id:tracker.workers.length,terminated:false};tracker.workers.push(worker)
    this.addEventListener('message',event=>{
     if(event.data?.type!=='frame'||typeof event.data.json!=='string')return
     const root=JSON.stringify(JSON.parse(event.data.json).root);let hash=2166136261
     for(let index=0;index<root.length;index++)hash=Math.imul(hash^root.charCodeAt(index),16777619)
     tracker.frames.push({worker:worker.id,requestId:event.data.requestId,hash:(hash>>>0).toString(16),at:performance.now()});if(tracker.frames.length>512)tracker.frames.shift()
    })
    const post=this.postMessage.bind(this) as (...args:any[])=>void
    this.postMessage=((message:any,...rest:any[])=>{tracker.events.push({worker:worker.id,type:message.type,event:message.event?.type??null,kind:message.event?.kind??null,pointerType:message.event?.pointerType??null,requestId:message.requestId??null,at:performance.now()});post(message,...rest)}) as Worker['postMessage']
    const terminate=this.terminate.bind(this);this.terminate=()=>{worker.terminated=true;terminate()}
   }
  }
 })
 await app.open('/scripts/case-cover-live-fixture.html')
 await expect(browser.locator('[data-live-cover]')).toHaveAttribute('data-status','ready')
 await expect.poll(()=>browser.evaluate(()=>{const image=document.querySelector('[data-case-cover] img') as HTMLImageElement|null;return Boolean(image?.complete&&image.naturalWidth>0)})).toBe(true)
 const statsBefore=await browser.evaluate(async()=>{const response=await fetch('/__cover-fixture/stats',{credentials:'include'});if(!response.ok)throw Error('stats failed '+response.status);return response.json()})
 const active=()=>browser.evaluate(()=>(window as any).__coverVM.workers.filter((worker:any)=>!worker.terminated).length as number)
 expect(await active()).toBe(0)
 const cdp=await connectLiveCoverPage(await browser.url())
 const boxes=()=>browser.evaluate(()=>{const rect=document.querySelector('[data-case-cover] > div')!.getBoundingClientRect();return{x:rect.x,y:rect.y,width:rect.width,height:rect.height}})
 const blob=()=>browser.evaluate(()=>document.querySelector('[data-case-cover] img[src^="blob:"]')?.getAttribute('src')??null)
 const hiddenObserved=false
 let elementHiddenObserved=false,pointerChanged=false
 try{
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false})
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]})
  console.log('COVER_ENV',JSON.stringify(await browser.evaluate(()=>({hover:matchMedia('(hover: hover)').matches,fine:matchMedia('(pointer: fine)').matches,visible:document.visibilityState,workers:(window as any).__coverVM.workers}))))
  const fineHover=await browser.evaluate(()=>matchMedia('(hover: hover) and (pointer: fine)').matches)
  const box=await boxes()
  if(fineHover)await browser.mouse.move(box.x+box.width/2,box.y+box.height/2)
  else await browser.locator('[data-case-cover] button').tap()
  console.log('COVER_STAGE explicit-or-hover-start',JSON.stringify({fineHover}))
  await expect.poll(active).toBe(1);await expect.poll(blob).not.toBe(null)
  console.log('COVER_STAGE real-worker-frame')
  await browser.evaluate(()=>new Promise<boolean>(resolve=>setTimeout(()=>resolve(true),180)))
  const before=await browser.evaluate(()=>(window as any).__coverVM.frames.at(-1).hash as string)
  for(const fraction of [.25,.4,.6,.75]){
   await browser.mouse.move(box.x+box.width*fraction,box.y+box.height*.5)
   await browser.mouse.down();await browser.mouse.up()
   await browser.evaluate(()=>new Promise<boolean>(resolve=>setTimeout(()=>resolve(true),100)))
   pointerChanged=await browser.evaluate(hash=>{const tracker=(window as any).__coverVM;return tracker.events.some((event:any)=>event.event==='pointer')&&tracker.frames.slice(-5).some((frame:any)=>frame.hash!==hash)},before)
   if(pointerChanged)break
  }
  expect(pointerChanged).toBe(true);console.log('COVER_STAGE actual-pointer-changed-root')
  await app.screenshot('376-real-saved-cover-pointer')
  if(!fineHover)await browser.locator('[data-case-cover] button').tap()
  await browser.mouse.move(0,0);await expect.poll(active).toBe(0);await expect.poll(blob).toBe(null)
  // Real touch dispatch through Chromium's input domain, not a fabricated DOM event.
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1})
  const control=await browser.evaluate(()=>{const rect=document.querySelector('[data-case-cover] button')!.getBoundingClientRect();return{x:rect.x+rect.width/2,y:rect.y+rect.height/2}})
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:control.x,y:control.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  await expect.poll(active).toBe(1);await expect.poll(blob).not.toBe(null)
  const touchBox=await boxes()
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchBox.x+touchBox.width*.4,y:touchBox.y+touchBox.height*.5}]})
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchBox.x+touchBox.width*.6,y:touchBox.y+touchBox.height*.5}]})
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  await expect.poll(()=>browser.evaluate(()=>(window as any).__coverVM.events.some((event:any)=>event.event==='pointer'&&event.pointerType==='touch'))).toBe(true)
  // This shared headless CDP browser keeps background tabs visible. Test real
  // element visibility through IntersectionObserver; do not fake document.hidden.
  await screen.getByRole('button','切换封面可见性').tap()
  await expect.poll(active).toBe(0);elementHiddenObserved=true
  await screen.getByRole('button','切换封面可见性').tap()
  await screen.getByRole('button','切换呈现范围').tap();await expect.poll(active).toBe(0)
  await screen.getByRole('button','重新打开历史封面').tap();await expect(browser.locator('[data-case-cover]')).toHaveCount(0)
  await screen.getByRole('button','重新打开历史封面').tap();await expect(browser.locator('[data-live-cover]')).toHaveAttribute('data-status','ready')
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
  for(const width of [300,400]){
   await browser.setViewport({width,height:900})
   await expect.poll(active).toBe(0);await expect(browser.locator('[data-case-cover] button')).toHaveCount(0)
   await expect.poll(()=>browser.evaluate(()=>{const image=document.querySelector('[data-case-cover] img') as HTMLImageElement;return image.complete&&image.naturalWidth>0&&image.getBoundingClientRect().right<=innerWidth})).toBe(true)
   await app.screenshot(`376-real-cover-reduced-motion-${width}`)
  }
  const statsAfter=await browser.evaluate(async()=>{const response=await fetch('/__cover-fixture/stats',{credentials:'include'});if(!response.ok)throw Error('stats failed '+response.status);return response.json()})
  expect(statsAfter).toEqual(statsBefore)
  const evidence=await browser.evaluate(()=>({environment:{userAgent:navigator.userAgent,width:innerWidth,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches},workers:(window as any).__coverVM.workers,events:(window as any).__coverVM.events,frames:(window as any).__coverVM.frames.slice(-40)}))
  await writeFile('/tmp/376-live-browser-receipt.json',JSON.stringify({statsBefore,statsAfter,pointerChanged,hiddenObserved,elementHiddenObserved,fineHover,...evidence},null,2))
 }finally{const diagnostic=await browser.evaluate(()=>({workers:(window as any).__coverVM.workers,events:(window as any).__coverVM.events,frames:(window as any).__coverVM.frames.slice(-5),hover:matchMedia('(hover: hover)').matches,fine:matchMedia('(pointer: fine)').matches,visibility:document.visibilityState}));console.log('COVER_FINAL',JSON.stringify({...diagnostic,events:diagnostic.events.slice(-8)}));await writeFile('/tmp/376-live-browser-diagnostic.json',JSON.stringify(diagnostic,null,2));await cdp.send('Emulation.setEmulatedMedia',{features:[]}).catch(()=>{});await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false}).catch(()=>{});await cdp.foreground().catch(()=>{});await cdp.close()}
})

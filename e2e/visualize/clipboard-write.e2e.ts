import {createHash} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {test} from '@e2e-dev/web'
import {expect} from 'e2e'

// OS readback is unavailable in this environment. Observe the original native
// write promise without granting permissions or changing its arguments/result.
test('copy-image native write fulfills and supplies a real PNG',{timeout:180000},async({app,browser,screen})=>{
  await browser.addInitScript(()=>{
    type Observation={status:string;calls:number;error?:string;type?:string;size?:number;width?:number;height?:number;png?:number[]}
    const state:Observation={status:'not-called',calls:0}
    ;(window as unknown as {__clipboardWriteObservation:Observation}).__clipboardWriteObservation=state
    const nativeWrite=navigator.clipboard.write.bind(navigator.clipboard)
    navigator.clipboard.write=(items)=>{
      state.calls++;state.status='pending'
      const originalPromise=nativeWrite(items)
      void originalPromise.then(async()=>{
        state.status='native-fulfilled'
        try{
          const item=items.find(value=>value.types.includes('image/png'))
          if(!item)throw new Error('Native write fulfilled without a PNG item')
          const blob=await item.getType('image/png'),bitmap=await createImageBitmap(blob)
          Object.assign(state,{status:'observed',type:blob.type,size:blob.size,width:bitmap.width,height:bitmap.height,png:Array.from(new Uint8Array(await blob.arrayBuffer()))})
          bitmap.close()
        }catch(error){state.status='observation-failed';state.error=String(error)}
      },error=>{state.status='native-rejected';state.error=String(error)})
      // Return the exact native promise, including its original rejection.
      return originalPromise
    }
  })
  await app.open('/e2e/visualize/index.html?implementation=product&theme=light')
  await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase','ready')
  await screen.getByRole('button','复制图像',{exact:true}).tap({timeout:90000})
  await expect.poll(()=>browser.evaluate(()=>['observed','native-rejected','observation-failed'].includes((window as unknown as {__clipboardWriteObservation:{status:string}}).__clipboardWriteObservation.status))).toBe(true)
  await expect(screen.getByRole('button','复制图像',{exact:true})).toBeEnabled()
  const observation=await browser.evaluate(()=>(window as unknown as {__clipboardWriteObservation:{status:string;calls:number;error?:string;type?:string;size?:number;width?:number;height?:number;png?:number[]}}).__clipboardWriteObservation)
  const {png,...metadata}=observation,output=process.env.E2E_VISUALIZE_OUTPUT??'.e2e/visualize-write'
  await mkdir(output,{recursive:true})
  const bytes=png?Buffer.from(png):null
  if(bytes)await writeFile(`${output}/clipboard-native-write.png`,bytes)
  await writeFile(`${output}/clipboard-write-interaction.json`,JSON.stringify({...metadata,sha256:bytes?createHash('sha256').update(bytes).digest('hex'):null,nativeWrite:observation.status==='observed',nativeReadback:false,observation:'PNG bytes from the original ClipboardItem, only after the native write promise fulfilled; no OS readback'},null,2))
  expect(observation.status).toBe('observed')
  expect(observation.calls).toBe(1)
  expect(observation.type).toBe('image/png')
  expect(observation.size??0).toBeGreaterThan(100)
  expect(observation.width??0).toBeGreaterThan(100)
  expect(observation.height??0).toBeGreaterThan(100)
  await app.screenshot('product-copy-image-native-write')
})

const visible=element=>{
  const r=element.getBoundingClientRect()
  return r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight&&element.checkVisibility({opacityProperty:true,visibilityProperty:true})
}
const contentState=(scope=document)=>{
  const images=[...scope.querySelectorAll('img')]
  return {heading:[...scope.querySelectorAll('h1,[role=heading]')].some(element=>/^LingxiLoop\s+\d+$/.test(element.textContent.trim())),images:images.length,decoded:images.length>0&&images.every(image=>image.complete&&image.naturalWidth>0),fonts:(scope.ownerDocument??scope).fonts.status==='loaded'}
}

/** Only visible fixture surfaces matter; outer labels cannot prove inner paint. */
export async function waitForReferenceVisualDocument(page,kind,{timeout=60000}={}){
  if(kind==='slides')await page.getByText('LingxiLoop 1',{exact:true}).first().waitFor({timeout})
  else await page.getByRole('button',{name:'Open artboard Page 1 full window',exact:true}).waitFor({timeout})
  const deadline=Date.now()+timeout
  let states=[]
  while(Date.now()<deadline){
    states=[]
    if(kind==='design'){
      for(const board of await page.locator('[data-mega-artboard]').all()){
        try{
          if(!await board.evaluate(visible))continue
          const element=await board.locator('iframe').first().elementHandle(),frame=await element?.contentFrame()
          states.push(frame?await frame.evaluate(contentState):{heading:false,decoded:false,fonts:false})
        }catch{states.push({heading:false,decoded:false,fonts:false})}
      }
    }else{
      for(const surface of await page.locator('[data-slide-surface]').all()){
        if(await surface.evaluate(visible))states.push(await surface.evaluate(contentState))
      }
    }
    if(states.length>0&&states.every(state=>state.heading&&state.decoded&&state.fonts)){
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
      return {visibleSurfaces:states.length,headingsPainted:true,imagesDecoded:true,fontsReady:true}
    }
    await page.waitForTimeout(25)
  }
  throw new Error(`参考文档仍在加载，不能截屏：${JSON.stringify({kind,states})}`)
}

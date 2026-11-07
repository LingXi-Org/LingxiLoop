/** Focused screenshot-readiness regression; no product credentials or source package. */
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {pathToFileURL} from 'node:url'
import {waitForReferenceVisualDocument} from './native-editor-reference-ready.mjs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright')
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZV0AAAAASUVORK5CYII=','base64')
const server=createServer((request,response)=>{
  if(request.url==='/image.png'){setTimeout(()=>{response.writeHead(200,{'content-type':'image/png'});response.end(image)},200);return}
  response.writeHead(200,{'content-type':'text/html;charset=utf-8'})
  if(request.url==='/frame')response.end('<html><body>Loading…<script>setTimeout(()=>{document.body.innerHTML=\'<h1>LingxiLoop 1</h1><img src="/image.png">\'},100)</script></body></html>')
  else if(request.url==='/slides')response.end('<html><body><span>LingxiLoop 1</span><div data-slide-surface>Loading…</div><script>setTimeout(()=>{document.querySelector("[data-slide-surface]").innerHTML=\'<div role="heading" aria-level="1">LingxiLoop 1</div><img src="/image.png">\'},100)</script></body></html>')
  else response.end('<html><body><button aria-label="Open artboard Page 1 full window">打开画板</button><div data-mega-artboard style="position:absolute;left:0;top:40px;width:500px;height:220px"><iframe src="/frame" style="width:500px;height:220px"></iframe></div><div data-mega-artboard id="late" style="position:absolute;left:0;top:280px;width:500px;height:220px">加载中</div><div data-mega-artboard style="position:absolute;left:3000px;width:500px;height:300px"><iframe srcdoc="Loading…"></iframe></div><script>setTimeout(()=>{document.querySelector("#late").innerHTML=\'<iframe src="/frame" style="width:500px;height:220px"></iframe>\'},450)</script></body></html>')
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']})
try{
  for(const kind of ['design','slides']){
    const page=await browser.newPage({viewport:{width:800,height:600}})
    try{
      await page.goto(origin+(kind==='slides'?'/slides':'/'),{waitUntil:'domcontentloaded'})
      const proof=await waitForReferenceVisualDocument(page,kind)
      const value=kind==='design'?await page.frames().find(frame=>frame.url().endsWith('/frame')).evaluate(()=>({headings:document.querySelectorAll('h1').length,decoded:[...document.images].every(image=>image.complete&&image.naturalWidth>0)})):await page.locator('[data-slide-surface]').evaluate(element=>({headings:element.querySelectorAll('[role=heading]').length,decoded:[...element.querySelectorAll('img')].every(image=>image.complete&&image.naturalWidth>0)}))
      assert.equal(value.headings,1,'参考画布内部的标题还未绘制，不能截屏')
      assert.equal(value.decoded,true,'参考图片还未解码，不能截屏')
      assert.equal(proof.visibleSurfaces,kind==='design'?2:1,'可见画板的iframe尚未创建，不能只等待首个已挂载画板')
      console.log(JSON.stringify({kind,visibleSurfaces:proof.visibleSurfaces,innerHeadingPainted:true,imagesDecoded:true,lateIframeWaited:kind==='design',offscreenPlaceholderIgnored:kind==='design'}))
    }finally{await page.close()}
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}

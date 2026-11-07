/** Actual long-task observation, filtering and public-evidence validation. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { publicEvidence } from './native-artifact-ci.mjs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright')
const script=await readFile(new URL('./native-artifact-startup-probe.js',import.meta.url),'utf8')
const server=createServer((_request,response)=>{response.writeHead(200,{'content-type':'text/html;charset=utf-8'});response.end('<!doctype html><title>不应进入记录的文档名</title>')})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']})
try{
  const context=await browser.newContext()
  await context.addInitScript({content:script})
  const page=await context.newPage()
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  const since=await page.evaluate(()=>performance.timeOrigin+performance.now())
  await page.evaluate(async()=>{
    for(let index=0;index<3;index++){
      await new Promise(resolve=>setTimeout(resolve,25))
      const start=performance.now();while(performance.now()-start<70){}
    }
    await new Promise(resolve=>setTimeout(resolve,25))
  })
  const result=await page.evaluate(since=>window.__nativeArtifactStartup(since,performance.timeOrigin+performance.now()),since)
  assert.equal(result.supported,true)
  assert.ok(result.longTasks.length>=3)
  assert.ok(result.longTasks.every(row=>row.startEpochMs>=since&&row.durationMs>=50))
  assert.equal(result.truncated,false)
  assert.deepEqual(publicEvidence({startupTimeline:result}),{startupTimeline:result})
  assert.ok(!JSON.stringify(result).includes('不应进入记录'))
  await page.evaluate(()=>{const start=performance.now();while(performance.now()-start<70){} })
  await page.waitForTimeout(25)
  const stopped=await page.evaluate(()=>window.__nativeArtifactStartup(0,Date.now()))
  assert.deepEqual(stopped.longTasks,[],'可编辑后必须停止观察并释放记录，不能把遍历工作混入启动')
  await page.reload()
  const after=await page.evaluate(()=>performance.timeOrigin+performance.now())
  const filtered=await page.evaluate(after=>window.__nativeArtifactStartup(after,after+1),after)
  assert.deepEqual(filtered.longTasks,[],'工作区打开前的任务不能进入本次打开窗口')
  await page.reload()
  const overflow=await page.evaluate(async()=>{
    for(let index=0;index<258;index++){
      await new Promise(resolve=>setTimeout(resolve,0))
      const start=performance.now();while(performance.now()-start<52){}
    }
    await new Promise(resolve=>setTimeout(resolve,25))
    return window.__nativeArtifactStartup(0,Date.now())
  })
  assert.equal(overflow.longTasks.length,256)
  assert.ok(overflow.dropped>=2&&overflow.truncated)
  console.log(JSON.stringify({overflowMeasured:true,boundedRows:overflow.longTasks.length,mainThreadLongTasks:result.longTasks.length,numericEvidenceOnly:true,stoppedAtEditable:true,preOpenFiltered:true,boundedLimit:256,scope:'只验证测量探针；不代表产品启动、内存或性能门槛通过'}))
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}

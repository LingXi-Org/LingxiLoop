import {env} from 'cloudflare:test'
import {expect,it} from 'vitest'
import api from './index'
import type {ReleaseEnv} from './types'
const bindings=env as unknown as ReleaseEnv
const hex=async(bytes:Uint8Array)=>'sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer)),b=>b.toString(16).padStart(2,'0')).join('')
const item=async(name:string,bytes:Uint8Array)=>({key:`chunks/assets/${name}-aaaaaaaa.js`,sha256:await hex(bytes),size:bytes.length,contentType:'text/javascript'})
const request=(method:string,items:unknown[],body?:Uint8Array,token=bindings.RELEASE_API_TOKEN)=>new Request('https://release.test/v1/retained-assets',{method,headers:{authorization:'Bearer '+token,'content-type':method==='PUT'?'application/octet-stream':'application/json',...(method==='PUT'?{'x-lingxi-retained-inventory':JSON.stringify(items)}:{})},body:method==='PUT'?new Uint8Array(body!).buffer:JSON.stringify(items)})
it('batch reuses legacy assets by SHA256, commits only missing bytes and enforces publisher role',async()=>{
 const bytes=new TextEncoder().encode('retained'),a=await item('legacy',bytes),b=await item('fresh',bytes)
 await bindings.ARTIFACTS.put(a.key,bytes);await bindings.ARTIFACTS.delete(b.key)
 let response=await api.fetch(request('POST',[a,b]),bindings)
 expect(response.status).toBe(200);expect((await response.json() as {results:{present:boolean}[]}).results.map(r=>r.present)).toEqual([true,false])
 response=await api.fetch(request('PUT',[b],bytes),bindings);expect(response.status).toBe(200)
 expect((await bindings.ARTIFACTS.head(b.key))?.checksums.sha256).toBeTruthy()
 response=await api.fetch(request('PUT',[b],bytes),bindings);expect((await response.json() as {results:{reused:boolean}[]}).results[0].reused).toBe(true)
 expect((await api.fetch(request('POST',[a],undefined,bindings.EXECUTOR_TOKEN),bindings)).status).toBe(401)
 expect((await api.fetch(request('POST',[a],undefined,''),bindings)).status).toBe(401)
})
it('batch refuses oversize, foreign keys, byte drift and immutable collisions',async()=>{
 const bytes=new TextEncoder().encode('fixed'),a=await item('bounded',bytes)
 await bindings.ARTIFACTS.delete(a.key)
 expect((await api.fetch(request('POST',Array.from({length:9},(_,i)=>({...a,key:`chunks/assets/a${i}-aaaaaaaa.js`}))),bindings)).status).toBe(400)
 for(const changed of [{key:'backups/private'},{size:256*1024+1},{key:'chunks/assets/../a-aaaaaaaa.js'}])expect((await api.fetch(request('POST',[{...a,...changed}]),bindings)).status).toBeGreaterThanOrEqual(400)
 expect((await api.fetch(request('PUT',[a],new Uint8Array(bytes.length)),bindings)).status).toBeGreaterThanOrEqual(400)
 expect(await bindings.ARTIFACTS.head(a.key)).toBeNull()
 await bindings.ARTIFACTS.put(a.key,new TextEncoder().encode('other'))
 expect((await api.fetch(request('POST',[a]),bindings)).status).toBe(409)
 const preserved=await bindings.ARTIFACTS.get(a.key)
 expect(await preserved!.text()).toBe('other')
})

import {env} from 'cloudflare:test'
import {expect,it} from 'vitest'
import api from './index'
import type {ReleaseEnv} from './types'
const bindings=env as unknown as ReleaseEnv
it('retired image publication cannot write while historical bytes remain privately readable',async()=>{
 const bytes=new TextEncoder().encode('historical-image-part'),sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join(''),key=`artifact-blobs/sha256/${sha}`
 await bindings.ARTIFACTS.put(key,bytes,{sha256:sha,customMetadata:{sha256:sha}})
 const request=(method:string,token:string)=>new Request(`https://release.test/v1/artifact-blobs/${sha}`,{method,headers:{authorization:`Bearer ${token}`}})
 expect((await api.fetch(request('PUT',bindings.RELEASE_API_TOKEN),bindings)).status).toBe(405)
 expect((await api.fetch(request('PUT',bindings.RELEASE_ADMIN_TOKEN),bindings)).status).toBe(405)
 expect((await api.fetch(request('GET',bindings.RELEASE_API_TOKEN),bindings)).status).toBe(403)
 expect((await api.fetch(request('HEAD',''),bindings)).status).toBe(401)
 const response=await api.fetch(request('GET',bindings.EXECUTOR_TOKEN),bindings)
 expect(response.status).toBe(200);expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
 expect((await bindings.ARTIFACTS.head(key))?.size).toBe(bytes.length)
})

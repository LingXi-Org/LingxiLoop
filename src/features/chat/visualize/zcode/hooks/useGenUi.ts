import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { acquireGenUiPage, type GenUiCardTarget, type RetainedGenUiPage } from '../gen-ui/host'
import { createWebServices, webPlatform, watchWebTaskRemoved } from '../../web/host'
import { registerAuthTeardown } from '@/stores/authTeardown'
import { useAuth } from '@/stores/auth'
import { onSandboxPageRemoved } from '../plugin-ui/adapters/sandboxPageOwners'
import { registerGenUiActions, sandboxPages } from '../plugin-ui/hostPrimitives'
const services = new Map<string, ReturnType<typeof createWebServices>>()
const watched = new Set<string>()
const clear = () => {sandboxPages.clear();services.clear();watched.clear()}
registerAuthTeardown(clear)
window.addEventListener('lingxiloop-workspace-changed',clear)
useAuth.subscribe((next,previous)=>{if(next.user?.id!==previous.user?.id||next.activeCompanyId!==previous.activeCompanyId)clear()})
export function useGenUi(target: GenUiCardTarget, confirm: (prompt:string)=>Promise<string|null>, retry:number) {
  const [online,setOnline] = useState(navigator.onLine)
  const [result,setResult] = useState<{key:string;page:RetainedGenUiPage|null;error?:string}>({key:'',page:null})
  const targetRef = useRef(target); targetRef.current = target
  const key = JSON.stringify(target)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online',update);window.addEventListener('offline',update)
    return () => {window.removeEventListener('online',update);window.removeEventListener('offline',update)}
  },[])
  useEffect(() => {
    if (!online) return
    let cancelled = false
    const current = targetRef.current
    const web = services.get(key) ?? createWebServices(current)
    services.set(key,web)
    const offActions = registerGenUiActions(current,{sendFollowUp: ({prompt})=>web.sendFollowUp(prompt)})
    void acquireGenUiPage({target:current,platform:webPlatform,state:web.service,files:web.service,openExternal:web.openExternal,watchTaskRemoved:(run)=>watchWebTaskRemoved(current,run)}).then(page=>{
      if(!watched.has(page.key)) {
        watched.add(page.key)
        const off=onSandboxPageRemoved(page.key,()=>{services.delete(key);watched.delete(page.key);off()})
      }
      if(cancelled) return
      if(retry && page.getSnapshot().phase==='error') page.retry()
      setResult({key,page})
    }, error=>{if(!cancelled)setResult({key,page:null,error:String(error)})})
    return () => {cancelled=true;offActions()}
  },[key,online,retry])
  const page = online && result.key===key ? result.page : null
  useLayoutEffect(()=>page?.attachConfirmation(confirm),[page,confirm])
  return {page,error:result.key===key ? result.error : undefined,supported:typeof Element.prototype.moveBefore==='function',online}
}

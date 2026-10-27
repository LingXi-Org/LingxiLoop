import { visualizeResourceUrl } from '../../../../../shared/visualize-public-resources'
import { http } from '@/api/core/http'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import { getActiveCompanyId, useAuth } from '@/stores/auth'
import type { GenUiCardTarget } from '../zcode/gen-ui/contract'
import { genUiWidgetStateSchema, type GenUiStateChange, type GenUiWidgetState } from '../zcode/shared/gen-ui'
import type { IGenUiService, PluginSandboxHandle, PluginSandboxPlatformPort } from './contracts'
import { buildWebDocument, buildWebShell } from './document'
import { lingxiApiFetch } from '@/api/transport'
import { readWebResource } from './resource'
import { createPublicResourceCache } from './public-resource-cache'

const publicResources = createPublicResourceCache()

type Page = PluginSandboxHandle & {
  target: GenUiCardTarget; html: string; state: GenUiWidgetState | null; frame?: HTMLIFrameElement
  privatePort?: MessagePort; rpcPort?: MessagePort; gestureAt: number; gestureToken?: string
  active: boolean; disposed: boolean; loadCount: number; revision: number; userId: string | null
  captures: Map<string, {width:number;height:number;resolve(blob: Blob): void; reject(reason: Error): void; timer: ReturnType<typeof setTimeout>}>
}
const pages = new Map<string, Page>()
const ports = new Set<(event: {sandboxId: string; initId: string; port: MessagePort}) => void>()
const stateListeners = new Set<(change: GenUiStateChange) => void>()
const path = (target: GenUiCardTarget) => `/im/channels/${encodeURIComponent(target.sessionId)}/visualize`
const pagePath = (page: Page) => `${path(page.target)}/pages/${encodeURIComponent(page.sandboxId)}`
const headers = (page: Page) => ({'x-visualize-page-token': page.initId,'x-company-id':page.target.workspaceIdentity ?? '', 'x-project-id':page.target.workspacePath})
type StateResponse = {state: GenUiWidgetState | null; revision: number}
const pendingRevocations = new Map<string,Page>()
const revoking = new Set<string>()
async function revoke(page: Page) {
  if (revoking.has(page.sandboxId)) return
  revoking.add(page.sandboxId)
  try {
    await http(pagePath(page), {method:'DELETE',headers:headers(page),signal:AbortSignal.timeout(2000)})
    pendingRevocations.delete(page.sandboxId)
  } catch { /* Retain the capability for the existing scoped background retry. */ }
  finally { revoking.delete(page.sandboxId) }
}
const removed = new Map<string,Set<()=>void>>()
const invalidations = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('lingxiloop-visualize-state')
const stateScope = (page:Page) => JSON.stringify([page.userId,page.target.workspaceIdentity,page.target.workspacePath,page.target.sessionId])
const taskKey = (target:GenUiCardTarget) => JSON.stringify([target.workspaceIdentity,target.workspacePath,target.sessionId])
export function watchWebTaskRemoved(target:GenUiCardTarget, listener:()=>void) {
  const key=taskKey(target), listeners=removed.get(key) ?? new Set<()=>void>()
  listeners.add(listener);removed.set(key,listeners)
  return ()=>{listeners.delete(listener);if(!listeners.size)removed.delete(key)}
}
function projectState(page:Page,response:StateResponse) {
  if(!Number.isSafeInteger(response.revision)||response.revision<0) throw new Error('Invalid state revision')
  const state=response.state===null ? null : genUiWidgetStateSchema.parse(response.state)
  const peers=[...pages.values()].filter(candidate=>!candidate.disposed&&stateScope(candidate)===stateScope(page)&&candidate.target.path===page.target.path)
  const newer = peers.filter(candidate=>candidate.revision>response.revision).sort((a,b)=>b.revision-a.revision)[0]
  if(newer) {projectState(page,{state:newer.state,revision:newer.revision});return}
  let changed=false
  for(const peer of peers) if(response.revision>peer.revision) {peer.state=state;peer.revision=response.revision;changed=true}
  if(changed) for(const listener of stateListeners) listener({target:page.target,state})
}
async function refreshState(page:Page,active=true,signal?:AbortSignal) {
  current(page,active)
  const response=await http<StateResponse>(`${pagePath(page)}/state`,{headers:headers(page),signal})
  current(page,active);projectState(page,response)
}
const refreshing=new Set<string>()
async function refreshVisible() {
  for(const page of pages.values()) {
    if(!page.active||refreshing.has(page.sandboxId))continue
    refreshing.add(page.sandboxId)
    void refreshState(page).catch(error=>{
      if(/\((403|404)\)/.test(String(error))) for(const listener of removed.get(taskKey(page.target))??[]) listener()
      else if(/\(410\)/.test(String(error))) stopStalePage(page)
    }).finally(()=>refreshing.delete(page.sandboxId))
  }
  for(const page of pendingRevocations.values()) {
    if(page.userId!==(useAuth.getState().user?.id ?? null)||page.target.workspaceIdentity!==getActiveCompanyId()) {pendingRevocations.delete(page.sandboxId);continue}
    void revoke(page)
  }
}
invalidations?.addEventListener('message',event=>{
  if(typeof event.data?.scope!=='string'||typeof event.data?.path!=='string')return
  for(const page of pages.values()) if(page.active&&stateScope(page)===event.data.scope&&page.target.path===event.data.path)void refreshState(page).catch(()=>undefined)
})
window.addEventListener('focus',()=>void refreshVisible())
window.addEventListener('online',()=>void refreshVisible())
setInterval(()=>{if(document.visibilityState==='visible')void refreshVisible()},10000)
function stopStalePage(page:Page) {
  page.active=false
  if(page.frame) {page.frame.style.visibility='hidden';page.frame.dispatchEvent(new Event('render-process-gone'))}
  void webPlatform.disposeSandbox(page.sandboxId,page.initId)
}
function current(page: Page, active = true) {
  const workspace = getWorkspaceSession()
  if (page.disposed || !pages.has(page.sandboxId) || active && (!page.active || !page.frame?.isConnected || document.visibilityState === 'hidden')
    || page.userId !== (useAuth.getState().user?.id ?? null) || page.target.workspaceIdentity !== getActiveCompanyId() || page.target.workspacePath !== workspace?.projectId || workspace?.companyId !== page.target.workspaceIdentity) throw new Error('This interactive view is no longer active')
}
async function validate(page: Page, active = true) {
  current(page, active)
  await http(`${pagePath(page)}/validate`, {headers: headers(page)})
  current(page, active)
}
async function gesture(page: Page, host = false) {
  current(page)
  if (host ? !navigator.userActivation?.isActive : performance.now() - page.gestureAt > 5000) return false
  page.gestureAt = -Infinity
  const result = await http<{gestureToken: string}>(`${pagePath(page)}/gesture`, {method:'POST', headers:headers(page), body:'{}'})
  current(page)
  page.gestureToken = result.gestureToken
  return true
}
async function openExternalForPage(page: Page, href: string) {
  current(page)
  if (!/^https?:\/\//i.test(href) || !page.gestureToken) throw new Error('External links require a user gesture')
  const opened = window.open('about:blank','_blank')
  if (!opened) throw new Error('The browser blocked the new tab. Allow pop-ups and try again.')
  opened.opener = null
  const referrer = opened.document.createElement('meta')
  referrer.name = 'referrer'; referrer.content = 'no-referrer';opened.document.head.append(referrer)
  const gestureToken = page.gestureToken; page.gestureToken = undefined
  try {
    const result = await http<{href: string}>(`${pagePath(page)}/open-external`, {method:'POST',headers:headers(page),body:JSON.stringify({href,gestureToken})})
    current(page)
    const url = new URL(result.href)
    if (!['https:','http:'].includes(url.protocol)) throw new Error('Invalid external URL')
    opened.location.replace(url.href)
  } catch(error) {opened.close();throw error}

}
window.addEventListener('message', event => {
  const page = [...pages.values()].find(page => page.frame?.contentWindow === event.source)
  if (!page || page.disposed || event.origin !== 'null') return
  if (event.data?.type === 'lingxi-visualize-crash') {stopStalePage(page);return}
  if (event.data?.type === 'lingxi-visualize-private') {
    if (page.privatePort || event.ports.length !== 1) return
    const port = event.ports[0]; page.privatePort = port
    port.onmessage = async ({data}) => {
      if (page.disposed) return
      if (data?.type === 'gesture') { if (page.active) page.gestureAt = performance.now(); return }
      if (data?.type !== 'capture' || typeof data.id !== 'string') return
      const pending = page.captures.get(data.id)
      if (!pending) return
      page.captures.delete(data.id); clearTimeout(pending.timer)
      try { current(page) } catch(error) { pending.reject(error as Error); return }
      if (!(data.blob instanceof Blob) || data.blob.type !== 'image/png' || data.blob.size > 20_000_000) pending.reject(new Error(typeof data.error === 'string' ? data.error : 'Invalid image capture'))
      else {
        try {
          const bytes=new Uint8Array(await data.blob.slice(0,24).arrayBuffer())
          const signature=[137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]
          if(bytes.length!==24||signature.some((value,index)=>bytes[index]!==value))throw new Error('Invalid PNG image')
          const view=new DataView(bytes.buffer),width=view.getUint32(16),height=view.getUint32(20)
          if(width!==pending.width||height!==pending.height||width<1||height<1||width*height>16_000_000)throw new Error('Image dimensions exceed the capture limit')
          await validate(page)
          current(page);pending.resolve(data.blob)
        } catch(error) {pending.reject(error instanceof Error ? error : new Error('Invalid image capture'))}
      }
    }
    port.start()
    return
  }
  // Only the bound opaque frame may send MCP frames; the SDK validates all method schemas.
  if (event.data?.jsonrpc === '2.0') page.rpcPort?.postMessage(event.data)
})

export function mountWebSandbox(frame: HTMLIFrameElement, handle: PluginSandboxHandle) {
  const page = pages.get(handle.sandboxId)
  if (!page || page.initId !== handle.initId || page.frame) throw new Error('Unknown sandbox instance')
  page.frame = frame
  const channel = new MessageChannel()
  page.rpcPort = channel.port1
  channel.port1.onmessage = event => { if (!page.disposed) frame.contentWindow?.postMessage(event.data, '*') }
  channel.port1.start()
  for (const listener of ports) listener({sandboxId:page.sandboxId, initId:page.initId, port:channel.port2})
  frame.addEventListener('load', () => {
    if (++page.loadCount > 1) stopStalePage(page)
  })
  frame.srcdoc = buildWebShell(page.html)
}
export function setWebSandboxVisibility(id: string, visible: boolean) {
  const page = pages.get(id); if (page) { page.active = visible; if (!visible) page.gestureAt = -Infinity }
}
export const webPlatform: PluginSandboxPlatformPort = {
  getOwnerWebContentsId: async () => 0,
  onPorts(listener) { ports.add(listener); return () => { ports.delete(listener) } },
  async consumeUserGesture(id) { const page = pages.get(id); return page ? gesture(page) : false },
  async consumeHostUserGesture(id) { const page = pages.get(id); return page ? gesture(page,true) : false },
  async disposeSandbox(id, initId) {
    const page = pages.get(id)
    if (!page || page.initId !== initId) return
    page.disposed = true; pages.delete(id); page.privatePort?.close(); page.rpcPort?.close()
    for (const pending of page.captures.values()) {clearTimeout(pending.timer); pending.reject(new Error('Interactive view closed'))}
    page.captures.clear()
    page.frame?.removeAttribute('srcdoc')
    page.frame = undefined; page.privatePort = undefined; page.rpcPort = undefined
    page.html = ''; page.state = null
    pendingRevocations.set(page.sandboxId,page)
    // Local release/retry never waits for remote cleanup. Failed or uncertain
    // revocation stays queued; each network attempt is bounded and deduplicated.
    void revoke(page)
  },
  copyImage(input) {
    const page = pages.get(input.sandboxId)
    if (!page || page.initId !== input.initId || !page.privatePort) return Promise.reject(new Error('Image capture is unavailable'))
    current(page)
    if (!navigator.userActivation?.isActive || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return Promise.reject(new Error('Image clipboard requires a supported browser and a user gesture'))
    const id = crypto.randomUUID()
    const png = new Promise<Blob>((resolve,reject) => {
      const timer = setTimeout(() => {page.captures.delete(id); reject(new Error('Image capture timed out'))}, 15000)
      page.captures.set(id,{resolve,reject,timer,width:Math.round(input.captureRect.width*window.devicePixelRatio),height:Math.round(input.captureRect.height*window.devicePixelRatio)})
      page.privatePort!.postMessage({type:'capture', id, rect:input.captureRect, pixelRatio:window.devicePixelRatio})
    })
    return navigator.clipboard.write([new ClipboardItem({'image/png':png})])
  },
}
export function createWebServices(target: GenUiCardTarget): {service: IGenUiService; openExternal(url: string): Promise<void>; sendFollowUp(prompt: string): Promise<void>} {
  const ownerUserId = useAuth.getState().user?.id ?? null
  const assertScope = () => {const workspace=getWorkspaceSession();if(ownerUserId!==(useAuth.getState().user?.id ?? null)||target.workspaceIdentity!==getActiveCompanyId()||target.workspacePath!==workspace?.projectId||target.workspaceIdentity!==workspace?.companyId)throw new Error("Interactive view session changed")}
  let active: Page | undefined
  let preparedState: Page | undefined
  let pendingFollowUp: {prompt:string;idempotencyKey:string} | undefined
  const requirePage = () => { if (!active) throw new Error('Interactive view is not ready'); current(active,false); return active }
  const service: IGenUiService = {
    async readDocument() { return {path:target.path,html:''} },
    async prepareSandbox(_input, signal, onProgress) {
      assertScope()
      signal?.throwIfAborted()
      // Retention uses target.instanceKey; acquisition uses an attempt identity.
      // An aborted POST can still commit remotely after a successful retry.
      // Its late transaction must not revoke that newer page as a replacement.
      const instanceKey = crypto.randomUUID()
      onProgress?.({stage:'page'})
      const result = await http<{pageId:string;initId:string;html:string;state:GenUiWidgetState|null;stateRevision:number;path:string;resourceHashes?:Record<string,string>}>(`${path(target)}/pages`, {method:'POST',signal,body:JSON.stringify({path:target.path,sourceMessageId:target.sourceMessageId,instanceKey})})
      const page: Page = {...result,sandboxId:result.pageId,shellUrl:'about:srcdoc',partition:'opaque',target,html:'',state:result.state === null ? null : genUiWidgetStateSchema.parse(result.state),active:false,disposed:false,gestureAt:-Infinity,captures:new Map(),loadCount:0,revision:result.stateRevision ?? 0,userId:ownerUserId}
      pages.set(page.sandboxId,page)
      const resources = new AbortController()
      const resourceSignal = signal ? AbortSignal.any([signal, resources.signal]) : resources.signal
      try {
        assertScope()
        signal?.throwIfAborted()
        active = page
        const pending = new Set<string>()
        const progress = () => onProgress?.({stage:'resources',pending:[...pending]})
        const [html] = await Promise.all([buildWebDocument(result.html,result.state,async name => {
          pending.add(name);progress()
          try {
            return await publicResources.read(name, result.resourceHashes?.[name], () => readWebResource(name, async attemptSignal => {
              assertScope()
              const publicUrl = visualizeResourceUrl(name,result.resourceHashes?.[name])
              if (publicUrl) {
                const response = await lingxiApiFetch(publicUrl,{credentials:'omit',cache:'default',signal:attemptSignal})
                if (response.status !== 404) return response
                // The first rollout can meet an older server hash that was not
                // yet emitted as a static asset. Keep its authorized read path.
                assertScope()
              }
              // Old servers without hash metadata retain the page-authorized path.
              return lingxiApiFetch(`/api${path(target)}/pages/${encodeURIComponent(result.pageId)}/resources?name=${encodeURIComponent(name)}`, {credentials:'include',cache:'no-store',headers:headers(page),signal:attemptSignal})
            }, resourceSignal), resourceSignal)
          } finally { pending.delete(name);progress() }
        }, result.resourceHashes?.['visualize.html'], result.resourceHashes), refreshState(page,false,resourceSignal)])
        assertScope()
        signal?.throwIfAborted()
        page.html = html
        preparedState = page
      } catch(error) {
        resources.abort()
        if (preparedState === page) preparedState = undefined
        if (active === page) active = undefined
        await webPlatform.disposeSandbox(page.sandboxId,page.initId)
        throw error
      }
      return page
    },
    async getState(_target, signal) {
      const page = requirePage()
      signal?.throwIfAborted()
      // Preparation already awaited this page's authorized fresh GET alongside
      // its resources. Consume it once before mounting; subsequent reads stay
      // fresh, and projectState retains any newer same-scope revision.
      if (preparedState === page) preparedState = undefined
      else await refreshState(page,false,signal)
      return page.state
    },
    async setState({target: stateTarget,state}) {
      const page = requirePage(); current(page)
      const response = await http<StateResponse>(`${pagePath(page)}/state`, {method:'PUT',headers:headers(page),body:JSON.stringify({state})})
      current(page); projectState(page,response)
      invalidations?.postMessage({scope:stateScope(page), path:stateTarget.path})
    },
    onStateChanged(listener) {stateListeners.add(listener); return {dispose() {stateListeners.delete(listener)}}},
    async validate() {await validate(requirePage())},
  }
  return {service, async openExternal(url) {await openExternalForPage(requirePage(),url)}, async sendFollowUp(prompt) {
    const page = requirePage(); current(page)
    const gestureToken = page.gestureToken; page.gestureToken = undefined
    if (!gestureToken) throw new Error('Follow-up requires a user gesture')
    if (pendingFollowUp && pendingFollowUp.prompt !== prompt) throw new Error('Retry the previous unconfirmed follow-up before sending another')
    pendingFollowUp ??= {prompt,idempotencyKey:crypto.randomUUID()}
    await http(`${pagePath(page)}/follow-up`, {method:'POST',headers:headers(page),body:JSON.stringify({...pendingFollowUp,gestureToken})})
    pendingFollowUp = undefined
    current(page)
  }}
}

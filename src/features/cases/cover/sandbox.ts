/** Generated code is only ever parsed by an opaque, script-only iframe. */
export const CASE_COVER_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'"
export const MAX_CASE_COVER_HTML = 512 * 1024

export function coverSandboxDocument(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || Object.keys(payload).length !== 1 || !('html' in payload)
    || typeof payload.html !== 'string' || !payload.html.trim()
    || payload.html.length > MAX_CASE_COVER_HTML || payload.html.includes('\0')) {
    throw new Error('封面暂时无法交互。')
  }
  const inner = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${CASE_COVER_CSP}"><meta name="referrer" content="no-referrer">${payload.html}`
  // Model HTML is a string in trusted code, never executable in this outer realm.
  // The outer frame's frame-src also constrains its child's own navigations.
  const encoded = JSON.stringify(inner).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
  const policy = CASE_COVER_CSP.replace("frame-src 'none'", 'frame-src blob:')
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;touch-action:pan-y}iframe{width:100%;height:100%;border:0;display:block}</style></head><body><iframe id="renderer" sandbox="allow-scripts" referrerpolicy="no-referrer" tabindex="-1" title="封面图形"></iframe><script>
(()=>{'use strict';
const renderer=document.getElementById('renderer');
const url=URL.createObjectURL(new Blob([${encoded}],{type:'text/html'}));
let environment=null;
const shape=(data,keys)=>!!data&&typeof data==='object'&&!Array.isArray(data)&&Object.keys(data).length===keys.length&&keys.every(key=>Object.hasOwn(data,key));
addEventListener('message',event=>{
const data=event.data;
if(event.source===parent&&shape(data,['type','version','theme','reducedMotion','engaged'])&&data.type==='case-cover:environment'&&data.version===1&&(data.theme==='light'||data.theme==='dark')&&typeof data.reducedMotion==='boolean'&&typeof data.engaged==='boolean'){
environment=data;renderer.contentWindow.postMessage(data,'*');
}else if(event.source===renderer.contentWindow&&shape(data,['type','version'])&&data.version===1&&(data.type==='case-cover:ready'||data.type==='case-cover:error')){
parent.postMessage({type:data.type,version:1},'*');if(environment)renderer.contentWindow.postMessage(environment,'*');
}
});
addEventListener('pagehide',()=>URL.revokeObjectURL(url),{once:true});
renderer.src=url;
})();
</script></body></html>`
}

export function coverAssetPath(url: string): string {
  // Only the dedicated, authenticated cases endpoint can supply executable content.
  if (!/^\/api\/cases\/[A-Za-z0-9_%.-]+\/cover\/assets\/[A-Za-z0-9_%.-]+\/[1-9][0-9]*\/(?:interactive|preview)\?snapshot=(?:draft|published)$/.test(url)) {
    throw new Error('封面资源地址无效。')
  }
  return url.slice('/api'.length)
}

export function isCoverMessage(event: Pick<MessageEvent, 'source' | 'data'>, source: MessageEventSource | null): event is MessageEvent<{ type: 'case-cover:ready' | 'case-cover:error'; version: 1 }> {
  const data: unknown = event.data
  return source !== null && event.source === source && !!data && typeof data === 'object'
    && !Array.isArray(data) && Object.keys(data).length === 2
    && 'version' in data && data.version === 1 && 'type' in data
    && (data.type === 'case-cover:ready' || data.type === 'case-cover:error')
}

/** At most two independent Hairline animation loops, with oldest activation evicted. */
export function createCoverBudget(limit = 2) {
  const slots = new Map<symbol, () => void>()
  return {
    acquire(dispose: () => void) {
      while (slots.size >= Math.max(1, limit)) {
        const oldest = slots.entries().next().value as [symbol, () => void]
        slots.delete(oldest[0]); oldest[1]()
      }
      const token = Symbol('case-cover')
      slots.set(token, dispose)
      return () => { slots.delete(token) }
    },
    get size() { return slots.size },
  }
}

export const caseCoverBudget = createCoverBudget()

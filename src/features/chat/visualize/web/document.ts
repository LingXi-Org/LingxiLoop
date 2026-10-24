import { trustedBootstrap } from './bootstrap'
import captureLibrary from 'html-to-image/dist/html-to-image.js?raw'
import type { GenUiWidgetState } from '../zcode/shared/gen-ui'
const STATIC_DOMAINS = 'https://cdnjs.cloudflare.com https://esm.sh https://cdn.jsdelivr.net https://unpkg.com https://fonts.googleapis.com https://fonts.gstatic.com https://fonts.bunny.net'
const SANDBOX_CSP = `default-src 'none'; script-src 'unsafe-inline' ${STATIC_DOMAINS}; style-src 'unsafe-inline' ${STATIC_DOMAINS}; img-src data: blob: ${STATIC_DOMAINS}; font-src data: ${STATIC_DOMAINS}; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`
const script = (source: string) => `<script>${source.replaceAll('</script','<\\/script')}</script>`
const vendors = [
  ['https://unpkg.com/@floating-ui/core@1.7.3/dist/floating-ui.core.umd.min.js','vendor/floating-ui-core-1.7.3.min.js'],
  ['https://unpkg.com/@floating-ui/dom@1.7.4/dist/floating-ui.dom.umd.min.js','vendor/floating-ui-dom-1.7.4.min.js'],
  ['https://unpkg.com/lucide@1.17.0/dist/umd/lucide.js','vendor/lucide-1.17.0.js'],
  ['https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js','vendor/d3-7.9.0.min.js'],
]
// Dependencies of the pinned ZCode kit. Unknown versions retain discovery from
// their actual HTML; only this exact kit can skip the extra dependency round.
const PINNED_KIT_SHA256 = '42d9c7d924174a23545ad2ffc31ec0692ca589b3999c2ffdc21c1d358f4185bf'
/** Same ordering as ZCode service/protocol; all resources are fetched by the authorized host. */
export async function buildWebDocument(fragment: string, state: GenUiWidgetState | null, resource: (name: string) => Promise<string>, kitHash?: unknown) {
  const reads = new Map<string, Promise<string>>()
  const read = (name: string) => {
    let pending = reads.get(name)
    if (!pending) { pending = resource(name); reads.set(name, pending) }
    return pending
  }
  const [css, content, runtime, calendar] = await Promise.all([
    read('visualize.css'),read('visualize.html').then(async kit => {
      let content = fragment + kit.replace('<!--__INLINE_VISUALIZATION_FRAGMENT__-->','')
      // Discover optional/unknown-kit dependencies from the actual HTML as soon
      // as it arrives; pinned dependencies reuse their already-started reads.
      // Keep the whole chain in Promise.all so any failure aborts preparation.
      const sources = await Promise.all(vendors.filter(([url]) => content.includes(url))
        .map(async ([url, name]) => [url, await read(name)] as const))
      // Fetch timing does not change script execution order (Core before DOM).
      for (const [url,source] of sources) {
        const escaped = url.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
        content = content.replace(new RegExp(`<script\\b[^>]*\\bsrc=["']${escaped}["'][^>]*>\\s*</script>`, 'gi'), () => script(source))
      }
      return content
    }),read('gen-ui.js'),
    /\bviz-calendar\b/i.test(fragment) ? read('calendar.js') : Promise.resolve(''),
    // These reads retain this page's capability and cancellation. They join
    // the same failure boundary; the later HTML substitution reuses each read.
    Promise.all(kitHash === PINNED_KIT_SHA256 ? vendors.slice(0, 3).map(([, name]) => read(name)) : []),
  ])
  const initial = JSON.stringify(state).replaceAll('<','\\u003c')
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${script(captureLibrary+'\n;('+trustedBootstrap.toString()+')();')}<style>${css}\n:root{--visualize-paint-gutter:5px;--viz-fg:var(--foreground)}</style><script type="application/json" id="zcode-gen-ui-initial-state">${initial}</script>${script(runtime)}${calendar ? script(calendar) : ''}</head><body>${content}<style id="zcode-gen-ui-document-scrollbar">html,body{scrollbar-width:none!important}html::-webkit-scrollbar,body::-webkit-scrollbar{display:none!important}</style></body></html>`
}

/** A trusted opaque outer shell supplies an ancestor frame policy for the untrusted document. */
export function buildWebShell(html: string) {
  const documentJson = JSON.stringify(html).replaceAll('<','\\u003c')
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}"><style>html,body,iframe{width:100%;height:100%;margin:0;border:0;display:block;background:transparent}html,body{overflow:hidden}</style></head><body><script>(()=>{
    const guest=document.createElement('iframe');
    guest.setAttribute('sandbox','allow-scripts');guest.setAttribute('title','交互视图');guest.setAttribute('referrerpolicy','no-referrer');guest.setAttribute('data-visualize-content','');
    let privateBound=false,loads=0;
    window.addEventListener('message',event=>{
      if(event.source===guest.contentWindow && event.origin==='null'){
        if(event.data?.type==='lingxi-visualize-private' && !privateBound && event.ports.length===1){privateBound=true;parent.postMessage({type:'lingxi-visualize-private'},'*',[event.ports[0]]);return;}
        if(event.data?.jsonrpc==='2.0')parent.postMessage(event.data,'*');
      }else if(event.source===parent && event.data?.jsonrpc==='2.0')guest.contentWindow.postMessage(event.data,'*');
    });
    guest.addEventListener('load',()=>{if(++loads>1)parent.postMessage({type:'lingxi-visualize-crash'},'*')});
    guest.srcdoc=${documentJson};document.body.append(guest);
  })();</script></body></html>`
}

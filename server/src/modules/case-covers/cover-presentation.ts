import { createHash } from 'node:crypto'
/** Trusted presentation wrapper. The original complete bench is validated separately. */
export const COVER_CSP = "default-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; connect-src 'none'; img-src 'none'; font-src 'none'; media-src 'none'; worker-src 'none'; style-src 'unsafe-inline'"
const escapeAttribute = (value: string) => value.replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
export function buildCoverPresentation(input: {kernel:string;figure:string;altText:string}): string {
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${COVER_CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}body{background:#fff}html[data-theme=dark] body{background:#08090a}#stage{width:100%;aspect-ratio:5/4;touch-action:pan-y}</style></head><body><div id="stage" role="img" aria-label="${escapeAttribute(input.altText)}"></div><script>${input.kernel}</script><script>
(() => {
  'use strict';
  const stage = document.getElementById('stage');
  let handle = null, figure = null, engaged = false, disposed = false;
  const send = type => parent.postMessage({type,version:1},'*');
  const destroy = () => { if (handle) { handle.destroy(); handle = null; } };
  const leave = () => stage.dispatchEvent(new PointerEvent('pointerleave',{pointerType:'mouse'}));
  const mount = () => {
    if (disposed || !figure) return;
    destroy(); stage.replaceChildren();
    const svg = HL.mk('svg',{viewBox:'0 0 400 320','aria-hidden':'true'},stage);
    handle = figure.mount({stage,svg,read:{textContent:'rest'}},figure.range[1]);
  };
  HL.inject(document);
  window.hairline = value => {
    if (figure) throw Error('one figure only');
    figure = value; stage.setAttribute('data-hairline',value.name); mount();
    requestAnimationFrame(() => requestAnimationFrame(() => send('case-cover:ready')));
  };
  addEventListener('message',event => {
    if (event.source !== parent || !event.data || typeof event.data !== 'object') return;
    const data = event.data;
    if (Object.keys(data).sort().join(',') !== 'engaged,reducedMotion,theme,type,version' || data.type !== 'case-cover:environment' || data.version !== 1 || !['light','dark'].includes(data.theme) || typeof data.reducedMotion !== 'boolean' || typeof data.engaged !== 'boolean') return;
    document.documentElement.dataset.theme = data.theme;
    stage.setAttribute('data-hairline-theme',data.theme);
    HL.setReducedMotion(data.reducedMotion);
    if (data.reducedMotion) { engaged = false; mount(); return; }
    if (data.engaged && !engaged) {
      const bounds = stage.getBoundingClientRect();
      stage.dispatchEvent(new PointerEvent('pointermove',{pointerType:'mouse',pointerId:1,bubbles:true,clientX:bounds.left+bounds.width/2,clientY:bounds.top+bounds.height/2}));
    } else if (!data.engaged && engaged) leave();
    engaged = data.engaged;
  });
  addEventListener('pagehide',() => { disposed = true; destroy(); },{once:true});
  addEventListener('error',() => send('case-cover:error'));
  addEventListener('unhandledrejection',() => send('case-cover:error'));
})();
</script><script type="module">${input.figure}</script></body></html>`
  return withCoverScriptPolicy(html)
}

/** Hash exactly the assembled script bytes; allow no new scripts or eval. */
export function withCoverScriptPolicy(html: string): string {
  const hashes = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`)
  const policy = `${COVER_CSP}; script-src ${hashes.length ? hashes.join(' ') : "'none'"}`
  const stripped = html.replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/g,'')
  return stripped.replace('<head>',`<head><meta http-equiv="Content-Security-Policy" content="${policy}">`)
}

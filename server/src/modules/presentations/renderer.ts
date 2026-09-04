import { createHash } from 'node:crypto'
import type {
  EvidenceItemV1,
  LectureDeckManifestV1,
  SlideElementV1,
  SlideSpecV1,
} from './contracts.js'

export const LECTURE_DECK_RUNTIME_VERSION = 'interactive-lecture-deck@ca99f22+a5802b9+2973db3'
export const LECTURE_DECK_RENDERER_VERSION = 'lingxiloop-deterministic-1.0.0'
export const MAX_PRESENTATION_HTML_BYTES = 25 * 1024 * 1024

export class PresentationHtmlSizeLimitError extends Error {
  readonly sizeBytes: number

  constructor(sizeBytes: number) {
    super(`presentation HTML is ${sizeBytes} bytes and exceeds the 25 MiB publication limit`)
    this.name = 'PresentationHtmlSizeLimitError'
    this.sizeBytes = sizeBytes
  }
}

interface Rect { x: number; y: number; width: number; height: number }
interface RenderedSlide { id: string; title: string; html: string; anchors: Array<{ id: string; label: string; rect: Rect; panel: SlideSpecV1['anchors'][number]['panel'] }> }
interface LectureDeckSourceAsset { assetId: string; mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; dataUri: string }

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026')
}

function elementRects(elements: SlideElementV1[], visualType: SlideSpecV1['visualType']): Map<string, Rect> {
  const output = new Map<string, Rect>()
  const count = Math.max(1, elements.length)
  if (visualType === 'process' || visualType === 'timeline') {
    const width = Math.min(220, Math.floor(1040 / count) - 24)
    elements.forEach((element, index) => {
      output.set(element.id, {
        x: 90 + Math.round(index * (1080 / count)), y: visualType === 'timeline' ? 330 : 270,
        width, height: 150,
      })
    })
    return output
  }
  if (visualType === 'comparison' || visualType === 'table') {
    const columns = visualType === 'comparison' ? 2 : Math.min(3, count)
    const rows = Math.ceil(count / columns)
    elements.forEach((element, index) => {
      output.set(element.id, {
        x: 90 + (index % columns) * Math.floor(1100 / columns),
        y: 180 + Math.floor(index / columns) * Math.floor(410 / rows),
        width: Math.floor(1020 / columns), height: Math.max(84, Math.floor(350 / rows)),
      })
    })
    return output
  }
  if (visualType === 'chart') {
    const width = Math.max(48, Math.floor(940 / count) - 24)
    const numeric = elements.map((item) => typeof item.value === 'number' ? Math.abs(item.value) : 1)
    const maximum = Math.max(1, ...numeric)
    elements.forEach((element, index) => {
      const height = Math.max(70, Math.round(310 * numeric[index]! / maximum))
      output.set(element.id, { x: 130 + index * Math.floor(980 / count), y: 560 - height, width, height })
    })
    return output
  }
  if (visualType === 'formula') {
    elements.forEach((element, index) => {
      output.set(element.id, {
        x: 190 + (index % 2) * 470, y: 210 + Math.floor(index / 2) * 150, width: 410, height: 112,
      })
    })
    return output
  }
  if (visualType === 'image') {
    elements.slice(0, 4).forEach((element, index) => {
      output.set(element.id, { x: 850, y: 178 + index * 105, width: 330, height: 86 })
    })
    return output
  }
  const columns = count <= 4 ? 2 : count <= 9 ? 3 : 4
  const rows = Math.ceil(count / columns)
  elements.forEach((element, index) => {
    output.set(element.id, {
      x: 90 + (index % columns) * Math.floor(1100 / columns),
      y: 170 + Math.floor(index / columns) * Math.floor(430 / rows),
      width: Math.floor(1010 / columns), height: Math.max(92, Math.floor(370 / rows)),
    })
  })
  return output
}

function center(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

function renderContentSlide(
  spec: SlideSpecV1,
  evidenceById: Map<string, EvidenceItemV1>,
  assetsById: Map<string, LectureDeckSourceAsset>,
): RenderedSlide {
  const sourceAsset = spec.sourceAssetId == null ? null : assetsById.get(spec.sourceAssetId)
  if (spec.visualType === 'image' && !sourceAsset) throw new Error(`image slide ${spec.id} has no authorized source asset`)
  if (sourceAsset && !sourceAsset.dataUri.startsWith(`data:${sourceAsset.mimeType};base64,`)) {
    throw new Error(`image slide ${spec.id} has an invalid source asset payload`)
  }
  const rects = elementRects(spec.elements, spec.visualType)
  const edges = spec.relations.flatMap((relation) => {
    const from = rects.get(relation.from)
    const to = rects.get(relation.to)
    if (!from || !to) return []
    const a = center(from), b = center(to)
    return [`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`,
      relation.label ? `<text x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 8}">${escapeHtml(relation.label)}</text>` : '']
  }).join('')
  const nodes = spec.elements.map((element) => {
    const rect = rects.get(element.id)!
    const value = element.value == null ? '' : `<strong>${escapeHtml(String(element.value))}</strong>`
    return `<div class="node node-${escapeHtml(spec.visualType)}" data-anchor-id="${escapeHtml(element.id)}"
      style="left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px">
      ${value}<span>${escapeHtml(element.label)}</span>${element.detail ? `<small>${escapeHtml(element.detail)}</small>` : ''}
    </div>`
  }).join('')
  const markers = [...new Set(spec.evidenceIds.map((id) => evidenceById.get(id)?.marker).filter(Boolean))]
  const sourceImage = sourceAsset
    ? `<figure class="source-image"><img src="${escapeHtml(sourceAsset.dataUri)}" alt="${escapeHtml(spec.title)}"></figure>`
    : ''
  const anchors = spec.anchors.flatMap((anchor) => {
    const rect = rects.get(anchor.targetElementId)
    return rect ? [{ id: anchor.id, label: anchor.label, rect, panel: anchor.panel }] : []
  })
  return {
    id: spec.id,
    title: spec.title,
    anchors,
    html: slideDocument(`<main class="slide content-slide visual-${escapeHtml(spec.visualType)}">
      <header><p class="eyebrow">${String(spec.pageNumber).padStart(2, '0')} · ${escapeHtml(spec.visualType)}</p>
        <h1>${escapeHtml(spec.title)}</h1><p class="conclusion">${escapeHtml(spec.conclusion)}</p></header>
      <section class="visual">${sourceImage}<svg class="relations" viewBox="0 0 1280 720" aria-hidden="true">${edges}</svg>${nodes}</section>
      <footer><span>LINGXILOOP · SOURCE-ONLY</span><span>${markers.map((marker) => `[${escapeHtml(String(marker))}]`).join(' ')}</span></footer>
    </main>`),
  }
}

function renderSpecialSlide(spec: SlideSpecV1, evidence: EvidenceItemV1[]): RenderedSlide {
  let body = ''
  if (spec.kind === 'sources') {
    const sources = [...new Map(evidence.map((item) => [item.sourceId, {
      title: item.sourceTitle,
      markers: evidence.filter((entry) => entry.sourceId === item.sourceId).map((entry) => entry.marker),
    }])).values()]
    body = `<div class="source-grid">${sources.map((source) =>
      `<div><b>${source.markers.map((marker) => `[${escapeHtml(marker)}]`).join(' ')}</b><span>${escapeHtml(source.title)}</span></div>`).join('')}</div>`
  } else if (spec.kind === 'opening') {
    body = `<p class="kicker">SOURCE-GROUNDED LECTURE</p><div class="opening-rule"></div>`
  } else {
    body = `<p class="closing-mark">END</p><div class="opening-rule"></div>`
  }
  return {
    id: spec.id,
    title: spec.title,
    anchors: [],
    html: slideDocument(`<main class="slide special-slide ${spec.kind}"><div class="special-inner">
      ${body}<h1>${escapeHtml(spec.title)}</h1><p class="conclusion">${escapeHtml(spec.conclusion)}</p>
    </div><footer><span>LINGXILOOP · SOURCE-ONLY</span><span>${String(spec.pageNumber).padStart(2, '0')}</span></footer></main>`),
  }
}

function slideDocument(body: string): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=1280,height=720">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:;">
  <style>${SLIDE_CSS}</style></head><body>${body}</body></html>`
}

const SLIDE_CSS = `
*{box-sizing:border-box}html,body{margin:0;width:1280px;height:720px;overflow:hidden;background:#fbfaf7;color:#23231f}
body{font-family:"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif}.slide{position:relative;width:1280px;height:720px;padding:64px}
header{position:relative;z-index:2}.eyebrow,.kicker{margin:0 0 10px;color:#534ab7;font-size:15px;font-weight:700;letter-spacing:.13em;text-transform:uppercase}
h1{margin:0;font-family:"Songti SC","Source Han Serif SC","Noto Serif CJK SC",serif;font-size:38px;line-height:1.13;font-weight:700;letter-spacing:-.02em}
.conclusion{margin:12px 0 0;max-width:920px;color:#595851;font-size:18px;line-height:1.5}.visual{position:absolute;inset:0}.relations{position:absolute;inset:0;width:1280px;height:720px;overflow:visible}
.relations line{stroke:#aaa7a0;stroke-width:2}.relations text{fill:#77746d;font-size:13px;text-anchor:middle;paint-order:stroke;stroke:#fbfaf7;stroke-width:5px}
.node{position:absolute;z-index:2;display:flex;flex-direction:column;justify-content:center;border:1px solid #ccc9c0;border-left:5px solid #534ab7;background:#fbfaf7;padding:14px 16px}
.node strong{font-family:"Songti SC",serif;color:#534ab7;font-size:30px;line-height:1;margin-bottom:8px}.node span{font-size:19px;font-weight:700;line-height:1.25}.node small{margin-top:7px;color:#66635c;font-size:13px;line-height:1.35}
.node-chart{justify-content:flex-end;border-left:1px solid #ccc9c0;border-top:5px solid #534ab7;text-align:center;background:#e8e5f6}.node-formula span{font-family:"Songti SC",serif;font-size:26px}.node-timeline{border-left:1px solid #ccc9c0;border-top:5px solid #534ab7}
.source-image{position:absolute;left:90px;top:178px;width:690px;height:410px;margin:0;display:grid;place-items:center;overflow:hidden;border:1px solid #d5d2ca;background:#eeece6}.source-image img{display:block;max-width:100%;max-height:100%;object-fit:contain}
footer{position:absolute;z-index:4;left:64px;right:64px;bottom:30px;display:flex;justify-content:space-between;color:#85827a;font-size:11px;letter-spacing:.12em}
.special-slide{display:flex;align-items:center}.special-inner{width:100%}.special-slide h1{max-width:980px;font-size:68px;line-height:1.06}.special-slide .conclusion{font-size:23px;max-width:820px}.opening-rule{width:88px;height:5px;background:#534ab7;margin:28px 0}
.closing-mark{font-size:14px;font-weight:800;color:#534ab7;letter-spacing:.28em}.source-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 36px;margin:0 0 38px;max-height:390px;overflow:hidden}
.source-grid div{display:grid;grid-template-columns:44px 1fr;gap:2px 12px;border-top:1px solid #d5d2ca;padding:11px 0}.source-grid b{grid-row:1/3;color:#534ab7;font-size:15px}.source-grid span{font-size:16px;font-weight:700}.source-grid small{color:#77746d;font-size:11px}
`

const RUNTIME_SCRIPT = `
(() => {
  'use strict';
  const data = JSON.parse(document.getElementById('deck-data').textContent);
  const viewport = document.getElementById('viewport');
  const spatial = document.getElementById('spatial');
  const camera = document.getElementById('camera');
  const frame = document.getElementById('slide-frame');
  const panel = document.getElementById('panel');
  const highlight = document.getElementById('highlight');
  const counter = document.getElementById('counter');
  const stepLabel = document.getElementById('step-label');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const steps = [];
  data.slides.forEach((slide, slideIndex) => {
    steps.push({ slideIndex, anchor: null });
    slide.anchors.forEach(anchor => steps.push({ slideIndex, anchor }));
  });
  let stepIndex = 0, loadedSlide = -1, pendingSlideLoad = null, renderRun = 0;
  document.documentElement.dataset.stepCount = String(steps.length);
  document.documentElement.dataset.reducedMotion = String(reduced);
  let free = { x: 0, y: 0, scale: 1, yaw: 0, pitch: 0 };
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function fitScale() { return Math.min(innerWidth / 1280, innerHeight / 720); }
  function applyFit() { document.documentElement.style.setProperty('--fit', String(fitScale())); }
  addEventListener('resize', applyFit); applyFit();
  function bridge(direction) {
    if (reduced || !spatial.animate) return Promise.resolve();
    const yaw = direction >= 0 ? -7.4 : 7.4;
    return spatial.animate([
      { transform: 'translate3d(0,0,-18px) rotateX(-1.7deg) rotateY(0deg)', opacity: .94 },
      { transform: 'translate3d(0,0,-92px) rotateX(-1.7deg) rotateY(' + yaw + 'deg)', opacity: .72 },
      { transform: 'translate3d(0,0,-18px) rotateX(-1.7deg) rotateY(0deg)', opacity: 1 },
    ], { duration: direction >= 0 ? 980 : 700, easing: 'cubic-bezier(.16,1,.3,1)' }).finished.catch(() => {});
  }
  function loadSlide(index, direction) {
    if (loadedSlide === index) return Promise.resolve(false);
    if (pendingSlideLoad?.index === index) return pendingSlideLoad.promise;
    pendingSlideLoad?.cancel?.();
    let pending;
    const promise = new Promise(resolve => {
      let settled = false;
      const finish = loaded => {
        if (settled) return;
        settled = true;
        if (frame.onload === onload) frame.onload = null;
        if (pendingSlideLoad === pending) pendingSlideLoad = null;
        if (loaded) loadedSlide = index;
        resolve(loaded);
      };
      const onload = () => requestAnimationFrame(() => finish(true));
      pending = { index, promise: null, cancel: () => finish(false) };
      frame.onload = onload;
      frame.srcdoc = data.slides[index].html;
    });
    pending.promise = Promise.all([promise, bridge(direction)]).then(([loaded]) => loaded);
    pendingSlideLoad = pending;
    return pending.promise;
  }
  function protectedView(rect) {
    const panelWidth = 330, panelGap = 34;
    const roomRight = 1280 - (rect.x + rect.width);
    const roomLeft = rect.x;
    const side = roomRight >= panelWidth + panelGap || roomRight >= roomLeft ? 'right' : 'left';
    const panelX = side === 'right' ? 1280 - panelWidth - 42 : 42;
    const protectedX = side === 'right' ? 46 : panelWidth + panelGap + 46;
    const protectedWidth = 1280 - panelWidth - panelGap - 92;
    const scale = clamp(Math.min(protectedWidth / Math.max(180, rect.width * 1.65), 500 / Math.max(120, rect.height * 1.65)), .84, 1.72);
    const targetX = protectedX + protectedWidth / 2;
    const targetY = 360;
    return { panelX, side, scale, x: targetX - (rect.x + rect.width / 2) * scale, y: targetY - (rect.y + rect.height / 2) * scale };
  }
  function setCamera(transform, animate = true) {
    const next = 'translate3d(' + transform.x + 'px,' + transform.y + 'px,0) scale(' + transform.scale + ')';
    if (!animate || reduced || !camera.animate) { camera.style.transform = next; return; }
    camera.animate([{ transform: camera.style.transform || 'translate3d(0,0,0) scale(1)' }, { transform: next }],
      { duration: 620, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' });
    camera.style.transform = next;
  }
  async function showStep(next, direction = 1) {
    const run = ++renderRun;
    next = clamp(next, 0, steps.length - 1);
    const targetStep = next;
    const previous = steps[stepIndex];
    const selected = steps[next];
    stepIndex = next;
    await loadSlide(selected.slideIndex, direction);
    if (run !== renderRun || stepIndex !== targetStep) return;
    if (selected.slideIndex !== previous?.slideIndex) free = { x: 0, y: 0, scale: 1, yaw: 0, pitch: 0 };
    const slide = data.slides[selected.slideIndex];
    counter.textContent = (selected.slideIndex + 1) + ' / ' + data.slides.length;
    if (!selected.anchor) {
      panel.hidden = true; highlight.hidden = true; stepLabel.textContent = slide.title;
      setCamera({ x: 0, y: 0, scale: 1 });
    } else {
      const view = protectedView(selected.anchor.rect);
      panel.hidden = false; panel.style.left = view.panelX + 'px'; panel.dataset.side = view.side;
      panel.innerHTML = '<p class="panel-kicker">' + escapeText(selected.anchor.label) + '</p>' +
        '<h2>' + escapeText(selected.anchor.panel.observation) + '</h2>' +
        '<p><b>原因</b>' + escapeText(selected.anchor.panel.reason) + '</p>' +
        '<p><b>意义</b>' + escapeText(selected.anchor.panel.meaning) + '</p>';
      highlight.hidden = false; highlight.style.left = selected.anchor.rect.x + 'px'; highlight.style.top = selected.anchor.rect.y + 'px';
      highlight.style.width = selected.anchor.rect.width + 'px'; highlight.style.height = selected.anchor.rect.height + 'px';
      stepLabel.textContent = selected.anchor.label;
      setCamera(view);
    }
    document.documentElement.dataset.stepIndex = String(stepIndex);
  }
  function escapeText(value) { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }
  function move(delta) { showStep(stepIndex + delta, delta); }
  addEventListener('keydown', event => {
    if (['ArrowRight','ArrowDown','PageDown',' '].includes(event.key)) { event.preventDefault(); move(1); }
    else if (['ArrowLeft','ArrowUp','PageUp'].includes(event.key)) { event.preventDefault(); move(-1); }
    else if (event.key === 'Home') showStep(0, -1);
    else if (event.key === 'End') showStep(steps.length - 1, 1);
    else if (event.key === '0') { free = { x: 0, y: 0, scale: 1, yaw: 0, pitch: 0 }; showStep(stepIndex, 0); }
  });
  viewport.addEventListener('wheel', event => {
    event.preventDefault(); panel.hidden = true; highlight.hidden = true;
    free.scale = clamp(free.scale * Math.exp(-event.deltaY * .001), .72, 2.45);
    setCamera({ x: free.x, y: free.y, scale: free.scale }, false);
  }, { passive: false });
  let drag = null;
  viewport.addEventListener('pointerdown', event => { drag = { x: event.clientX, y: event.clientY, ox: free.x, oy: free.y }; viewport.setPointerCapture(event.pointerId); });
  viewport.addEventListener('pointermove', event => {
    if (!drag) return; panel.hidden = true; highlight.hidden = true;
    free.x = drag.ox + (event.clientX - drag.x) / fitScale(); free.y = drag.oy + (event.clientY - drag.y) / fitScale();
    setCamera({ x: free.x, y: free.y, scale: free.scale }, false);
    spatial.style.transform = 'translate3d(0,0,-18px) rotateY(' + clamp((event.clientX - drag.x) * .018, -3.5, 3.5) + 'deg) rotateX(' + clamp(-(event.clientY - drag.y) * .012, -2.2, 2.2) + 'deg)';
  });
  viewport.addEventListener('pointerup', () => { drag = null; spatial.style.transform = ''; });
  viewport.addEventListener('dblclick', () => { free = { x: 0, y: 0, scale: 1, yaw: 0, pitch: 0 }; showStep(stepIndex, 0); });
  document.getElementById('prev').addEventListener('click', () => move(-1));
  document.getElementById('next').addEventListener('click', () => move(1));
  showStep(0, 1);
  setTimeout(() => document.getElementById('onboarding').classList.add('dismissed'), 5200);
})();`

const RUNTIME_CSS = `
:root{--paper:#fbfaf7;--canvas:#f2f0ea;--ink:#23231f;--accent:#534ab7;--fit:1}*{box-sizing:border-box}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--canvas);color:var(--ink);font-family:"PingFang SC","Microsoft YaHei",sans-serif}
.app{position:fixed;inset:0;display:grid;place-items:center}.viewport{position:relative;width:calc(1280px * var(--fit));height:calc(720px * var(--fit));perspective:1500px;touch-action:none;user-select:none}
.fit{position:absolute;width:1280px;height:720px;transform-origin:0 0;transform:scale(var(--fit))}.interaction,.spatial,.camera{position:absolute;inset:0;transform-style:preserve-3d}.spatial{transform:translate3d(0,0,-18px) rotateX(-1.7deg)}
.camera{transform-origin:0 0}.frame-shell{position:absolute;inset:0;background:var(--paper);box-shadow:0 30px 80px rgba(35,35,31,.13);transform:translateZ(0)}iframe{display:block;width:1280px;height:720px;border:0;background:var(--paper);transform:translateZ(0)}
.highlight{position:absolute;z-index:4;border:3px solid var(--accent);outline:9999px solid rgba(20,19,27,.08);pointer-events:none;transform:translateZ(0)}.geometry-probe{position:absolute;inset:0;pointer-events:none;opacity:0;transform:translateZ(0)}.panel{position:absolute;z-index:7;top:82px;width:330px;max-height:556px;overflow:hidden;background:rgba(251,250,247,.98);border-top:5px solid var(--accent);padding:25px 27px;box-shadow:0 20px 60px rgba(35,35,31,.18)}
.panel-kicker{margin:0 0 13px;color:var(--accent);font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.panel h2{margin:0 0 20px;font-family:"Songti SC",serif;font-size:25px;line-height:1.28}.panel p{font-size:15px;line-height:1.65;color:#55524c}.panel b{display:block;margin-top:13px;color:#23231f;font-size:12px;letter-spacing:.08em}
.hud{position:fixed;left:18px;right:18px;bottom:14px;display:flex;align-items:center;justify-content:space-between;color:#64615a;font-size:12px;pointer-events:none}.hud-controls{display:flex;gap:8px;pointer-events:auto}.hud button{width:36px;height:36px;border:1px solid #d2cfc7;background:#fbfaf7;color:#23231f;cursor:pointer}.hud button:hover{border-color:var(--accent);color:var(--accent)}
.onboarding{position:fixed;left:50%;bottom:66px;transform:translateX(-50%);padding:10px 15px;background:#23231f;color:#fff;font-size:12px;letter-spacing:.04em;transition:opacity .45s}.onboarding.dismissed{opacity:0;pointer-events:none}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`

export function compileLectureDeck(input: {
  title: string
  specs: SlideSpecV1[]
  evidence: EvidenceItemV1[]
  assets?: LectureDeckSourceAsset[]
  generatedAt?: string
}): { html: string; manifest: LectureDeckManifestV1; sha256: string; sizeBytes: number } {
  const evidenceById = new Map(input.evidence.map((item) => [item.id, item]))
  const assetsById = new Map((input.assets ?? []).map((asset) => [asset.assetId, asset]))
  const slides: RenderedSlide[] = input.specs.map((spec) => spec.kind === 'content'
    ? renderContentSlide(spec, evidenceById, assetsById)
    : renderSpecialSlide(spec, input.evidence))
  const stepCount = slides.reduce((count, slide) => count + 1 + slide.anchors.length, 0)
  const manifest: LectureDeckManifestV1 = {
    schemaVersion: 'lecture_deck_manifest_v1',
    title: input.title,
    pageCount: slides.length,
    stepCount,
    sourceCount: new Set(input.evidence.map((item) => item.sourceId)).size,
    runtimeVersion: LECTURE_DECK_RUNTIME_VERSION,
    rendererVersion: LECTURE_DECK_RENDERER_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  }
  const scriptHash = createHash('sha256').update(RUNTIME_SCRIPT).digest('base64')
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; frame-src 'self'; connect-src 'none'; media-src data: blob:; object-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(input.title)}</title><style>${RUNTIME_CSS}</style></head><body>
<!-- Runtime provenance: LingXiSkills interactive-lecture-deck @ ca99f22 with a5802b9 and 2973db3 fixes. Copyright (c) 2026 LingXi Team. MIT License. -->
<div class="app"><div id="viewport" class="viewport"><div class="fit"><div class="interaction"><div id="spatial" class="spatial"><div id="camera" class="camera"><div class="frame-shell"><iframe id="slide-frame" sandbox="" title="演示页面"></iframe></div><div id="highlight" class="highlight" hidden></div><div id="geometry-probe" class="geometry-probe" aria-hidden="true"></div></div></div><aside id="panel" class="panel" hidden></aside></div></div></div></div>
<div class="hud"><span id="step-label"></span><span id="counter"></span><div class="hud-controls"><button id="prev" aria-label="上一步">←</button><button id="next" aria-label="下一步">→</button></div></div>
<div id="onboarding" class="onboarding">方向键切换 · 滚轮缩放 · 拖拽查看 · 双击复位</div>
<script id="deck-data" type="application/json">${safeJson({ manifest, slides })}</script><script>${RUNTIME_SCRIPT}</script></body></html>`
  const sizeBytes = Buffer.byteLength(html)
  if (sizeBytes > MAX_PRESENTATION_HTML_BYTES) throw new PresentationHtmlSizeLimitError(sizeBytes)
  return { html, manifest, sha256: createHash('sha256').update(html).digest('hex'), sizeBytes }
}

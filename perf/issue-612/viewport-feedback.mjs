// Real guest measurement + production model function + native 400ms apply delay.
// Independent local content only; deliberately no production or model requests.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { buildDesignLayout } from '../../scripts/build-design-layout.mjs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core')
const { guest, host } = await buildDesignLayout()
const baseline = process.argv.includes('--baseline')
const out = process.env.RESULTS_DIR ?? '.codex-tmp/issue-612/viewport-feedback'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] })
const root = (min, children = '<p style="margin:0">Content</p>', extra = '') =>
  `<div class="sc-host"><main data-dc-tpl="1" style="width:640px;min-height:${min};${extra}">${children}</main></div>`
const cases = [
  ['root-vh', root('100vh'), false],
  ['nested-vh', root('200px', '<div style="height:100vh"></div><div style="height:16px"></div>'), false],
  ...['svh', 'lvh', 'dvh', 'vb', 'dvb', 'vmin', 'vmax'].map(unit => ['nested-' + unit, root('200px', `<div style="height:100${unit}"></div>`), false]),
  ['nested-calc', root('200px', '<div style="height:calc(100vh + 12px)"></div>'), false],
  ['stylesheet-variable', '<style>:root{--screen:calc(100svh - 1px)}.child{height:var(--screen)}</style>' + root('200px', '<div class="child"></div>'), false],
  ['pseudo-element', '<style>.page::after{content:"";display:block;height:100vh}</style>' + root('200px', '<div class="page"></div>'), false],
  ['height-media', '<style>@media(min-height:250px){.child{min-height:300px}}</style>' + root('200px', '<div class="child"></div>'), false],
  ['height-unit-media', '<style>@media(min-width:100vh){.child{min-height:300px}}</style>' + root('200px', '<div class="child"></div>'), false],
  ['percent-height', '<style>html,body,.sc-host{height:100%}</style>' + root('200px', '<div style="height:100%"></div>'), false],
  ['pixel-content', root('200px', '<div style="height:300px"></div>'), true],
  ['width-viewport-only', root('200px', '<div style="height:calc(50vw - 20px)"></div>'), true],
  ['pixel-calc', root('calc(100px + 100px)', '<div style="height:300px"></div>'), true],
  ['pixel-variable', '<style>:root{--floor:200px}</style>' + root('var(--floor)', '<div style="height:300px"></div>'), true],
  ['native-host-floor', '<style data-dc-editor-style>.sc-host{min-height:100vh}</style>' + root('200px', '<div style="height:300px"></div>'), true],
  ['native-fill-wrapper', '<style>html,body{height:100%;margin:0}#dc-root,#dc-root>.sc-host{height:100%}</style><div id="dc-root">' + root('200px', '<div style="height:300px"></div>') + '</div>', true],
  ['stretched-host', '<style data-dc-editor-style>.sc-host{min-height:100vh}</style><style>.sc-host{display:flex}</style>' + root('200px'), false],
]
const results = []
try {
  // Concurrent functional checks, not a performance benchmark.
  for (let offset = 0; offset < (baseline ? 2 : cases.length); offset += 4) {
    await Promise.all(cases.slice(offset, baseline ? 2 : offset + 4).map(async ([name, content, grows]) => {
      const page = await browser.newPage()
      try {
        const doc = '<!doctype html><html><head><style>body{margin:0;padding-top:16px}</style></head><body>' + content + '<script>' + guest + '</script></body></html>'
        await page.setContent(`<script>${host}</script><iframe style="width:640px;height:200px;border:0"></iframe><script>
          const frame=document.querySelector('iframe');window.applied=[200];window.received=[];
          let model={artboards:[{file:'test',x:0,y:0,w:640,h:200}]}, pending;
          addEventListener('message',event=>{if(event.source!==frame.contentWindow||event.data?.__dcEditorEvt?.type!=='flowSize')return;
            received.push(event.data.__dcEditorEvt);clearTimeout(pending);pending=setTimeout(()=>{
              const next=__lingxiDesignFlow.resizeFlowManifest(model,'test',event.data.__dcEditorEvt,(item,x,y)=>({...item,x,y}));
              if(next!==model){model=next;frame.style.height=model.artboards[0].h+'px';applied.push(model.artboards[0].h)}
            },400)});frame.srcdoc=${JSON.stringify(doc).replaceAll('<', '\\u003c')};</script>`)
        await page.waitForTimeout(baseline ? 3500 : 1500)
        const first = await page.evaluate(() => ({ applied: window.applied, received: window.received.length }))
        await page.waitForTimeout(1000)
        const final = await page.evaluate(() => ({ applied: window.applied, received: window.received.length }))
        if (baseline) assert(final.applied.length >= 5, name + ': original must reproduce feedback')
        else if (grows) {
          assert.deepEqual(final.applied, [200, 316], name + ': natural pixel content must converge')
          assert.equal(final.received, first.received, name + ': no continuing reports')
        } else assert.deepEqual(final.applied, [200], name + ': viewport-dependent content must not resize')
        results.push({ name, ...final })
      } finally { await page.close() }
    }))
  }
  await writeFile(out + (baseline ? '/before.json' : '/after.json'), JSON.stringify({ browser: browser.version(), baseline, results }, null, 2))
  console.log(JSON.stringify({ baseline, checks: results.length, results }))
} finally { await browser.close() }

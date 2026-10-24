import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

const staticSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 320"><rect x="80" y="60" width="240" height="200" rx="12" fill="#ddd" stroke="#555"/><path d="M80 130h240M80 200h240" stroke="#555"/></svg>'
// Deliberately tests attempted fetch/storage access in the opaque runtime. The
// server-generated SVG preview never comes back from this untrusted document.
const interactive = `<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;touch-action:pan-y}svg{width:100%;height:100%}#drawer{transition:transform .15s}body[data-engaged=true] #drawer{transform:translateY(-20px)}</style>${staticSvg.replace('<rect ', '<rect id="drawer" ')}<script>
let storage='blocked';try{localStorage.getItem('session');storage='accessible'}catch{}
let parentAccess='blocked';try{parent.document.body.dataset.untrusted='yes';parentAccess='accessible'}catch{}
document.body.dataset.parent=parentAccess;
document.body.dataset.storage=storage;
fetch('https://case-cover-boundary.invalid/probe').then(()=>document.body.dataset.network='allowed').catch(()=>document.body.dataset.network='blocked');
addEventListener('message',e=>{const d=e.data;if(e.source!==parent||d?.type!=='case-cover:environment')return;document.body.dataset.engaged=String(d.engaged);document.body.dataset.theme=d.theme});
parent.postMessage({type:'case-cover:ready',version:1},'*');
</script>`

for (const theme of ['light', 'dark']) test(`opaque cover lifecycle, keyboard activation and iframe budget (${theme})`, async ({ app, browser, screen }) => {
  let interactiveLoads = 0
  await browser.route(/\/api\/cases\/fixture\/cover\/assets\//, route => {
    if (route.request.url.includes('/preview?')) return route.fulfill({ body: staticSvg, contentType: 'image/svg+xml' })
    interactiveLoads++; return route.fulfill({ json: { html: interactive } })
  })
  await app.open(`/scripts/case-cover-fixture.html?theme=${theme}`)
  await expect(screen.getByRole('heading', '合成封面隔离边界')).toBeVisible()
  await expect(browser.locator('iframe')).toHaveCount(0)
  expect(interactiveLoads).toBe(0)
  for (const id of [1, 2, 3]) {
    await browser.locator(`[data-fixture-cover="${id}"] button`).focus()
    await browser.keyboard.press('Enter')
    const frame = browser.frameLocator(`[data-fixture-cover="${id}"] iframe`).frameLocator('#renderer')
    await expect(frame.locator('body')).toHaveAttribute('data-engaged', 'true')
    await expect(frame.locator('body')).toHaveAttribute('data-storage', 'blocked')
    await expect(frame.locator('body')).toHaveAttribute('data-parent', 'blocked')
    await expect(frame.locator('body')).toHaveAttribute('data-network', 'blocked')
    await expect(frame.locator('body')).toHaveAttribute('data-theme', theme)
  }
  await expect(browser.locator('iframe')).toHaveCount(2)
  await expect(browser.locator('iframe').first()).toHaveAttribute('sandbox', 'allow-scripts')
  await expect(browser.locator('[data-fixture-cover="1"] iframe')).toHaveCount(0)
  await app.screenshot(`case-cover-${theme}-synthetic-interaction`)
  await screen.getByRole('button', '切换组织').tap()
  await expect(browser.locator('iframe')).toHaveCount(0)
  await screen.getByRole('link', '阅读案例1').tap()
  await expect(browser).toHaveURL(/#article-1$/)
  await screen.getByRole('button', '切换页面').tap()
  await expect(browser.locator('[data-case-cover]')).toHaveCount(0)
})

for (const attack of ['location', 'data', 'blob', 'nested', 'document-write']) test(`native policy blocks generated ${attack} network escape`, async ({ app, browser }) => {
  const endpoint = `http://127.0.0.1:5189/cover-network-probe?kind=${attack}`
  const nested = `<script>fetch(${JSON.stringify(endpoint)});location.href=${JSON.stringify(endpoint)}<` + '/script>'
  const nestedData = JSON.stringify(nested).replace(/</g, '\\u003c')
  const code = attack === 'location' ? `location.href=${JSON.stringify(endpoint)}`
    : attack === 'data' ? `location.href='data:text/html,'+encodeURIComponent(${nestedData})`
    : attack === 'blob' ? `location.href=URL.createObjectURL(new Blob([${nestedData}],{type:'text/html'}))`
    : attack === 'document-write' ? `document.open();document.write(${nestedData});document.close()`
    : `const child=document.createElement('iframe');document.body.append(child);child.src=${JSON.stringify(endpoint)};try{child.contentDocument.write(${nestedData})}catch{}`
  const html = `<p>native escape probe</p><script>document.body.dataset.attempted=${JSON.stringify(attack)};parent.postMessage({type:'case-cover:ready',version:1},'*');let armed=false;addEventListener('message',event=>{if(event.source!==parent||event.data?.type!=='case-cover:environment')return;if(event.data.engaged)armed=true;else if(armed){armed=false;document.body.dataset.started='yes';setTimeout(()=>{${code}},1000)}})<` + '/script>'
  await browser.route(/\/api\/cases\/fixture\/cover\/assets\//, route => route.request.url.includes('/preview?')
    ? route.fulfill({ body: staticSvg, contentType: 'image/svg+xml' }) : route.fulfill({ json: { html } }))
  await app.open('/scripts/case-cover-fixture.html')
  await browser.locator('[data-fixture-cover="1"] button').focus()
  await browser.keyboard.press('Enter')
  const child = browser.frameLocator('[data-fixture-cover="1"] iframe').frameLocator('#renderer')
  await expect(child.locator('body')).toHaveAttribute('data-attempted', attack)
  await browser.locator('[data-fixture-cover="1"] button').hover()
  await browser.keyboard.press('Enter')
  await expect(child.locator('body')).toHaveAttribute('data-started', 'yes')
  const requests = await browser.evaluate(async () => {
    await new Promise(resolve => setTimeout(resolve, 1_500))
    return (await (await fetch('/cover-network-count')).json()).requests as number
  })
  expect(requests).toBe(0)
})

test('pinned upstream riffle renders through the trusted nested adapter and responds to the pointer', async ({ app, browser }) => {
  const { readFile } = await import('node:fs/promises')
  const html = await readFile('.e2e/case-cover/hairline.html', 'utf8')
  await browser.route(/\/api\/cases\/fixture\/cover\/assets\//, route => route.request.url.includes('/preview?')
    ? route.fulfill({ body: staticSvg, contentType: 'image/svg+xml' }) : route.fulfill({ json: { html } }))
  await app.open('/scripts/case-cover-fixture.html?theme=dark')
  await browser.locator('[data-fixture-cover="1"] button').focus()
  await browser.keyboard.press('Enter')
  const graph = browser.frameLocator('[data-fixture-cover="1"] iframe').frameLocator('#renderer')
  await expect(graph.locator('#stage')).toHaveAttribute('data-hairline', 'riffle')
  await expect(graph.locator('svg').first()).toHaveAttribute('viewBox', '0 0 400 320')
  await expect(graph.locator('#stage')).toHaveAttribute('data-hairline-theme', 'dark')
  await graph.locator('path.sil').nth(2).hover()
  // Stable hit bands are on resting top edges. Explore bounded points in the
  // object area rather than adding debug controls to the production cover.
  const box = await browser.evaluate(() => {
    const bounds = document.querySelector('[data-fixture-cover="1"] iframe')!.getBoundingClientRect()
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
  })
  for (const fraction of [0.3, 0.4, 0.5, 0.6]) {
    await browser.mouse.move(box.x + box.width / 2, box.y + box.height * fraction)
    if (await graph.locator('path.hi').count()) break
  }
  await expect(graph.locator('path.hi').first()).toBeVisible()
  await app.screenshot('case-cover-pinned-riffle-dark-interaction')
  await browser.mouse.move(0, 0)
  await browser.locator('[data-fixture-cover="1"] button').focus()
  await browser.keyboard.press('Enter')
  await expect(browser.locator('iframe')).toHaveCount(0)
})

test('characterize WebRTC separately from HTTP policy checks without claiming a universal network boundary', async ({ app, browser }) => {
  const html = `<p>synthetic WebRTC capability probe</p><script>
document.body.dataset.rtc='attempting';
(async()=>{try{
const connection=new RTCPeerConnection({iceServers:[{urls:'stun:127.0.0.1:51890'}]});
connection.createDataChannel('synthetic-public-probe');
await connection.setLocalDescription(await connection.createOffer());
document.body.dataset.rtc='offered';
addEventListener('pagehide',()=>connection.close(),{once:true});
}catch(error){document.body.dataset.rtc='blocked:'+error.name}
parent.postMessage({type:'case-cover:ready',version:1},'*');})();
<` + '/script>'
  await browser.route(/\/api\/cases\/fixture\/cover\/assets\//, route => route.request.url.includes('/preview?')
    ? route.fulfill({ body: staticSvg, contentType: 'image/svg+xml' }) : route.fulfill({ json: { html } }))
  await app.open('/scripts/case-cover-fixture.html')
  await browser.locator('[data-fixture-cover="1"] button').focus()
  await browser.keyboard.press('Enter')
  const child = browser.frameLocator('[data-fixture-cover="1"] iframe').frameLocator('#renderer')
  await expect(child.locator('body')).not.toHaveAttribute('data-rtc', 'attempting')
  const capability = await child.locator('body').getAttribute('data-rtc')
  const network = await browser.evaluate(async () => {
    await new Promise(resolve => setTimeout(resolve, 2_000))
    return await (await fetch('/cover-network-count')).json() as { requests: number; udpPackets: number }
  })
  const { writeFile } = await import('node:fs/promises')
  await writeFile('.e2e/case-cover/webrtc-characterization.json', JSON.stringify({ capability, network,
    interpretation: network.udpPackets > 0 ? 'CONFIRMED: arbitrary iframe JS reached local UDP despite CSP; no-network acceptance fails.' : 'No local UDP observed; this is not proof of universal/cross-browser/non-HTTP isolation.' }, null, 2))
  expect(capability !== null).toBe(true)
  // This characterization records the gap. It deliberately does not assert the
  // false proposition that passing HTTP probes proves no network on every channel.
})

import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import WebSocket from 'ws'

// Failure cases and the measurement contract are recorded in perf/BRIEF.md.
const runs = Number(process.env.PERF_RUNS ?? 10)
const variants = (process.env.PERF_VARIANTS ?? 'base,candidate').split(',')
const scenarios = (process.env.PERF_SCENARIOS ?? 'login,chat').split(',')
const output = process.env.PERF_OUTPUT ?? 'perf/bench/results'
const sessionFile = '.e2e/perf-session.json'
const chatPath = '/?project=e2e-classroom&view=conversations&conversation=e2e-study-room'

async function instrumentTarget(url: string) {
  const pages = await fetch('http://127.0.0.1:9239/json/list').then(response => response.json())
  const page = pages.find((item: { url: string }) => item.url === url)
  if (!page) throw new Error('Missing isolated performance target')
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
  let id = 0
  const send = (method: string, params = {}) => new Promise<void>((resolve, reject) => {
    const next = ++id
    const timer = setTimeout(() => { socket.off('message', receive); reject(new Error(`CDP timeout: ${method}`)) }, 10_000)
    const receive = (data: WebSocket.RawData) => {
      const message = JSON.parse(data.toString())
      if (message.id !== next) return
      clearTimeout(timer); socket.off('message', receive)
      if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve()
    }
    socket.on('message', receive); socket.send(JSON.stringify({ id: next, method, params }))
  })
  // CDP is used only for instrumentation; the official engine owns browser actions.
  await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: 4_000_000 / 8, uploadThroughput: 3_000_000 / 8 })
  await send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.PERF_CPU ?? 1) })
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  return () => socket.close()
}

if (process.env.PERF_SETUP === '1') test('prepare disposable authenticated session', async ({ app, browser, screen }) => {
  await app.open('/')
  await screen.getByLabel('邮箱').fill('member@e2e.lingxiloop.test')
  await screen.getByLabel('密码').fill('Local-E2E-password-0001!')
  await expect(screen.getByRole('button', '登录')).toBeEnabled({ timeout: 60_000 })
  await screen.getByRole('button', '登录').tap()
  await expect(screen.getByRole('navigation', '工作区与功能')).toBeVisible()
  await mkdir('.e2e', { recursive: true })
  await writeFile(sessionFile, JSON.stringify(await browser.cookies()), { mode: 0o600 })
  if (process.env.PERF_SEED_CHAT === '1') {
    await app.open(chatPath)
    const input = browser.locator('[contenteditable="true"]')
    await expect(input).toBeVisible()
    if (!await browser.locator('[data-msg-id]').filter({ hasText: '性能基准历史 6' }).count()) {
      for (let index = 1; index <= 6; index++) {
        const text = `性能基准历史 ${index}：保留历史、引用和中英文输入。\n\n- **关键结论**：冷缓存与配对测量\n- 验证内容：功能、布局、键盘操作\n\n\`\`\`ts\nconst sample = ${index}\n\`\`\``
        await input.fill(text)
        await screen.getByRole('button', '发送', { exact: true }).tap()
        await expect(browser.locator('[data-msg-id]').filter({ hasText: `性能基准历史 ${index}` })).toBeVisible()
      }
    }
    await browser.reload()
    await expect(browser.locator('[data-msg-id]').filter({ hasText: '性能基准历史 6' })).toBeVisible()
    await app.screenshot('durable-history-fixture')
  }
})
else for (const scenario of scenarios) for (let run = 0; run < runs; run++) for (const variant of variants) {
  test(`${scenario} ${String(run).padStart(2, '0')} ${variant}`, async ({ app, browser, screen }) => {
    const width = Number(process.env.PERF_WIDTH ?? 1440)
    await browser.setViewport({ width, height: width < 600 ? 844 : 960 })
    if (scenario === 'chat') await browser.setCookies(JSON.parse(await readFile(sessionFile, 'utf8')))
    const marker = `http://127.0.0.1:5180/perf-blank.html#perf-${scenario}-${run}-${variant}`
    await browser.goto(marker)
    const close = await instrumentTarget(marker)
    try {
      await browser.addInitScript(() => {
        const metrics = { ready: 0, workspace: 0, input: 0, lcp: 0, longTasks: 0, cls: 0, avatarRenders: 0 }
        const encode = window.encodeURIComponent
        window.encodeURIComponent = value => {
          if (typeof value === 'string' && value.startsWith('<svg')) metrics.avatarRenders++
          return encode(value)
        }
        const shifts: unknown[] = []
        Object.assign(window, { __perf: metrics, __shifts: shifts })
        new PerformanceObserver(list => { for (const entry of list.getEntries()) metrics.longTasks += entry.duration }).observe({ type: 'longtask', buffered: true })
        new PerformanceObserver(list => { for (const entry of list.getEntries()) metrics.lcp = entry.startTime }).observe({ type: 'largest-contentful-paint', buffered: true })
        new PerformanceObserver(list => { for (const entry of list.getEntries() as (PerformanceEntry & { hadRecentInput: boolean; value: number; sources: { node?: Element; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[] })[]) if (!entry.hadRecentInput) {
          metrics.cls += entry.value
          shifts.push({ at: entry.startTime, value: entry.value, sources: entry.sources.map(source => ({ tag: source.node?.tagName, className: source.node?.getAttribute('class'), previousRect: source.previousRect, currentRect: source.currentRect })) })
        } }).observe({ type: 'layout-shift', buffered: true })
        document.addEventListener('input', () => { metrics.input ||= performance.now() }, true)
        const check = () => {
          const node = document.querySelector<HTMLElement>('[contenteditable="true"], input[type="email"]')
          const historyReady = !location.search.includes('conversation=') || document.querySelector('[data-msg-id]')
          if (node?.getBoundingClientRect().width && !node.hasAttribute('disabled') && historyReady) metrics.ready ||= performance.now()
          if (document.querySelector('[aria-label="工作区与功能"]') && document.querySelector('[aria-label="搜索会话和消息"]')) metrics.workspace ||= performance.now()
          requestAnimationFrame(check)
        }
        requestAnimationFrame(check)
      })
      const origin = variant === 'base' ? 'http://127.0.0.1:5180' : (process.env.PERF_CANDIDATE_URL ?? 'http://127.0.0.1:5198')
      await browser.goto(origin + (scenario === 'chat' ? chatPath : '/'), { waitUntil: 'domcontentloaded' })
      const input = scenario === 'chat' ? browser.locator('[contenteditable="true"]') : screen.getByLabel('邮箱')
      await expect(input).toBeVisible()
      if (scenario === 'chat') await expect(browser.locator('[data-msg-id]').filter({ hasText: '性能基准历史 6' })).toBeVisible()
      await input.tap()
      await browser.keyboard.type(scenario === 'chat' ? '性能测试 abc' : 'p')
      if (scenario === 'chat') {
        await expect(input).toHaveText('性能测试 abc')
        await expect(screen.getByRole('button', '发送', { exact: true })).toBeEnabled()
      } else await expect(input).toHaveValue('p')
      const evidence = await browser.evaluate(() => ({
        ...((window as unknown as { __perf: { ready: number; input: number; workspace: number; lcp: number; longTasks: number; cls: number } }).__perf),
        measuredAt: new Date().toISOString(), userAgent: navigator.userAgent,
        shifts: JSON.parse(JSON.stringify((window as unknown as { __shifts: unknown[] }).__shifts)),
        resources: performance.getEntriesByType('resource').map(entry => {
          const resource = entry as PerformanceResourceTiming
          return { name: new URL(resource.name).pathname, type: resource.initiatorType, start: resource.startTime, end: resource.responseEnd, encoded: resource.encodedBodySize, decoded: resource.decodedBodySize, transfer: resource.transferSize }
        }),
        navigation: performance.getEntriesByType('navigation').map(entry => ({ ttfb: (entry as PerformanceNavigationTiming).responseStart })),
      }))
      expect(evidence.ready).toBeGreaterThan(0)
      expect(evidence.input).toBeGreaterThan(evidence.ready)
      await mkdir(output, { recursive: true })
      await writeFile(`${output}/${scenario}-${run}-${variant}.json`, JSON.stringify(evidence, null, 2))
      if (run === 0) {
        await browser.evaluate(async () => {
          await document.fonts.ready
          const style = document.createElement('style')
          style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}iframe{visibility:hidden!important}'
          document.head.append(style)
          return true
        })
        const golden = await browser.evaluate(() => ({ title: document.title, text: document.body.innerText, fields: [...document.querySelectorAll('input,[contenteditable="true"]')].map(node => ({ label: node.getAttribute('aria-label'), type: node.getAttribute('type'), rect: JSON.parse(JSON.stringify(node.getBoundingClientRect())) })) }))
        await writeFile(`${output}/${scenario}-${width}-${variant}-golden.json`, JSON.stringify(golden, null, 2))
        const screenshot = await app.screenshot(`${scenario}-${width}-${variant}`)
        const artifacts = '.e2e/perf-run/artifacts'
        const source = (await readdir(artifacts, { recursive: true })).find(file => file.replaceAll('\\', '/').endsWith(screenshot))
        if (!source) throw new Error(`Missing screenshot artifact: ${screenshot}`)
        await copyFile(`${artifacts}/${source}`, `${output}/${scenario}-${width}-${variant}.png`)
      }
    } finally { close() }
  })
}

// Reference runtime only; excluded upstream executables never enter the product.
import { createVisualFixture } from './native-editor-visual-fixture.mjs'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
const args = Object.fromEntries(
  process.argv.slice(2).map((value) => value.replace(/^--/, '').split('=')),
)
if (!args['reference-root']) throw Error('请指定固定版本参考目录')
const reference = args['reference-root'],
  output = args.output ?? join(tmpdir(), 'lingxi-speaker-source')
await mkdir(output, { recursive: true })
const inventory = JSON.parse(
  await readFile(
    new URL('../docs/evidence/issue-707/source-inventory.json', import.meta.url),
    'utf8',
  ),
)
for (const item of inventory.sources)
  if (
    createHash('sha256')
      .update(await readFile(join(reference, item.path)))
      .digest('hex') !== item.sha256
  )
    throw Error('参考文件哈希不符')
const modulePath = process.env.PLAYWRIGHT_MODULE ?? 'playwright',
  { chromium } = await import(
    modulePath.startsWith('/') ? pathToFileURL(modulePath).href : modulePath
  )

const root = await mkdtemp(join(tmpdir(), 'lingxi-source-speaker-'))
for (const [file, bytes] of createVisualFixture('slides').legacyFiles) {
  const path = join(root, file)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes)
}
const first = join(root, 'project/slides/page-1.html')
await writeFile(
  first,
  (await readFile(first, 'utf8')).replace(
    '</section>',
    '<aside>第一点：介绍设计。 第二点：说明交互。</aside></section>',
  ),
)
let child, browser
try {
  child = spawn(
    process.execPath,
    [
      join(reference, 'skills/claude-slides/scripts/server.mjs'),
      root,
      '--port',
      '0',
      '--host',
      '127.0.0.1',
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  )
  const url = await new Promise((resolve, reject) => {
    let raw = ''
    const timer = setTimeout(() => reject(Error('参考服务启动超时')), 15000)
    child.stdout.on('data', (b) => {
      raw += b
      try {
        const v = JSON.parse(raw)
        if (v.url) {
          clearTimeout(timer)
          resolve(v.url)
        }
      } catch {}
    })
    child.once('exit', () => {
      clearTimeout(timer)
      reject(Error('参考服务退出'))
    })
  })
  browser = await chromium.launch({
    ...(args.browser ? { executablePath: args.browser } : {}),
    headless: true,
    args: ['--no-sandbox'],
  })
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Present', exact: true }).click()
  const popup = page.waitForEvent('popup', { timeout: 15000 })
  await page.getByRole('menuitem', { name: 'Present with speaker notes', exact: true }).click()
  const speaker = await popup
  await speaker.waitForLoadState('domcontentloaded')
  await speaker.getByRole('button', { name: /next/i }).first().waitFor()
  await speaker.getByRole('button', { name: 'Pause', exact: true }).click()
  await speaker.getByRole('button', { name: 'Reset', exact: true }).click()
  const stable = async () => {
    await speaker.waitForFunction(() => {
      if (innerWidth < 640) return true
      const images = [...document.images]
      return images.length >= 2 && images.every((img) => img.complete && img.naturalWidth > 0)
    })
    await speaker.evaluate(() => document.fonts.ready)
    await speaker.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    )
  }
  const screenshots = []
  for (const [width, height] of [
    [1000, 640],
    [1920, 1200],
    [1440, 1000],
    [768, 1024],
    [390, 844],
  ]) {
    await speaker.setViewportSize({ width, height })
    await speaker.waitForFunction(
      (w) => document.querySelector('.sn').classList.contains('sn-wide') === w >= 640,
      width,
    )
    await stable()
    await speaker.screenshot({ path: join(output, width + 'x' + height + '.png') })
    screenshots.push({ width, height, file: width + 'x' + height + '.png' })
  }
  await speaker.setViewportSize({ width: 1000, height: 640 })
  await speaker.waitForFunction(() => document.querySelector('.sn').classList.contains('sn-wide'))
  await stable()
  const result = {
    sourceCommit: '016b39d7fdcc30bfacee31ea5541498ac53921c6',
    referenceResourceHashesVerified: inventory.sources.length,
    browserVersion: browser.version(),
    scope: '固定原版演讲者窗口，暂停并重置计时器；不代表完整编辑器视觉或服务/性能资格',
    screenshots,
    size: await speaker.evaluate(() => ({ width: innerWidth, height: innerHeight })),
    body: (await speaker.locator('body').innerText()).slice(0, 1800),
    layout: await speaker
      .locator('.sn,.sn-left,.sn-bar,.sn-clock,.sn-cur,.sn-navrow,.sn-head,.sn-notes')
      .evaluateAll((es) =>
        es.map((e) => {
          const s = getComputedStyle(e)
          return {
            class: e.className,
            rect: e.getBoundingClientRect().toJSON(),
            fontSize: s.fontSize,
            lineHeight: s.lineHeight,
            boxSizing: s.boxSizing,
            fontFamily: s.fontFamily,
            border: s.borderWidth,
          }
        }),
      ),
    controls: await speaker.locator('button,input,textarea,[role=slider]').evaluateAll((es) =>
      es
        .filter((e) => e.checkVisibility())
        .map((e) => {
          const s = getComputedStyle(e)
          return {
            role: e.getAttribute('role'),
            tag: e.tagName,
            label: e.getAttribute('aria-label'),
            title: e.getAttribute('title'),
            text: e.textContent,
            rect: e.getBoundingClientRect().toJSON(),
            font: s.font,
            fontWeight: s.fontWeight,
            background: s.backgroundColor,
            color: s.color,
          }
        }),
    ),
  }
  if (args['check-lifecycle'] === 'true') {
    await page.bringToFront()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Present', exact: true }).waitFor()
    await page.waitForTimeout(100)
    if (!speaker.isClosed()) await speaker.screenshot({ path: join(output, 'waiting.png') })
    result.afterPresentationExit = {
      popupClosed: speaker.isClosed(),
      body: speaker.isClosed() ? null : await speaker.locator('body').innerText(),
    }
  }
  await writeFile(join(output, 'results.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(
    JSON.stringify({
      sourceCommit: result.sourceCommit,
      referenceResourceHashesVerified: result.referenceResourceHashesVerified,
      screenshots: screenshots.length,
    }),
  )
} finally {
  await browser?.close()
  child?.kill('SIGTERM')
  await rm(root, { recursive: true, force: true })
}

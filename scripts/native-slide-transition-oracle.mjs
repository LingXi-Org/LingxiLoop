// Fixed upstream runtime reference only; no reference executable is bundled with LingxiLoop.
import { createVisualFixture } from './native-editor-visual-fixture.mjs'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
const args = Object.fromEntries(
  process.argv.slice(2).map((value) => value.replace(/^--/, '').split('=')),
)
if (!args['reference-root']) throw Error('请指定固定版本参考目录')
const reference = args['reference-root'],
  sourceFile = 'skills/claude-slides/scripts/editor/assets/index-kN-1njux.js',
  source = await readFile(join(reference, sourceFile)),
  rows = []
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
const browser = await chromium.launch({
  ...(args.browser ? { executablePath: args.browser } : {}),
  headless: true,
  args: ['--no-sandbox'],
})
const browserVersion = browser.version()
try {
  for (const kind of ['fade', 'push', 'magic']) {
    let child, page
    const root = await mkdtemp(join(tmpdir(), 'lingxi-slide-transition-oracle-'))
    try {
      const fixture = createVisualFixture('slides')
      for (const [file, bytes] of fixture.legacyFiles) {
        const target = join(root, file)
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, bytes)
      }
      const first = (await readFile(join(root, 'project/slides/page-1.html'), 'utf8')).replace(
        '<h1 ',
        '<h1 id="shared-heading" ',
      )
      await writeFile(
        join(root, 'project/slides/page-1.html'),
        first.replace('<section', '<section data-transition="' + kind + '"'),
      )
      await writeFile(
        join(root, 'project/slides/page-2.html'),
        first.replace('id="page-1"', 'id="page-2"').replace('left:64px', 'left:164px'),
      )
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
      page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: 'no-preference',
      })
      await page.addInitScript(() => {
        window.__trans = []
        const animate = Element.prototype.animate
        Element.prototype.animate = function (frames, timing) {
          window.__trans.push({ frames, timing, tag: this.tagName })
          return animate.call(this, frames, timing)
        }
      })
      await page.goto(url, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: 'Present', exact: true }).click()
      await page.waitForTimeout(400)
      await page.getByRole('menuitem', { name: 'Present', exact: true }).click()
      await page.waitForTimeout(200)
      await page.keyboard.press('ArrowRight')
      await page.waitForFunction(() => window.__trans.length > 0)
      const forward = await page.evaluate(() => window.__trans)
      await page.waitForTimeout(800)
      await page.evaluate(() => {
        window.__trans = []
      })
      await page.keyboard.press('ArrowLeft')
      await page.waitForFunction(() => window.__trans.length > 0)
      const backward = await page.evaluate(() => window.__trans)
      rows.push({ kind, forward, backward })
      console.log(
        JSON.stringify({
          kind,
          forwardAnimations: forward.length,
          backwardAnimations: backward.length,
        }),
      )
    } finally {
      await page?.close()
      child?.kill('SIGTERM')
      await rm(root, { recursive: true, force: true })
    }
  }
} finally {
  await browser.close()
}
await mkdir(args.output ?? join(tmpdir(), 'lingxi-slide-transition-source'), { recursive: true })
await writeFile(
  join(args.output ?? join(tmpdir(), 'lingxi-slide-transition-source'), 'results.json'),
  JSON.stringify(
    {
      sourceCommit: '016b39d7fdcc30bfacee31ea5541498ac53921c6',
      sourceFile,
      browserVersion,
      referenceResourceHashesVerified: inventory.sources.length,
      sourceSha256: createHash('sha256').update(source).digest('hex'),
      scope: '固定原版运行时记录，受控静态文档；不是完整视觉、授权服务或性能验收。',
      cases: rows,
    },
    null,
    2,
  ) + '\n',
)

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const upstream = resolve(root, 'third_party/zcode/upstream')
const output = resolve(root, 'server/assets/visualize-runtime')
const source = 'packages/desktop/src/renderer/src/plugin-sandbox/genUi.ts'
await mkdir(output, { recursive: true })
const result = await build({
  absWorkingDir: root,
  entryPoints: [resolve(upstream, source)],
  outfile: resolve(output, 'gen-ui.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['chrome120', 'firefox120', 'safari17'],
  minify: true,
  legalComments: 'inline',
  metafile: true,
  alias: { '@zcode/shared/gen-ui': resolve(upstream, 'packages/shared/src/gen-ui/index.ts') },
})
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const bytes = await readFile(resolve(output, 'gen-ui.js'))
const sources = Object.fromEntries(await Promise.all(Object.keys(result.metafile.inputs).sort().map(async name =>
  [relative(root, resolve(root, name)).replaceAll('\\', '/'), hash(await readFile(resolve(root, name)))],
)))
const manifest = {
  upstreamCommit: '0a1fc56d279fd1001f78387bd81aec1c26767411',
  entryPoint: source,
  files: { 'gen-ui.js': { sha256: hash(bytes), bytes: bytes.length } },
  sources,
}
await writeFile(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify({ file: 'gen-ui.js', ...manifest.files['gen-ui.js'], sourceCount: Object.keys(sources).length }))

// Product adaptation only: the pinned skill remains byte-identical. Optional
// scripts keep upstream behavior and licenses, and are fetched only on demand.
const kit = await readFile(resolve(root, 'third_party/zcode/skills/visualize/assets/visualize.html'), 'utf8')
const scripts = [...kit.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
const tooltip = scripts.find(([, , body]) => body.includes('const tooltipPlacements'))?.[2]
const carousel = scripts.find(([, attributes]) => attributes.includes('zcode-visualization-carousel'))?.[2]
if (!tooltip || !carousel) throw new Error('Pinned visualize kit optional scripts changed')
const floating = await Promise.all(['core-1.7.3', 'dom-1.7.4'].map(name => readFile(resolve(root, `third_party/zcode/skills/visualize/assets/vendor/floating-ui-${name}.min.js`), 'utf8')))
await writeFile(resolve(output, 'kit-tooltip.js'), `${floating.join('\n;\n')}\n;${tooltip}`)
// Upstream initializes existing carousels once. The product loader also supports
// author DOM updates; marking initialized roots avoids duplicating controls.
const dynamicCarousel = carousel.replace('document.querySelectorAll(".viz-carousel")', 'document.querySelectorAll(".viz-carousel:not([data-lingxi-carousel])")')
  .replace('root.setAttribute("role", "group");', 'root.setAttribute("data-lingxi-carousel", "");\nroot.setAttribute("role", "group");')
await writeFile(resolve(output, 'kit-carousel.js'), `/* Adapted from pinned ZCode visualize.html; Apache-2.0. */\n(() => { const initialize = () => {${dynamicCarousel}}; initialize(); const observer = new MutationObserver(initialize); observer.observe(document, {childList:true,subtree:true}); window.addEventListener('pagehide',()=>observer.disconnect(),{once:true}); })();`)
await build({ absWorkingDir: root, stdin: { contents: 'export { toCanvas } from "html-to-image"', resolveDir: root }, outfile: resolve(output, 'capture.js'), bundle: true, platform: 'browser', format: 'esm', target: ['chrome120', 'firefox120', 'safari17'], minify: true, legalComments: 'inline' })
for (const name of ['kit-tooltip.js', 'kit-carousel.js', 'capture.js']) {
  const content = await readFile(resolve(output, name))
  manifest.files[name] = {sha256:hash(content),bytes:content.length}
}
await writeFile(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

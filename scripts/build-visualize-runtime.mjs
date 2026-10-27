import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, transform } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const upstream = resolve(root, 'third_party/zcode/upstream')
const output = resolve(root, 'server/assets/visualize-runtime')
const source = 'packages/desktop/src/renderer/src/plugin-sandbox/genUi.ts'
/** Keep the official validation API; fix namespace retention only in this guest build. */
export function rewriteGuestZodImports(source) {
  return source.replace(/import\s*\{\s*z(?:\s+as\s+(\w+))?\s*\}\s*from\s*(['"])(zod(?:\/v4)?)\2\s*;/g,
    (_statement, alias, quote, module) => `import * as ${alias ?? 'z'} from ${quote}${module}${quote};`)
}
export async function buildGuestRuntime({ slim = true, write = true } = {}) {
  const rewrites = []
  const result = await build({
    absWorkingDir: root,
    entryPoints: [resolve(upstream, source)],
    outfile: resolve(output, 'gen-ui.js'),
    bundle: true, platform: 'browser', format: 'iife',
    target: ['chrome120', 'firefox120', 'safari17'],
    minify: true, legalComments: 'inline', metafile: true, write,
    alias: { '@zcode/shared/gen-ui': resolve(upstream, 'packages/shared/src/gen-ui/index.ts') },
    plugins: slim ? [{name:'guest-zod-namespace',setup(builder) {
      builder.onLoad({filter:/\.(?:m?js|ts)$/},async ({path})=>{
        if (path.includes('/node_modules/zod/')) return
        const original = await readFile(path,'utf8'), contents = rewriteGuestZodImports(original)
        if (contents === original) return
        rewrites.push(relative(root,path).replaceAll('\\','/'))
        return {contents,loader:path.endsWith('.ts')?'ts':'js'}
      })
    }}] : [],
  })
  return {...result,rewrites:rewrites.sort()}
}

export async function buildVisualizeRuntime() {
  await mkdir(output, { recursive: true })
  const result = await buildGuestRuntime()
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
    adaptation: {zodNamespaceImports:result.rewrites},
    contributions: Object.fromEntries(Object.entries(Object.values(result.metafile.outputs)[0].inputs)
      .filter(([,value])=>value.bytesInOutput>0).map(([name,value])=>[name,value.bytesInOutput])),
  }


  // Product adaptation only: the pinned skill remains byte-identical. Optional
  // scripts keep upstream behavior and licenses, and are fetched only on demand.
  const kit = await readFile(resolve(root, 'third_party/zcode/skills/visualize/assets/visualize.html'), 'utf8')
  const scripts = [...kit.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  const tooltip = scripts.find(([, , body]) => body.includes('const tooltipPlacements'))?.[2]
  const tabs = scripts.find(([,attributes])=>attributes.includes('zcode-visualization-tabs'))?.[2]
  const carousel = scripts.find(([, attributes]) => attributes.includes('zcode-visualization-carousel'))?.[2]
  if (!tooltip || !carousel || !tabs) throw new Error('Pinned visualize kit optional scripts changed')
  await writeFile(resolve(output,'kit-tabs.js'),(await transform(tabs,{loader:'js',minify:true,legalComments:'inline'})).code)
  await writeFile(resolve(output,'kit.css'),(await transform(await readFile(resolve(root,'third_party/zcode/skills/visualize/assets/visualize.css'),'utf8'),{loader:'css',minify:true})).code)
  // Current source/fixtures use Play, Search and the carousel arrows. Keep the
  // official Lucide renderer with just those nodes; unknown names use the pinned
  // full library on the existing independent compatibility path.
  const iconSource = await readFile(resolve(root,'third_party/zcode/skills/visualize/assets/vendor/lucide-1.17.0.js'),'utf8')
  const selectedIcons = new Set(['ChevronLeft','ChevronRight','Play','Search'])
  const subset = iconSource.replace(/^  const (\w+) = \[[\s\S]*?\n  \];/gm,(definition,name)=>selectedIcons.has(name)?definition:'').replace(/var iconAndAliases = \/\*#__PURE__\*\/Object.freeze\(\{[\s\S]*?\n  \}\);/,
    'const iconAndAliases = Object.freeze({ChevronLeft,ChevronRight,Play,Search});')
    .replace(/^  exports\.(\w+) = .*;$/gm,(line,name)=>['icons','createIcons','createElement'].includes(name)?line:'')
  if (subset === iconSource || !subset.includes('Object.freeze({ChevronLeft,ChevronRight,Play,Search})')) throw new Error('Pinned Lucide subset extraction changed')
  await writeFile(resolve(output,'kit-icons.js'),(await transform(subset,{loader:'js',minify:true,treeShaking:true,legalComments:'inline'})).code)
  const floating = await Promise.all(['core-1.7.3', 'dom-1.7.4'].map(name => readFile(resolve(root, `third_party/zcode/skills/visualize/assets/vendor/floating-ui-${name}.min.js`), 'utf8')))
  await writeFile(resolve(output, 'kit-tooltip.js'), `${floating.join('\n;\n')}\n;${tooltip}`)
  // Upstream initializes existing carousels once. The product loader also supports
  // author DOM updates; marking initialized roots avoids duplicating controls.
  const dynamicCarousel = carousel.replace('document.querySelectorAll(".viz-carousel")', 'document.querySelectorAll(".viz-carousel:not([data-lingxi-carousel])")')
    .replace('root.setAttribute("role", "group");', 'root.setAttribute("data-lingxi-carousel", "");\nroot.setAttribute("role", "group");')
  await writeFile(resolve(output, 'kit-carousel.js'), `/* Adapted from pinned ZCode visualize.html; Apache-2.0. */\n(() => { const initialize = () => {${dynamicCarousel}}; initialize(); const observer = new MutationObserver(initialize); observer.observe(document, {childList:true,subtree:true}); window.addEventListener('pagehide',()=>observer.disconnect(),{once:true}); })();`)
  await build({ absWorkingDir: root, stdin: { contents: 'export { toCanvas } from "html-to-image"', resolveDir: root }, outfile: resolve(output, 'capture.js'), bundle: true, platform: 'browser', format: 'esm', target: ['chrome120', 'firefox120', 'safari17'], minify: true, legalComments: 'inline' })
  for (const name of ['kit-tooltip.js', 'kit-carousel.js', 'kit-tabs.js', 'kit-icons.js', 'kit.css', 'capture.js']) {
    const content = await readFile(resolve(output, name))
    manifest.files[name] = {sha256:hash(content),bytes:content.length}
  }
  await writeFile(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  console.log(JSON.stringify({files:manifest.files,sourceCount:Object.keys(sources).length,adaptation:manifest.adaptation}))
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildVisualizeRuntime()

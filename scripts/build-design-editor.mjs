import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { adaptDesignMath, buildArtifactMath } from './build-artifact-math.mjs'
import { adaptDesignLayout, buildDesignLayout } from './build-design-layout.mjs'
import { translateDesign } from './design-copy.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'third_party/baoyu-design/upstream/claude-design/scripts/editor')
const output = resolve(root, 'server/assets/design-editor')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

/** Keep optional local-server features out of the grant-hosted editor. */
export function adaptDesignHostCapabilities(source) {
  const request = ',sendRequest:x=>g.sendRequest(x)'
  assert.equal(source.split(request).length, 2, 'pinned Design direct agent request capability changed')
  const controls = /function r\(\{system:y\}\)\{return y===void 0\|\|[\s\S]*?(?=function S\(\))/g
  const matches = source.match(controls) ?? []
  assert.equal(matches.length, 1, 'pinned Design local design-system controls changed')
  assert.ok(matches[0].includes('dc-theme-system-link') && matches[0].includes('(v,{systemKey:y.key})'))
  return source.replace(request, '').replace(controls, 'function r(){return null}')
}

/** Use the already prepared embedded runtime; keep the trusted URL as recovery. */
export function adaptDesignRuntimeUrl(source) {
  const needle = `let M=document.querySelector('meta[name="'+u+'"]')?.getAttribute("content");if(M)try{return new URL(M,document.baseURI).pathname}`
  assert.equal(source.split(needle).length, 2, 'pinned Design runtime URL hook changed')
  const selector = 'function w(M){if(!m)return(f?void 0:M.urls?.file)??M.urls?.blob}'
  assert.equal(source.split(selector).length, 2, 'pinned Design runtime selection hook changed')
  return source.replace(needle, needle.replace('.pathname}', '.href}'))
    .replace(selector, 'function w(M){return(m?void 0:M.urls?.blob)??(f?void 0:M.urls?.file)}')
}

/** The product acknowledges only an already visible, laid-out grant frame.
 * No parent animation remains to wait for. Keep the original standalone/held
 * path, and keep Loading until the real editor and child runtime mount. */
export function adaptVisibleDesignMount(source) {
  const changes = [
    ['function K($){return $.flipAt!==void 0?Math.max(0,$.flipAt+n-$.now):', 'function K($){return $.flipAt!==void 0?0:'],
    ['function U($){let Y=$.pokedAt', 'function U($){if($.framed&&$.revealedAt!==void 0)return Math.max($.mountedAt,$.revealedAt);let Y=$.pokedAt'],
  ]
  for (const [needle, replacement] of changes) {
    assert.equal(source.split(needle).length, 2, 'pinned Design visible mount hook changed')
    source = source.replace(needle, () => replacement)
  }
  return source
}

/** Package the pinned editor with the shared math enhancement and unchanged canvas model. */
export async function buildDesignEditor() {
  const { math } = await buildArtifactMath()
  const layout = await buildDesignLayout()
  const originalHtml = await readFile(resolve(source, 'index.html'), 'utf8')
  const cssPath = /href="\.\/(assets\/[^"/]+\.css)"/.exec(originalHtml)?.[1]
  assert.ok(cssPath, 'Expected the pinned Design stylesheet')
  const originalCss = await readFile(resolve(source, cssPath), 'utf8')
  const embedded = /data:font\/woff2;base64,([A-Za-z0-9+/=]+)/.exec(originalCss)
  assert.ok(embedded, 'Expected the pinned fallback icon font')
  const font = Buffer.from(embedded[1], 'base64')
  const fontName = `design-${sha(font)}.woff2`
  const iconPath = /url\(\.\/([^/)]+\.woff2)\)/.exec(originalCss)?.[1]
  assert.ok(iconPath, 'Expected the pinned icon font')
  const icon = await readFile(resolve(source, 'assets', iconPath))
  const iconName = `design-${sha(icon)}.woff2`
  const css = originalCss.replace(embedded[0], `./${fontName}`).replace(`./${iconPath}`, `./${iconName}`)
  const cssName = `design-${sha(css)}.css`
  const scriptPath = /src="\.\/(assets\/[^"/]+\.js)"/.exec(originalHtml)?.[1]
  assert.ok(scriptPath, 'Expected the pinned editor entry')
  const catalog = { ...JSON.parse(await readFile(resolve(root, 'third_party/baoyu-design/host/slides-zh-CN.json'), 'utf8')), ...JSON.parse(await readFile(resolve(root, 'third_party/baoyu-design/host/design-zh-CN.json'), 'utf8')) }
  const script = Buffer.from(translateDesign(adaptDesignHostCapabilities(adaptDesignLayout(adaptVisibleDesignMount(adaptDesignRuntimeUrl(adaptDesignMath(await readFile(resolve(source, scriptPath), 'utf8'), math + layout.guest))), layout.host)), catalog))
  const scriptName = `design-${sha(script)}.js`
  const publicBase = '__LINGXI_DESIGN_ASSET_ORIGIN__/artifact-editor/design-assets/'
  const runtimePath = 'artifact-type/dc-runtime.js'
  const runtime = Buffer.from(await readFile(resolve(source, runtimePath), 'utf8') + '\n;' + math + layout.guest)
  const runtimeName = `design-${sha(runtime)}.js`
  const runtimeFile = `assets/${runtimeName}`
  // Only generated build output is replaced; the complete upstream archive stays intact.
  await rm(output, { recursive: true, force: true })
  await mkdir(output, { recursive: true })
  await cp(source, output, { recursive: true })
  await writeFile(resolve(output, 'assets', fontName), font)
  await writeFile(resolve(output, 'assets', iconName), icon)
  await writeFile(resolve(output, 'assets', scriptName), script)
  await writeFile(resolve(output, runtimeFile), runtime)
  await writeFile(resolve(output, 'assets', cssName), css)
  await rm(resolve(output, cssPath))
  await rm(resolve(output, scriptPath))
  await rm(resolve(output, 'assets', iconPath))
  await rm(resolve(output, runtimePath))
  // Upstream's local-network sharing/history UI calls server routes this host does not have (/__share, __history).
  await rm(resolve(output, 'share-ui.js'))
  const integrity = bytes => `sha256-${createHash('sha256').update(bytes).digest('base64')}`
  const html = originalHtml.replace('<html lang="en"', '<html lang="zh-CN"').replace('>Loading…</p>', '>正在加载…</p>').replace(`./${cssPath}`, `${publicBase}${cssName}`).replace(`./${scriptPath}`, `${publicBase}${scriptName}`)
    .replace(`src="${publicBase}${scriptName}"`, `data-lingxi-design-critical src="${publicBase}${scriptName}" integrity="${integrity(script)}"`)
    .replace(`href="${publicBase}${cssName}"`, `data-lingxi-design-critical href="${publicBase}${cssName}" integrity="${integrity(css)}"`)
    .replace(runtimePath, `${publicBase}${runtimeName}`)
  await writeFile(resolve(output, 'index.html'), html)
  const compressed = {}
  const files = {}
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = resolve(directory, entry.name)
      if (entry.isDirectory()) { await visit(file); continue }
      const bytes = await readFile(file), name = relative(output, file).replaceAll('\\', '/')
      files[name] = { bytes: bytes.length, sha256: sha(bytes) }
      if (!/\.(?:js|css)$/.test(file)) continue
      const br = brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })
      const gz = gzipSync(bytes, { level: 9 })
      await writeFile(`${file}.br`, br); await writeFile(`${file}.gz`, gz)
      compressed[name] = { br: br.length, gzip: gz.length }
    }
  }
  await visit(output)
  const manifest = { source: relative(root, source), upstreamCommit: '016b39d7fdcc30bfacee31ea5541498ac53921c6',
    math: { sha256: sha(math), bytes: Buffer.byteLength(math) }, layout: { guestBytes: Buffer.byteLength(layout.guest), hostBytes: Buffer.byteLength(layout.host) },
    entry: { file: `assets/${scriptName}`, original: scriptPath },
    runtime: { file: runtimeFile, original: runtimePath },
    styles: { file: `assets/${cssName}`, fallbackFont: `assets/${fontName}`, icons: `assets/${iconName}`, originalIcons: iconPath, originalBytes: Buffer.byteLength(originalCss), bytes: Buffer.byteLength(css) }, files, compressed }
  await writeFile(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await buildDesignEditor()))

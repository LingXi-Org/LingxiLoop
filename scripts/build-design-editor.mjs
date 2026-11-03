import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { buildArtifactMath, buildDesignMathAssets } from './build-artifact-math.mjs'
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

/** Three pinned source-string consumers are already asynchronous, or enter
 * through the existing promise queue. Preserve each program byte-for-byte and
 * let that consumer fetch it, rather than initializing unused code at open. */
export function splitOptionalDesignSources(source) {
  const tree = ts.createSourceFile('design.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const ids = { LO: 'svgCapture', jO: 'propertyScrubber', NO: 'standaloneExport' }
  const files = new Map(), programs = {}, edits = []
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ids[node.name.text]) {
      assert.ok(node.initializer && (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer)), 'pinned Design program literal changed')
      const bytes = Buffer.from(node.initializer.text), sha256 = sha(bytes), file = `design-${sha256}.js`
      files.set(file, bytes)
      programs[ids[node.name.text]] = { file, bytes: bytes.length, sha256, integrity: `sha256-${createHash('sha256').update(bytes).digest('base64')}` }
      edits.push([node.initializer.getStart(tree), node.initializer.end])
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  assert.equal(edits.length, 3, 'pinned Design optional programs changed')
  for (const [start, end] of edits.sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + '""' + source.slice(end)
  const changes = [
    ['let X=e.injected_svgCapture;', 'let X=await __lingxiDesignSource("svgCapture");'],
    ['let k=(0,e.componentTypeCandidates)(v);x=h()?await i', 'let k=(0,e.componentTypeCandidates)(v);if(h()){try{e.propertyScrubberSource=await __lingxiDesignSource("propertyScrubber")}catch{return []}}x=h()?await i'],
    ['${e.standaloneExportBootstrapScript}', '${await __lingxiDesignSource("standaloneExport")}'],
  ]
  for (const [needle, value] of changes) {
    assert.equal(source.split(needle).length, 2, `pinned Design optional consumer changed: ${needle}`)
    source = source.replace(needle, () => value)
  }
  const prelude = `const __lingxiDesignPrograms=${JSON.stringify(programs)},__lingxiDesignSourcePending=new Map;function __lingxiDesignSource(id){let p=__lingxiDesignSourcePending.get(id);if(!p){const item=__lingxiDesignPrograms[id],origin=new URL(document.querySelector('meta[name="dc-runtime-file"]').content,document.baseURI).origin;p=fetch(origin+"/artifact-editor/design-assets/"+item.file,{credentials:"omit",mode:"cors",signal:AbortSignal.timeout(30000),integrity:item.integrity}).then(r=>{if(!r.ok)throw Error("Editor resource unavailable");return r.text()}).catch(e=>{__lingxiDesignSourcePending.delete(id);throw e});__lingxiDesignSourcePending.set(id,p)}return p}\n`
  return { source: prelude + source, files, programs }
}

/** Keep asynchronous online math out of the synchronous preview source contract.
 * Resolve the trusted origin at the grant shell, before serializing child code. */
export function adaptOnlineDesignMath(source, assets, guest, offlineFile, offlineIntegrity) {
  const origin = `new URL(document.querySelector('meta[name="dc-runtime-file"]').content,document.baseURI).origin`
  const needle = 'supportJs:e.dcSupportSource}'
  assert.equal(source.split(needle).length, 2, 'pinned Design math source hook changed')
  const start = '\n;(' + assets.loader + ')('
  source = source.replace(needle, () => `supportJs:e.dcSupportSource+${JSON.stringify(start)}+JSON.stringify(${origin})+${JSON.stringify(');'+guest)}}`)
  const offline = 'let se=le.querySelector("template#__bundler_thumbnail")'
  assert.equal(source.split(offline).length, 2, 'pinned Design offline assembly hook changed')
  source = source.replace(offline, () => `let __math=le.createElement("script");__math.textContent="window.__lingxiMathOffline=true;"+await __lingxiOfflineMath();le.head.prepend(__math);${offline}`)
  const capture = 'return e.imageCaptureRuntimeScript.replace(/__[A-Z]+__/g,M=>T[M]??M)'
  assert.equal(source.split(capture).length, 2, 'pinned Design capture assembly hook changed')
  source = source.replace(capture, () => `return "(async()=>{await Promise.resolve(window.__lingxiMathReady);await document.fonts.ready;return ("+e.imageCaptureRuntimeScript.replace(/__[A-Z]+__/g,M=>T[M]??M)+");})()"`)
  return `let __lingxiOfflineMathPending;function __lingxiOfflineMath(){return __lingxiOfflineMathPending??=(fetch(${origin}+${JSON.stringify('/artifact-editor/design-assets/'+offlineFile)},{credentials:"omit",mode:"cors",signal:AbortSignal.timeout(30000),integrity:${JSON.stringify(offlineIntegrity)}}).then(r=>{if(!r.ok)throw Error("Offline formula resource unavailable");return r.text()}).catch(e=>{__lingxiOfflineMathPending=undefined;throw e}))}\n` + source
}

/** Package the pinned editor with the shared math enhancement and unchanged canvas model. */
export async function buildDesignEditor() {
  const { math } = await buildArtifactMath()
  const layout = await buildDesignLayout()
  const mathAssets = await buildDesignMathAssets()
  const offlineFile = `design-${sha(math)}.js`
  const offlineIntegrity = `sha256-${createHash('sha256').update(math).digest('base64')}`
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
  const split = splitOptionalDesignSources(await readFile(resolve(source, scriptPath), 'utf8'))
  const catalog = { ...JSON.parse(await readFile(resolve(root, 'third_party/baoyu-design/host/slides-zh-CN.json'), 'utf8')), ...JSON.parse(await readFile(resolve(root, 'third_party/baoyu-design/host/design-zh-CN.json'), 'utf8')) }
  const script = Buffer.from(translateDesign(adaptDesignHostCapabilities(adaptDesignLayout(adaptVisibleDesignMount(adaptDesignRuntimeUrl(adaptOnlineDesignMath(split.source, mathAssets, layout.guest, offlineFile, offlineIntegrity))), layout.host)), catalog))
  const scriptName = `design-${sha(script)}.js`
  const publicBase = '__LINGXI_DESIGN_ASSET_ORIGIN__/artifact-editor/design-assets/'
  const runtimePath = 'artifact-type/dc-runtime.js'
  const runtime = Buffer.from(await readFile(resolve(source, runtimePath), 'utf8') + '\n;' + layout.guest + ';(' + mathAssets.loader + ')(new URL(document.currentScript.src).origin);')
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
  for (const [name, bytes] of split.files) await writeFile(resolve(output, 'assets', name), bytes)
  for (const [name, bytes] of mathAssets.files) await writeFile(resolve(output, 'assets', name), bytes)
  await writeFile(resolve(output, 'assets', offlineFile), math)
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
  await writeFile(resolve(output, 'third-party-licenses.txt'), '\nKaTeX 0.16.47 (MIT)\n' + await readFile(resolve(root, 'node_modules/katex/LICENSE'), 'utf8'), { flag: 'a' })
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
    optionalPrograms: split.programs,
    math: { sha256: sha(math), bytes: Buffer.byteLength(math), offlineFile, onlineFile: mathAssets.onlineFile, onlineBytes: mathAssets.onlineBytes, loaderBytes: Buffer.byteLength(mathAssets.loader) }, layout: { guestBytes: Buffer.byteLength(layout.guest), hostBytes: Buffer.byteLength(layout.host) },
    entry: { file: `assets/${scriptName}`, original: scriptPath },
    runtime: { file: runtimeFile, original: runtimePath },
    styles: { file: `assets/${cssName}`, fallbackFont: `assets/${fontName}`, icons: `assets/${iconName}`, originalIcons: iconPath, originalBytes: Buffer.byteLength(originalCss), bytes: Buffer.byteLength(css) }, files, compressed }
  await writeFile(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await buildDesignEditor()))

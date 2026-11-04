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

/** The browser-only namespace is closed over the pinned factories. Remove
 * unread aliases without renaming functions, reordering initialization or
 * changing native function bodies used by source-string consumers. */
export async function optimizeDesignBrowserRuntime(source, { expectedFactories = 663 } = {}) {
  const filename = '/design-browser-runtime.js', options = {allowJs:true, noLib:true, noResolve:true, target:ts.ScriptTarget.ESNext}
  const host = ts.createCompilerHost(options)
  host.getSourceFile = (name, version) => name === filename ? ts.createSourceFile(name, source, version, true, ts.ScriptKind.JS) : undefined
  const program = ts.createProgram([filename], options, host), tree = program.getSourceFile(filename), checker = program.getTypeChecker()
  const boot = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'nW')
  const helper = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 't')
  assert.ok(boot && helper, 'pinned Design private runtime constructor changed')
  assert.equal(helper.getText(tree), 'function t(e,a,n,u){Object.defineProperty(e,a,{enumerable:!0,configurable:!0,get:n,...u?{set:u}:{}})}', 'pinned Design alias registration changed')
  const helperSymbol = checker.getSymbolAtLocation(helper.name), bootSymbol = checker.getSymbolAtLocation(boot.name)
  const factories = new Set(), arrays = []
  const scan = (node, visit) => { visit(node);ts.forEachChild(node, child => scan(child, visit)) }
  scan(boot, node => {
    if (ts.isArrayLiteralExpression(node) && node.elements.length === expectedFactories && node.elements.every(ts.isCallExpression)) arrays.push(node)
  })
  assert.equal(arrays.length, 1, 'pinned Design factory registry changed')
  for (const call of arrays[0].elements) {
    assert.ok(ts.isIdentifier(call.expression) && call.arguments.length === 1 && ts.isIdentifier(call.arguments[0]), 'pinned Design factory call changed')
    factories.add(call.expression.text)
  }
  assert.equal(factories.size, expectedFactories, 'pinned Design factory count changed')
  const namespaceSymbol = checker.getSymbolAtLocation(arrays[0].elements[0].arguments[0])
  let bootCalls = 0
  scan(tree, node => {
    if (!ts.isIdentifier(node) || node === boot.name || checker.getSymbolAtLocation(node) !== bootSymbol) return
    assert.ok(ts.isCallExpression(node.parent) && node.parent.expression === node && ts.isExpressionStatement(node.parent.parent), 'Design private constructor escapes the browser entry')
    bootCalls++
  })
  assert.equal(bootCalls, 1, 'Design private constructor usage changed')
  scan(boot, node => {
    if (!ts.isIdentifier(node) || checker.getSymbolAtLocation(node) !== namespaceSymbol) return
    const parent = node.parent
    if (ts.isVariableDeclaration(parent) && parent.name === node) return
    if (ts.isReturnStatement(parent) && parent.expression === node) return  // Its sole caller ignores the result.
    assert.ok(ts.isCallExpression(parent) && parent.arguments[0] === node && (factories.has(parent.expression.getText(tree)) || parent.expression.getText(tree) === 'VO'), 'Design private namespace escapes its constructor')
  })
  const registrars = new Set(factories)
  scan(boot, node => {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'VO'
      && checker.getSymbolAtLocation(node.arguments[0]) === namespaceSymbol) registrars.add('VO')
  })
  const bindings = [], reads = new Set(), declarations = new Map()
  const receiverCalls = new Set(), reviewedReceiverCalls = new Set(['sheetFrameHeight','npm_useLabelableContext_xl','buildCaptureTemplate','toPercent','hueName','isOpenLinkClick','artifactLinkFromAnnotation','finiteProbeNumber'])
  const isBinding = node => ts.isCallExpression(node) && checker.getSymbolAtLocation(node.expression) === helperSymbol
    && node.arguments.length >= 3 && ts.isStringLiteral(node.arguments[1]) && ts.isArrowFunction(node.arguments[2])
  // Keep names mentioned by non-namespace consumers as well. This conservative
  // superset protects native receiver calls and static protocol/name tables.
  scan(tree, node => {
    if (ts.isPropertyAccessExpression(node)) reads.add(node.name.text)
    if (ts.isStringLiteral(node) && !(isBinding(node.parent) && node.parent.arguments[1] === node)) reads.add(node.text)
    if (ts.isFunctionDeclaration(node) && registrars.has(node.name?.text)) declarations.set(node.name.text, node)
  })
  assert.equal(declarations.size, registrars.size, 'Design private factory definitions changed')
  const factorySymbols = new Map([...declarations.values()].map(factory => [checker.getSymbolAtLocation(factory.name), factory]))
  scan(tree, node => {
    if (!ts.isIdentifier(node)) return
    const factory = factorySymbols.get(checker.getSymbolAtLocation(node))
    if (!factory || node === factory.name) return
    let owner = node.parent
    while (owner && !ts.isFunctionDeclaration(owner)) owner = owner.parent
    assert.ok(owner === boot && ts.isCallExpression(node.parent) && node.parent.expression === node, 'Design private factory escapes its constructor')
  })
  for (const factory of declarations.values()) {
    const parameter = factory.parameters[0]?.name
    assert.ok(parameter && ts.isIdentifier(parameter), 'Design private factory parameter changed')
    const symbol = checker.getSymbolAtLocation(parameter)
    scan(factory, node => {
      if (ts.isCallExpression(node)) {
        let callee = node.expression
        while (ts.isParenthesizedExpression(callee)) callee = callee.expression
        // Direct eval could read a namespace name without a bound identifier
        // in this AST. Fail closed before removing any alias in that scope.
        assert.ok(!(ts.isIdentifier(callee) && callee.text === 'eval'), 'Design private namespace uses direct eval')
      }
      if (isBinding(node) && checker.getSymbolAtLocation(node.arguments[0]) === symbol) {
        // Never discard an argument with registration-time side effects.
        if (node.arguments.length === 3 || node.arguments.length === 4 && ts.isArrowFunction(node.arguments[3]))
          bindings.push({name:node.arguments[1].text, start:node.getStart(tree), end:node.end})
      }
      if (!ts.isIdentifier(node) || node === parameter || checker.getSymbolAtLocation(node) !== symbol) return
      const parent = node.parent
      if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
        if (ts.isCallExpression(parent.parent) && parent.parent.expression === parent) {
          assert.ok(reviewedReceiverCalls.has(parent.name.text), `Design private namespace receiver needs review: ${parent.name.text}`)
          receiverCalls.add(parent.name.text)
        }
        return
      }
      if (isBinding(parent) && parent.arguments[0] === node) return
      throw Error(`Design private namespace needs review: ${factory.name.text}: ${parent.getText(tree).slice(0,100)}`)
    })
  }
  const removed = bindings.filter(binding => !reads.has(binding.name))
  for (const binding of removed.sort((a,b) => b.start - a.start)) source = source.slice(0,binding.start) + 'void 0' + source.slice(binding.end)
  return {source, factories:expectedFactories, bindings:bindings.length, removedBindings:removed.length, removedNames:removed.map(binding => binding.name), receiverCalls:[...receiverCalls]}
}

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

/** Exact first-editor programs keep their native synchronous string API after
 * one explicit preparation boundary. Optional capture/property/export sources
 * stay at their existing asynchronous consumers. */
export function splitCriticalDesignSources(source) {
  const tree = ts.createSourceFile('design.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const ids = { IO: 'react', FO: 'reactDom', OO: 'support', MO: 'picker' }
  const files = new Map(), programs = {}, edits = []
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ids[node.name.text]) {
      assert.ok(node.initializer && (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer)), 'pinned Design critical program changed')
      const id = ids[node.name.text], text = node.initializer.text, bytes = Buffer.from(text)
      assert.equal(bytes.toString(), text, 'critical program must survive UTF-8 losslessly')
      const sha256 = sha(bytes), file = `design-${sha256}.js`
      files.set(file, bytes);programs[id] = { file, bytes: bytes.length, sha256, integrity: `sha256-${createHash('sha256').update(bytes).digest('base64')}` }
      edits.push([node.initializer.getStart(tree), node.initializer.end, `globalThis.__lingxiDesignStartup.sources.${id}`])
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  assert.equal(edits.length, 4, 'pinned Design critical source count changed')
  for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + replacement + source.slice(end)
  return { source, programs, files }
}

/** Serialized into the trusted grant shell. Public code only, four fixed
 * build-time resources. Native initialization starts once all are available;
 * failed preparation never replaces an initialized document. */
export function createDesignStartup(programs, host = globalThis) {
  const sources = Object.create(null), requests = new Map()
  let pending, status = 'loading', start, started = false, notice, line, button, notified = false
  const doc = host.document
  function render() {
    const root = doc?.getElementById('root')
    if (!root || started) return
    if (status === 'loading' && !notice) return
    if (!notice) {
      notice = doc.createElement('section');notice.setAttribute('data-lingxi-design-preparation', '')
      notice.style.cssText = 'margin:24px;padding:20px;font:14px/1.6 system-ui;color:var(--cds-fg,#333);background:var(--cds-bg,#fff);border-radius:12px'
      line = doc.createElement('p');line.setAttribute('role', 'alert')
      button = doc.createElement('button');button.type = 'button';button.textContent = '重试'
      button.style.cssText = 'margin-top:8px;padding:6px 14px;cursor:pointer'
      button.addEventListener('click', () => { void prepare() })
      notice.append(line, button);root.replaceChildren(notice)
    }
    line.textContent = status === 'failed' ? '编辑器暂时无法加载，请重试。' : '正在准备编辑器…'
    button.disabled = status === 'loading'
    // Reuse the existing, source/origin-checked host failure and fresh-grant
    // retry. Wait until the main module is cached before signalling failure.
    if (status === 'failed' && start && !notified && host.parent && host.parent !== host) {
      notified = true;host.parent.postMessage({ __lingxi_design_resource_error: true }, '*')
    }
  }
  function boot() {
    if (!started && start && status === 'ready') {
      started = true;notice?.remove();start()
    }
  }
  function read(id, item) {
    let request = requests.get(id)
    if (!request) {
      request = host.fetch(item.url, { credentials: 'omit', mode: 'cors', cache: 'force-cache',
        integrity: item.integrity, signal: AbortSignal.timeout(30_000) })
        .then(response => { if (!response.ok) throw Error('required editor program unavailable');return response.text() })
        .then(text => { sources[id] = text })
        .catch(error => { if (requests.get(id) === request) requests.delete(id);throw error })
      requests.set(id, request)
    }
    return request
  }
  function prepare() {
    if (pending) return pending
    status = 'loading';notified = false;render()
    pending = Promise.all(Object.entries(programs).map(([id, item]) => read(id, item))).then(() => {
      status = 'ready';boot();return true
    }, () => { status = 'failed';pending = undefined;render();return false })
    return pending
  }
  const controller = { sources, prepare, get status() { return status }, run(callback) {
    if (start || started) return
    start = callback;render();boot()
  } }
  doc?.addEventListener('DOMContentLoaded', render, { once: true })
  void prepare()
  return controller
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
  const productTheme = await readFile(resolve(root, 'third_party/baoyu-design/host/design-theme.css'), 'utf8')
  const productFonts = (await readFile(resolve(root, 'src/styles/fonts.css'), 'utf8')).replaceAll('/fonts/mingli/', './')
  const css = originalCss.replace(embedded[0], `./${fontName}`).replace(`./${iconPath}`, `./${iconName}`) + '\n' + productFonts + '\n' + productTheme
  const cssName = `design-${sha(css)}.css`
  const scriptPath = /src="\.\/(assets\/[^"/]+\.js)"/.exec(originalHtml)?.[1]
  assert.ok(scriptPath, 'Expected the pinned editor entry')
  const critical = splitCriticalDesignSources(await readFile(resolve(source, scriptPath), 'utf8'))
  const split = splitOptionalDesignSources(critical.source)
  const catalog = { ...JSON.parse(await readFile(resolve(root, 'third_party/baoyu-design/host/slides-zh-CN.json'), 'utf8')), ...JSON.parse(await readFile(resolve(root, 'third_party/baoyu-design/host/design-zh-CN.json'), 'utf8')) }
  const nativeSource = translateDesign(adaptDesignHostCapabilities(adaptDesignLayout(adaptVisibleDesignMount(adaptDesignRuntimeUrl(adaptOnlineDesignMath(split.source, mathAssets, layout.guest, offlineFile, offlineIntegrity))), layout.host)), catalog)
  const {source: browserSource, ...browserRuntime} = await optimizeDesignBrowserRuntime(nativeSource)
  // Keep the original module's lexical/top-level execution model. Wrapping
  // the whole native entry in a function can trigger a second V8 parse when
  // that function is called immediately after preparation.
  const script = Buffer.from('await new Promise(resolve=>globalThis.__lingxiDesignStartup.run(resolve));\n' + browserSource + '\nglobalThis.dispatchEvent(new Event("lingxi:design-runtime-ready"));\n')
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
  await cp(resolve(root, 'public/fonts/mingli'), resolve(output, 'assets'), { recursive: true })
  await writeFile(resolve(output, 'assets', fontName), font)
  await writeFile(resolve(output, 'assets', iconName), icon)
  await writeFile(resolve(output, 'assets', scriptName), script)
  await writeFile(resolve(output, runtimeFile), runtime)
  for (const [name, bytes] of critical.files) await writeFile(resolve(output, 'assets', name), bytes)
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
  const programs = Object.fromEntries(Object.entries(critical.programs).map(([id, item]) => [id, { url: publicBase + item.file, integrity: item.integrity }]))
  const startup = `<script>globalThis.__lingxiDesignStartup=(${createDesignStartup.toString()})(${JSON.stringify(programs)});</script>`
  const html = originalHtml.replace('<head>', '<head>' + startup).replace('<html lang="en"', '<html lang="zh-CN"').replace('>Loading…</p>', '>正在加载…</p>').replace(`./${cssPath}`, `${publicBase}${cssName}`).replace(`./${scriptPath}`, `${publicBase}${scriptName}`)
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
    startupPrograms: critical.programs, optionalPrograms: split.programs, browserRuntime,
    math: { sha256: sha(math), bytes: Buffer.byteLength(math), offlineFile, onlineFile: mathAssets.onlineFile, onlineBytes: mathAssets.onlineBytes, loaderBytes: Buffer.byteLength(mathAssets.loader) }, layout: { guestBytes: Buffer.byteLength(layout.guest), hostBytes: Buffer.byteLength(layout.host) },
    entry: { file: `assets/${scriptName}`, original: scriptPath },
    runtime: { file: runtimeFile, original: runtimePath },
    styles: { file: `assets/${cssName}`, fallbackFont: `assets/${fontName}`, icons: `assets/${iconName}`, originalIcons: iconPath, originalBytes: Buffer.byteLength(originalCss), bytes: Buffer.byteLength(css) }, files, compressed }
  await writeFile(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await buildDesignEditor()))

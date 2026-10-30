import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const upstream = resolve(root, 'third_party/baoyu-design/upstream/claude-slides/scripts/editor')
const output = resolve(root, 'server/assets/slides-editor')
const sourceName = 'index-BSIksl9u.js'
const hash = value => createHash('sha256').update(value).digest('hex')

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, `Pinned Slides patch changed: ${before}`)
  return source.replace(before, () => after)
}

const textProperties = new Set(['defaultMessage', 'label', 'title', 'placeholder', 'tooltip', 'tip', 'children', 'aria-label', 'description', 'defaultValue'])

// Translate only editor copy, never enum values, keyboard names or document data.
export function translateSlides(source, catalog) {
  const tree = ts.createSourceFile('slides.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const propertyLabels = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'rz')
  const edits = []
  const messages = new Set()
  function visit(node) {
    if ((ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isNoSubstitutionTemplateLiteral(node))
      && Object.hasOwn(catalog, node.text)) {
      const text = catalog[node.text].replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${')
      edits.push([node.getStart(tree), node.end, (ts.isTemplateHead(node) || ts.isNoSubstitutionTemplateLiteral(node) ? '`' : '}')
        + text + (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) ? '${' : '`')])
    }
    if (ts.isStringLiteral(node)) {
      const parent = node.parent
      let owner = parent
      let child = node
      while ((ts.isConditionalExpression(owner) && owner.condition !== child)
        || (ts.isBinaryExpression(owner) && (owner.operatorToken.kind === ts.SyntaxKind.PlusToken
          || ([ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(owner.operatorToken.kind) && owner.right === child)))
        || (ts.isCallExpression(owner) && owner.arguments.includes(child))
        || ts.isArrayLiteralExpression(owner) || ts.isParenthesizedExpression(owner)) {
        child = owner
        owner = owner.parent
      }
      const property = ts.isPropertyAssignment(owner) ? owner.name.getText(tree).replaceAll('"', '')
        : ts.isBindingElement(owner) ? (owner.propertyName ?? owner.name).getText(tree) : ''
      const untranslated = ts.isCallExpression(parent) && parent.expression.getText(tree) === '(0,e.untranslatedMessage)'
      const cdsFallback = ts.isCallExpression(parent) && parent.arguments[1] === node
        && ['(0,e.useTranslation)', 'Na'].includes(parent.expression.getText(tree))
      const literalCopy = ts.isCallExpression(parent) && parent.expression.getText(tree) === '(0,e.literalMessage)' && ['File', 'the agent'].includes(node.text)
      const sharedLabel = propertyLabels && node.pos >= propertyLabels.pos && node.end <= propertyLabels.end
      const table = ts.isPropertyAssignment(parent) && ts.isObjectLiteralExpression(parent.parent) ? parent.parent : null
      const keys = table?.properties.map(item => item.name?.getText(tree)) ?? []
      const labelTable = (keys.includes('display') && keys.includes('h1')) || (keys.includes('rect') && keys.includes('rounded'))
        || (keys.includes('good') && keys.includes('warn')) || (keys.includes('top') && keys.includes('bottom'))
        || (keys.length >= 8 && keys.every(key => /^\d+$/.test(key)))
      if (property === 'defaultMessage') {
        assert.ok(Object.hasOwn(catalog, node.text), `Missing Slides translation: ${node.text}`)
        messages.add(node.text)
      }
      if ((textProperties.has(property) || untranslated || cdsFallback || literalCopy || sharedLabel || labelTable || node.text.includes(' ')) && Object.hasOwn(catalog, node.text)) {
        const translated = untranslated && ['Left', 'Right'].includes(node.text) ? (node.text === 'Left' ? '左栏' : '右栏')
          : (sharedLabel || keys.includes('top')) && ['Left', 'Right'].includes(node.text) ? (node.text === 'Left' ? '左' : '右') : catalog[node.text]
        edits.push([node.getStart(tree), node.end, JSON.stringify(translated)])
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  for (const [start, end, text] of edits.reverse()) source = source.slice(0, start) + text + source.slice(end)
  return { source, messageCount: messages.size }
}

export async function buildSlidesEditor() {
  const original = await readFile(resolve(upstream, 'assets', sourceName), 'utf8')
  const manifest = JSON.parse(await readFile(resolve(upstream, '../../../..', 'manifest.json'), 'utf8'))
  const pinned = manifest.files.find(file => file.path.endsWith(`/claude-slides/scripts/editor/assets/${sourceName}`))
  assert.equal(hash(original), pinned.sha256, 'Slides source must match the pinned upstream before applying native adaptations')
  const catalog = JSON.parse(await readFile(resolve(root, 'third_party/baoyu-design/host/slides-zh-CN.json'), 'utf8'))
  let { source, messageCount } = translateSlides(original, catalog)

  // Desktop dialogs use this hook without mounting a sheet. Initialize its React
  // namespace and contexts before the hook is first called, on either layout.
  source = replaceOnce(source, 'function ar(it){let lr=D.useContext', 'function ar(it){O();let lr=D.useContext')
  source = replaceOnce(source, 'children:this.state.error', 'children:"当前编辑内容未能渲染。"')
  source = replaceOnce(source, 'c=new Map,s="en-US",h=M({locale:s,messages:{}})', 'c=new Map,s="zh-CN",h=M({locale:s,messages:{}})')
  source = replaceOnce(source, 'uH(dH(t.location.search))', 'uH(dH(t.location.search)??"zh-Hans")')

  // The pinned PPTX vendor is self-contained apart from this CommonJS helper.
  const libraryStart = source.indexOf('function X0(')
  const libraryEnd = source.indexOf('function E4(')
  assert.ok(libraryStart > 0 && libraryEnd > libraryStart)
  const pptx = 'function kv(e){return e&&e.__esModule&&Object.prototype.hasOwnProperty.call(e,"default")?e.default:e}'
    + source.slice(libraryStart, libraryEnd) + '\nexport default pm;'
  source = source.slice(0, libraryStart) + source.slice(libraryEnd)
  source = replaceOnce(source, 'e.PptxPresentation=pm,', 'e.loadPptx=async()=>{e.PptxPresentation??=(await import("./pptx-library.js")).default},')
  source = replaceOnce(source, 'async function Ve(Ce,De){let{pptx:ct,warnings:Oe}=ua(Ce,De)', 'async function Ve(Ce,De){await e.loadPptx();let{pptx:ct,warnings:Oe}=ua(Ce,De)')
  source = replaceOnce(source, 'let n=(0,e.createPptxPresentation)(s)', 'await e.loadPptx();let n=(0,e.createPptxPresentation)(s)')

  const tree = ts.createSourceFile('slides.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const workerFunction = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'UB')
  assert.ok(workerFunction)
  let worker
  function findWorker(node) {
    if (ts.isNoSubstitutionTemplateLiteral(node) && node.text.length > 300_000) {
      assert.equal(worker, undefined)
      worker = node
    }
    ts.forEachChild(node, findWorker)
  }
  findWorker(workerFunction)
  assert.ok(worker)
  source = source.slice(0, worker.getStart(tree)) + '""' + source.slice(worker.end)
  source = replaceOnce(source, 'function UB(e){var t,r,l;async function i(){return t}', 'function UB(e){var t,r,l;async function i(){return t||(t=(await import("./video-worker-source.js")).default)}')

  const virtual = { 'slides.js': source, 'pptx-library.js': pptx, 'video-worker-source.js': `export default ${JSON.stringify(worker.text)};` }
  const originalTree = ts.createSourceFile('original.js', original, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const interop = originalTree.statements.filter(node => ts.isFunctionDeclaration(node) && ['kv', 'aV'].includes(node.name?.text))
    .map(node => node.getText(originalTree)).join('\n') + '\nexport {kv as a,aV as g};'
  virtual['interop.js'] = interop
  virtual['slides.js'] = replaceOnce(source, 'export{kv as a,aV as g};', '')
  virtual['woff2-decoder.js'] = (await readFile(resolve(upstream, 'assets/woff2-decoder-BGQ3SeZf.js'), 'utf8'))
    .replace('./index-BSIksl9u.js', './interop.js')
  const result = await build({
    absWorkingDir: root, entryPoints: [{ in: './slides.js', out: 'editor' }],
    outdir: resolve(output, 'assets'), entryNames: 'editor-[hash]', chunkNames: '[name]-[hash]',
    bundle: true, splitting: true, format: 'esm', platform: 'browser', target: ['chrome120', 'firefox120', 'safari17'],
    minify: true, legalComments: 'inline', metafile: true, write: false, external: ['fs', 'https'],
    plugins: [{ name: 'native-slides', setup(builder) {
      builder.onResolve({ filter: /^\.\/(slides|pptx-library|video-worker-source|interop)\.js$/ }, ({ path }) => ({ path: path.slice(2), namespace: 'native-slides' }))
      builder.onResolve({ filter: /\/woff2-decoder-BGQ3SeZf\.js$/ }, () => ({ path: 'woff2-decoder.js', namespace: 'native-slides' }))
      builder.onLoad({ filter: /.*/, namespace: 'native-slides' }, ({ path }) => ({ contents: virtual[path], resolveDir: resolve(upstream, 'assets'), loader: 'js' }))
    } }],
  })
  await mkdir(resolve(output, 'assets'), { recursive: true })
  for (const file of result.outputFiles) await writeFile(file.path, file.contents)
  const entry = Object.entries(result.metafile.outputs).find(([name]) => /\/editor-[A-Z0-9]+\.js$/.test(name))
  assert.ok(entry)
  const entryFile = result.outputFiles.find(file => resolve(file.path) === resolve(root, entry[0]))
  assert.ok(entryFile)
  const entryName = entryFile.path.split(/[\\/]/).at(-1)
  const initial = new Set()
  function addInitial(name) {
    if (initial.has(name)) return
    initial.add(name)
    for (const item of result.metafile.outputs[name].imports) if (item.kind !== 'dynamic-import' && !item.external) addInitial(item.path)
  }
  addInitial(entry[0])
  let html = await readFile(resolve(upstream, 'index.html'), 'utf8')
  html = html.replace('lang="en"', 'lang="zh-CN"').replace('<title>Slides</title>', '<title>演示文稿</title>')
    .replace(`./assets/${sourceName}`, `/artifact-editor/slides-assets/${entryName}`)
    .replace('./assets/index-DooSdFer.css', '/artifact-editor/slides-assets/index-DooSdFer.css')
  html = html.replace('</head>', [...initial].filter(name => name !== entry[0])
    .map(name => `<link rel="modulepreload" crossorigin href="/artifact-editor/slides-assets/${name.split('/').at(-1)}">`).join('') + '</head>')
  await writeFile(resolve(output, 'index.html'), html)
  for (const name of ['index-DooSdFer.css', 'anthropicons-fizzy-lake-yNspLiPZ.woff2']) {
    await copyFile(resolve(upstream, 'assets', name), resolve(output, 'assets', name))
  }
  await copyFile(resolve(upstream, 'third-party-licenses.txt'), resolve(output, 'third-party-licenses.txt'))
  const initialFiles = result.outputFiles.filter(file => initial.has(Object.keys(result.metafile.outputs).find(name => resolve(root, name) === file.path)))
  const report = { upstreamSha256: hash(original), messageCount, original: { bytes: Buffer.byteLength(original), gzip: gzipSync(original).length },
    entry: { file: entryName, bytes: entryFile.contents.length, gzip: gzipSync(entryFile.contents).length },
    initial: { bytes: initialFiles.reduce((sum, file) => sum + file.contents.length, 0), gzip: initialFiles.reduce((sum, file) => sum + gzipSync(file.contents).length, 0) },
    files: Object.fromEntries(result.outputFiles.map(file => [file.path.split(/[\\/]/).at(-1), { bytes: file.contents.length, sha256: hash(file.contents) }])) }
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify(report, null, 2) + '\n')
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await buildSlidesEditor(), null, 2))
}

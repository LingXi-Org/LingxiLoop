import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile, copyFile, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { build } from 'esbuild'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, 'server/assets/slides-editor')
const hash = value => createHash('sha256').update(value).digest('hex')

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

/** Compile maintained editor modules. Published bundles are archival evidence only. */
export async function buildSlidesEditor() {
  const sourceRoot = resolve(root, 'third_party/baoyu-design/slides-source')
  const recovered = JSON.parse(await readFile(resolve(sourceRoot, 'source-map.json'), 'utf8'))
  const browserBindings = await pruneBrowserBindings(sourceRoot)
  const result = await build({
    absWorkingDir: root, entryPoints: [{ in: resolve(sourceRoot, 'main.js'), out: 'editor' }],
    outdir: resolve(output, 'assets'), entryNames: 'editor-[hash]', chunkNames: '[name]-[hash]',
    bundle: true, splitting: true, format: 'esm', platform: 'browser', target: ['chrome120', 'firefox120', 'safari17'],
    minify: true, legalComments: 'inline', metafile: true, write: false, external: ['fs', 'https'],
    plugins: [{ name: 'private-runtime-exports', setup(builder) {
      builder.onLoad({ filter: /slides-source\/modules\/.*\.js$/ }, args => {
        const contents = browserBindings.sources.get(args.path)
        return contents === undefined ? null : { contents, loader: 'js' }
      })
    } }],
  })
  // Remove obsolete generated chunks, including retired video workers.
  await rm(output, { recursive: true, force: true })
  await mkdir(resolve(output, 'assets'), { recursive: true })
  for (const file of result.outputFiles) await writeFile(file.path, file.contents)
  // Keep the full fallback font, but let the browser request it only when a
  // glyph actually uses that face. The default editor uses FizzyLake icons.
  const sourceCss = await readFile(resolve(sourceRoot, 'editor.css'), 'utf8')
  const fontUrl = /data:font\/woff2;base64,([A-Za-z0-9+/=]+)/.exec(sourceCss)
  assert.ok(fontUrl, 'Expected pinned fallback icon font')
  const font = Buffer.from(fontUrl[1], 'base64')
  const fontName = `anthropicons-variable-${hash(font).slice(0,16)}.woff2`
  await writeFile(resolve(output, 'assets', fontName), font)
  const css = sourceCss.replace(fontUrl[0], `./${fontName}`)
  const cssName = `editor-${hash(css).slice(0,16)}.css`
  await writeFile(resolve(output, 'assets', cssName), css)
  const entry = Object.entries(result.metafile.outputs).find(([, meta]) => meta.entryPoint?.endsWith('/main.js'))
  assert.ok(entry)
  const entryFile = result.outputFiles.find(file => resolve(file.path) === resolve(root, entry[0]))
  const entryName = entryFile.path.split(/[\\/]/).at(-1)
  const initial = new Set()
  function addInitial(name) {
    if (initial.has(name)) return
    initial.add(name)
    for (const item of result.metafile.outputs[name].imports) if (item.kind !== 'dynamic-import' && !item.external) addInitial(item.path)
  }
  addInitial(entry[0])
  const html = (await readFile(resolve(sourceRoot, 'index.html'), 'utf8'))
    .replace('__EDITOR_ENTRY__', `/artifact-editor/slides-assets/${entryName}`)
    .replace('__EDITOR_STYLES__', `/artifact-editor/slides-assets/${cssName}`)
    .replace('</head>', [...initial].filter(name => name !== entry[0]).map(name =>
      `<link rel="modulepreload" crossorigin href="/artifact-editor/slides-assets/${name.split('/').at(-1)}">`).join('') + '</head>')
  await writeFile(resolve(output, 'index.html'), html)
  for (const name of ['anthropicons-fizzy-lake-yNspLiPZ.woff2']) {
    await copyFile(resolve(sourceRoot, name), resolve(output, 'assets', name))
  }
  await copyFile(resolve(sourceRoot, 'third-party-licenses.txt'), resolve(output, 'third-party-licenses.txt'))
  await build({ entryPoints: [resolve(sourceRoot, 'node/compiler.js')], outfile: resolve(output, 'node/compiler.cjs'),
    bundle: true, format: 'cjs', platform: 'node', target: ['node22'], legalComments: 'inline' })
  const compressed = {}
  for (const name of await readdir(resolve(output, 'assets'))) {
    if (!/\.(js|css)$/.test(name)) continue
    const bytes = await readFile(resolve(output, 'assets', name))
    const br = brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })
    const gzip = gzipSync(bytes, { level: 9 })
    await writeFile(resolve(output, 'assets', `${name}.br`), br)
    await writeFile(resolve(output, 'assets', `${name}.gz`), gzip)
    compressed[name] = { bytes: bytes.length, br: br.length, gzip: gzip.length }
  }
  const initialFiles = result.outputFiles.filter(file => initial.has(Object.keys(result.metafile.outputs).find(name => resolve(root, name) === file.path)))
  const report = { upstreamCommit: recovered.upstreamCommit, source: 'third_party/baoyu-design/slides-source',
    modules: recovered.modules.length, removedModules: recovered.removedModules, messageCount: recovered.translatedMessages,
    unusedBrowserBindings: browserBindings.removed,
    compressed, styles: { file: cssName, fallbackFont: fontName, fallbackFontBytes: font.length },
    original: { bytes: 4666628, gzip: 1508796 },
    entry: { file: entryName, bytes: entryFile.contents.length, gzip: gzipSync(entryFile.contents).length },
    initial: { bytes: initialFiles.reduce((sum, file) => sum + file.contents.length, 0), gzip: initialFiles.reduce((sum, file) => sum + gzipSync(file.contents).length, 0) },
    inputs: Object.keys(result.metafile.inputs),
    files: Object.fromEntries(result.outputFiles.map(file => [file.path.split(/[\\/]/).at(-1), { bytes: file.contents.length, sha256: hash(file.contents) }])) }
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify(report, null, 2) + '\n')
  return report
}

// The browser runtime is private to main.js. The recovered distribution also
// exports thousands of locals solely for its Node compiler/debug namespace.
// Removing unread browser getters lets esbuild discard their unreachable code;
// it does not skip initializers or change the Node compiler's public namespace.
// Include lazy exports and the host bridge when collecting consumers. A new
// computed runtime access must be reviewed explicitly instead of pruned blindly.
async function pruneBrowserBindings(sourceRoot) {
  const names = (await readdir(resolve(sourceRoot, 'modules'))).filter(name => name.endsWith('.js')).map(name => `modules/${name}`)
  names.push('runtime.js', 'exports.js', 'workspace-bridge.js')
  const files = await Promise.all(names.map(async name => {
    const path = resolve(sourceRoot, name), source = await readFile(path, 'utf8')
    return { path, source, tree: ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS) }
  }))
  const reads = new Set()
  for (const { tree } of files) {
    const visit = node => {
      const runtime = node.expression && ts.isIdentifier(node.expression) && ['runtime', 'runtime2'].includes(node.expression.text)
      if (runtime && ts.isElementAccessExpression(node)) throw new Error(`Computed private runtime access requires review: ${tree.fileName}`)
      if (runtime && ts.isPropertyAccessExpression(node)) reads.add(node.name.text)
      ts.forEachChild(node, visit)
    }
    visit(tree)
  }
  const sources = new Map()
  let removed = 0
  for (const { path, source, tree } of files) {
    const edits = []
    const visit = node => {
      if (ts.isCallExpression(node) && node.expression.getText(tree) === 'bindRuntimeValue') {
        // Factory-local export helpers can compute their key; retain them.
        if (ts.isStringLiteral(node.arguments[1]) && !reads.has(node.arguments[1].text)) {
          edits.push([node.getStart(tree), node.end]); removed++
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(tree)
    let compiled = source
    for (const [start, end] of edits.reverse()) compiled = compiled.slice(0, start) + 'void 0' + compiled.slice(end)
    sources.set(path, compiled)
  }
  return { sources, removed }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await buildSlidesEditor(), null, 2))
}

// Run after build-design-editor and build-slides-editor --metafile=<path>.
// Inventory actual output edges plus the pinned Design source-string consumers.
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const read = path => readFile(resolve(root, path), 'utf8')
const slidesGraph = JSON.parse(await read(process.argv[2]))
const design = JSON.parse(await read('server/assets/design-editor/manifest.json'))
const slides = JSON.parse(await read('server/assets/slides-editor/manifest.json'))
const originalPath = `${design.source}/${design.entry.original}`
const original = await read(originalPath)
const tree = ts.createSourceFile(originalPath, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const sha256 = text => createHash('sha256').update(text).digest('hex')
const programs = new Map()
const bindings = new Map()
const scan = (node, visitor) => { visitor(node); ts.forEachChild(node, child => scan(child, visitor)) }
scan(tree, node => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
    && node.initializer && (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))
    && node.initializer.text.length > 10000) {
    programs.set(node.name.text, { variable: node.name.text, bytes: Buffer.byteLength(node.initializer.text), sha256: sha256(node.initializer.text), runtimeBindings: [], consumers: [] })
  }
})
scan(tree, node => {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    && ts.isPropertyAccessExpression(node.left) && ts.isIdentifier(node.right) && programs.has(node.right.text)) {
    const program = programs.get(node.right.text)
    program.runtimeBindings.push(node.left.getText(tree))
    bindings.set(node.left.name.text, program)
  }
})
scan(tree, node => {
  if (!ts.isPropertyAccessExpression(node) || !bindings.has(node.name.text)
    || ts.isBinaryExpression(node.parent) && node.parent.left === node && node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) return
  const functions = []
  for (let owner = node.parent; owner && owner !== tree; owner = owner.parent) {
    if (ts.isFunctionDeclaration(owner) || ts.isFunctionExpression(owner)) functions.unshift(owner.name?.text ?? '<anonymous>')
  }
  bindings.get(node.name.text).consumers.push({ function: functions.join('/'), expression: node.getText(tree), offset: node.getStart(tree) })
})
const runtime = ts.createSourceFile('runtime.js', await read('third_party/baoyu-design/slides-source/runtime.js'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
let initializers = []
scan(runtime, node => {
  if (ts.isVariableDeclaration(node) && node.name.getText(runtime) === 'initializers' && ts.isArrayLiteralExpression(node.initializer)) {
    initializers = node.initializer.elements.map(item => item.expression.getText(runtime))
  }
})
const report = {
  upstreamCommit: design.upstreamCommit,
  design: { buildModel: 'One pinned monolithic entry plus synchronous runtime source strings; this is a consumer inventory, not a complete internal call graph.',
    entry: design.entry, runtime: design.runtime, math: design.math, optionalPrograms: design.optionalPrograms ?? {}, programs: [...programs.values()].sort((a, b) => b.bytes - a.bytes),
    files: design.files, compressed: design.compressed },
  slides: { buildModel: 'Actual esbuild browser metafile; dynamic imports and eager edges are distinguished by kind.',
    initial: slides.initial, entry: slides.entry, compressed: slides.compressed, initializers,
    inputs: slidesGraph.inputs, outputs: slidesGraph.outputs },
}
const file = resolve(root, process.argv[3]), bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n')
await writeFile(file, file.endsWith('.gz') ? gzipSync(bytes, { mtime: 0 }) : bytes)

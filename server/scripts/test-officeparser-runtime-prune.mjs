// Exercise destructive-prune guards on a disposable copy of a locked prod install.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const [dependencyArg, sourceArg] = process.argv.slice(2)
assert.ok(dependencyArg && sourceArg,
  'Usage: node test-officeparser-runtime-prune.mjs NODE_MODULES HOMEWORK_PRESENTATION_SOURCE')
const temporary = mkdtempSync(join(tmpdir(), 'officeparser-prune-guards-'))
const dependencies = join(temporary, 'node_modules')
const source = join(temporary, 'homework-presentation.ts')
const script = fileURLToPath(new URL('./prune-officeparser-runtime.mjs', import.meta.url))
try {
  cpSync(resolve(dependencyArg), dependencies, { recursive: true })
  cpSync(resolve(sourceArg), source)
  const require = createRequire(join(dependencies, 'officeparser/dist/index.js'))
  const { zipSync, strToU8 } = require('fflate')
  // Exercise the actual LingxiOS PDF/DOCX child-process consumer, using tiny
  // invented documents. Compare full outputs around the prune, not only imports.
  const paragraph = 'Synthetic document parser boundary'
  const docx = Buffer.from(zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${paragraph}</w:t></w:r></w:p></w:body></w:document>`),
  }))
  const stream = `BT /F1 12 Tf 20 100 Td (${paragraph}) Tj ET`
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]
  let pdfSource = '%PDF-1.4\n'
  const offsets = [0]
  for (const [index, body] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdfSource))
    pdfSource += `${index + 1} 0 obj\n${body}\nendobj\n`
  }
  const xref = Buffer.byteLength(pdfSource)
  pdfSource += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    + offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
    + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  const parserWorker = join(dependencies, '@lyyzka/lingxios/dist/src/context/document-worker.js')
  const parseDocuments = () => Object.fromEntries([['pdf', Buffer.from(pdfSource)], ['docx', docx]].map(([format, input]) => {
    const result = spawnSync(process.execPath, [parserWorker, format], { input, encoding: 'utf8', timeout: 20_000 })
    assert.ifError(result.error)
    assert.equal(result.status, 0, `${format}: ${result.stderr}`)
    assert.ok(result.stdout.includes(paragraph), `Missing ${format} extracted text`)
    const invalid = spawnSync(process.execPath, [parserWorker, format], { input: Buffer.from('synthetic corrupt document'), encoding: 'utf8', timeout: 20_000 })
    assert.ifError(invalid.error)
    assert.equal(invalid.status, 1)
    assert.equal(invalid.stdout, '')
    assert.match(invalid.stderr, /Document text extraction failed/)
    return [format, result.stdout]
  }))
  const tests = resolve(dirname(sourceArg), '../../__tests__')
  const copiedTests = join(temporary, 'server/src/__tests__')
  mkdirSync(copiedTests, { recursive: true })
  mkdirSync(join(temporary, 'server/src/modules/learning'), { recursive: true })
  cpSync(source, join(temporary, 'server/src/modules/learning/homework-presentation.ts'))
  cpSync(join(tests, 'homework-presentation.test.ts'), join(copiedTests, 'homework-presentation.test.ts'))
  cpSync(join(tests, 'fixtures/homework-presentations'), join(copiedTests, 'fixtures/homework-presentations'), { recursive: true })
  writeFileSync(join(temporary, 'package.json'), '{"type":"module"}\n')
  const presentations = () => {
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(require.resolve('tsx')).href,
      '--test', join(copiedTests, 'homework-presentation.test.ts')], { cwd: temporary, encoding: 'utf8', timeout: 30_000 })
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stdout + result.stderr)
    return result.stdout
  }
  const documentsBefore = parseDocuments()
  const presentationsBefore = presentations()
  const originalSource = readFileSync(source)
  const manifest = join(dependencies, 'officeparser/package.json')
  const originalManifest = readFileSync(manifest)
  const browser = join(dependencies, 'officeparser/dist/officeparser.browser.mjs')
  const invoke = () => spawnSync(process.execPath, [script, dependencies, source, '--apply'], { encoding: 'utf8' })
  const refuses = expected => {
    const result = invoke()
    assert.notEqual(result.status, 0, 'Guard accepted a changed consumer')
    assert.match(result.stderr, expected)
    assert.ok(existsSync(browser), 'Guard deleted an asset before completing validation')
  }
  writeFileSync(source, originalSource.toString().replace('ocr: false', 'ocr: true'))
  refuses(/Re-audit the product PPTX/)
  writeFileSync(source, originalSource)
  writeFileSync(manifest, originalManifest.toString().replace('"version": "8.2.0"', '"version": "8.2.1"'))
  refuses(/Re-audit changed dependency content/)
  writeFileSync(manifest, originalManifest)
  const ocr = join(dependencies, 'officeparser/dist/utils/ocrUtils.js')
  const originalOcr = readFileSync(ocr)
  writeFileSync(ocr, Buffer.concat([originalOcr, Buffer.from('\n// synthetic loader change\n')]))
  refuses(/Re-audit changed dependency content/)
  writeFileSync(ocr, originalOcr)
  const unexpected = join(dependencies, 'synthetic-consumer.js')
  writeFileSync(unexpected, 'import "tesseract.js"\n')
  refuses(/Re-audit additional installed/)
  rmSync(unexpected)
  const result = invoke()
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.removedFiles, 23)
  assert.equal(existsSync(browser), false)
  assert.ok(existsSync(join(dependencies, 'tesseract.js/dist/worker.min.js.LICENSE.txt')))
  assert.ok(existsSync(join(dependencies, 'tesseract.js-core/tesseract-core.js')))
  assert.ok(existsSync(join(dependencies, 'officeparser/node_modules/pdfjs-dist/legacy/web/pdf_viewer.mjs')))
  assert.deepEqual(parseDocuments(), documentsBefore, 'PDF/DOCX extracted output changed after trimming OfficeParser')
  const presentationsAfter = presentations()
  console.log(JSON.stringify({ guardedFailures: ['product OCR enabled', 'package version drift',
    'lazy OCR loader content drift', 'additional installed OCR consumer'],
    documentOutputBeforeAndAfter: documentsBefore, presentationsBefore, presentationsAfter,
    applied: report }, null, 2))
} finally {
  rmSync(temporary, { recursive: true, force: true })
}

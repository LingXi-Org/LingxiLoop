// Build trusted presentation test data from pinned source bytes. This does not
// execute the upstream assembler, validator, installer, kernel or example.
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
const sourceRoot = process.env.CASE_COVER_SOURCE_ROOT ?? process.cwd()
const moduleRoot = path.resolve(sourceRoot, 'server/src/modules/case-covers')
const vendor = path.join(moduleRoot, 'vendor')
const manifest = JSON.parse(await readFile(path.join(vendor, 'manifest.json'), 'utf8'))
if (manifest.commit !== '37d2e78dcb333ab30c3338e28ed4a690364ea014') throw new Error('unexpected Hairline pin')
async function pinned(file) {
  const content = await readFile(path.join(vendor, file), 'utf8')
  if (createHash('sha256').update(content).digest('hex') !== manifest.files[file]) throw new Error(`changed source: ${file}`)
  return content
}
const [kernel, figure] = await Promise.all([pinned('skills/hairline-create/kernel.js'), pinned('skills/hairline-create/examples/riffle.js')])
const { buildCoverPresentation } = await import(pathToFileURL(path.join(moduleRoot, 'cover-presentation.ts')).href)
const html = buildCoverPresentation({ kernel, figure, altText: '装有八张卡片的等距收纳托盘，可逐张抬起卡片' })
await mkdir('.e2e/case-cover', { recursive: true })
await writeFile('.e2e/case-cover/hairline.html', html)
await writeFile('.e2e/case-cover/source.json', JSON.stringify({ commit: manifest.commit, kernelSha256: manifest.files['skills/hairline-create/kernel.js'], figureSha256: manifest.files['skills/hairline-create/examples/riffle.js'], presentationSha256: createHash('sha256').update(html).digest('hex') }, null, 2))
console.log(`Prepared pinned trusted presentation fixture (${html.length} bytes).`)

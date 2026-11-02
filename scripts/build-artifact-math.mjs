import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const design = resolve(root,'third_party/baoyu-design/upstream/claude-design/scripts/editor')

/** The pinned editor uses the same support source for inline and blob fallback. */
export function adaptDesignMath(source, math) {
  const needle = 'supportJs:e.dcSupportSource}'
  assert.equal(source.split(needle).length,2,'pinned Design inline runtime hook changed')
  return source.replace(needle,`supportJs:e.dcSupportSource+${JSON.stringify('\n;'+math)}}`)
}

export async function buildArtifactMath() {
  // Inline only the installed WOFF2 faces. No font/CDN request can escape the
  // iframe policy, and a font failure cannot strand an otherwise loaded view.
  let css = await readFile(resolve(root,'node_modules/katex/dist/katex.min.css'),'utf8')
  for (const [rule,font] of [...css.matchAll(/src:url\(fonts\/([^)]*\.woff2)\)[^}]*?(?=})/g)]) {
    const bytes = await readFile(resolve(root,'node_modules/katex/dist/fonts',font))
    css = css.replace(rule,`src:url(data:font/woff2;base64,${bytes.toString('base64')}) format("woff2")`)
  }
  assert.ok(!css.includes('url(fonts/'),'all KaTeX font sources must be self-contained')
  const result = await build({absWorkingDir:root,stdin:{contents:`import {installArtifactMath} from './shared/artifact-math';installArtifactMath(${JSON.stringify(css)});`,resolveDir:root},bundle:true,format:'iife',platform:'browser',target:['chrome120','firefox120','safari17'],minify:true,legalComments:'inline',write:false})
  const math = result.outputFiles[0].text
  const output = resolve(root,'server/assets/visualize-runtime')
  await mkdir(output,{recursive:true})
  await writeFile(resolve(output,'math.js'),math)
  // Keep the archive immutable. Only two runtime injection points are adapted;
  // original project bytes, compiler, preview bridge and sandbox are unchanged.
  const dest = resolve(root,'server/assets/design-editor')
  await cp(design,dest,{recursive:true})
  let html = await readFile(resolve(dest,'index.html'),'utf8')
  const entry = html.match(/src="\.\/(assets\/index-[^"]+\.js)"/)?.[1]
  assert.ok(entry,'pinned Design entry missing')
  const adapted = adaptDesignMath(await readFile(resolve(design,entry),'utf8'),math)
  const name = `assets/editor-math-${createHash('sha256').update(adapted).digest('hex').slice(0,16)}.js`
  await writeFile(resolve(dest,name),adapted)
  const runtime = await readFile(resolve(design,'artifact-type/dc-runtime.js'),'utf8')
  const runtimeName = `artifact-type/dc-runtime-math-${createHash('sha256').update(runtime+math).digest('hex').slice(0,16)}.js`
  await writeFile(resolve(dest,runtimeName),runtime+'\n;'+math)
  html = html.replace(entry,name).replace('artifact-type/dc-runtime.js',runtimeName)
  await writeFile(resolve(dest,'index.html'),html)
  return {mathBytes:Buffer.byteLength(math),designEntry:name,runtime:runtimeName}
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) console.log(await buildArtifactMath())

import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

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
  return { math, mathBytes: Buffer.byteLength(math) }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) console.log({mathBytes:(await buildArtifactMath()).mathBytes})

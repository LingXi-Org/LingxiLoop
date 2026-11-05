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
  // KaTeX includes "$&" (including minified `$&&` identifiers). A replacement
  // string would expand those sequences and corrupt the fallback program.
  return source.replace(needle,()=>`supportJs:e.dcSupportSource+${JSON.stringify('\n;'+math)}}`)
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
  const output = resolve(root,'server/assets/artifact-math')
  await mkdir(output,{recursive:true})
  await writeFile(resolve(output,'math.js'),math)
  return { math, mathBytes: Buffer.byteLength(math) }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) console.log({mathBytes:(await buildArtifactMath()).mathBytes})

/** Online resources never carry base64 fonts or the offline renderer in entry. */
export async function buildDesignMathAssets() {
  const { createHash } = await import('node:crypto')
  const files = new Map()
  const name = bytes => `design-${createHash('sha256').update(bytes).digest('hex')}`
  const sri = bytes => `sha256-${createHash('sha256').update(bytes).digest('base64')}`
  let css = await readFile(resolve(root, 'node_modules/katex/dist/katex.min.css'), 'utf8')
  css = css.replace(/src:[^;}]+(?=[;}])/g, declaration => {
    const match = /url\(fonts\/(KaTeX_[A-Za-z0-9-]+\.woff2)\)/.exec(declaration)
    assert.ok(match, 'Expected installed KaTeX WOFF2 source')
    return `src:url(__FONT_${match[1]}__) format("woff2")`
  })
  for (const [, font] of [...css.matchAll(/__FONT_(KaTeX_[A-Za-z0-9-]+\.woff2)__/g)]) {
    const bytes = await readFile(resolve(root, 'node_modules/katex/dist/fonts', font))
    const file = `${name(bytes)}.woff2`
    files.set(file, bytes)
    css = css.replaceAll(`__FONT_${font}__`, `__LINGXI_MATH_BASE__${file}`)
  }
  const online = (await build({ absWorkingDir: root, stdin: {
    contents: `import {installArtifactMath} from './shared/artifact-math';installArtifactMath(${JSON.stringify(css)}.replaceAll('__LINGXI_MATH_BASE__',new URL('.',document.currentScript.src).href));`, resolveDir: root,
  }, bundle: true, format: 'iife', platform: 'browser', target: ['chrome120','firefox120','safari17'], minify: true, legalComments: 'inline', write: false })).outputFiles[0].text
  const onlineFile = `${name(online)}.js`
  files.set(onlineFile, Buffer.from(online))
  const loader = (await build({ absWorkingDir: root, stdin: {
    contents: `import {installArtifactMathLoader} from './shared/artifact-math-loader';installArtifactMathLoader(assetOrigin+${JSON.stringify('/artifact-editor/design-assets/' + onlineFile)},${JSON.stringify(sri(online))});`, resolveDir: root,
  }, bundle: true, format: 'iife', platform: 'browser', target: ['chrome120','firefox120','safari17'], minify: true, legalComments: 'inline', write: false })).outputFiles[0].text
  return { files, onlineFile, onlineBytes: Buffer.byteLength(online), loader: `function(assetOrigin){${loader}}` }
}

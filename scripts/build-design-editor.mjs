import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { adaptDesignMath, buildArtifactMath } from './build-artifact-math.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'third_party/baoyu-design/upstream/claude-design/scripts/editor')
const output = resolve(root, 'server/assets/design-editor')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

/** The pinned getter discarded the origin of its trusted runtime metadata. */
export function adaptDesignRuntimeUrl(source) {
  const needle = `let T=document.querySelector('meta[name="'+d+'"]')?.getAttribute("content");if(T)try{return new URL(T,document.baseURI).pathname}`
  assert.equal(source.split(needle).length, 2, 'pinned Design runtime URL hook changed')
  return source.replace(needle, needle.replace('.pathname}', '.href}'))
}

/** Package the pinned editor with the shared math enhancement and unchanged canvas model. */
export async function buildDesignEditor() {
  const { math } = await buildArtifactMath()
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
  const script = Buffer.from(adaptDesignRuntimeUrl(adaptDesignMath(await readFile(resolve(source, scriptPath), 'utf8'), math)))
  const scriptName = `design-${sha(script)}.js`
  const publicBase = '__LINGXI_DESIGN_ASSET_ORIGIN__/artifact-editor/design-assets/'
  const runtimePath = 'artifact-type/dc-runtime.js'
  const runtime = Buffer.from(await readFile(resolve(source, runtimePath), 'utf8') + '\n;' + math)
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
  await writeFile(resolve(output, 'assets', cssName), css)
  await rm(resolve(output, cssPath))
  await rm(resolve(output, scriptPath))
  await rm(resolve(output, 'assets', iconPath))
  await rm(resolve(output, runtimePath))
  const integrity = bytes => `sha256-${createHash('sha256').update(bytes).digest('base64')}`
  const html = originalHtml.replace(`./${cssPath}`, `${publicBase}${cssName}`).replace(`./${scriptPath}`, `${publicBase}${scriptName}`)
    .replace(`src="${publicBase}${scriptName}"`, `src="${publicBase}${scriptName}" integrity="${integrity(script)}"`)
    .replace(`href="${publicBase}${cssName}"`, `href="${publicBase}${cssName}" integrity="${integrity(css)}"`)
    .replace(runtimePath, `${publicBase}${runtimeName}`)
    .replace('</head>', `<link rel="preload" as="script" href="${publicBase}${runtimeName}">\n</head>`)
  await writeFile(resolve(output, 'index.html'), html)
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
  const manifest = { source: relative(root, source), upstreamCommit: 'c15e76ef5134228d2bb5da35652d30d7d6b8a34d',
    math: { sha256: sha(math), bytes: Buffer.byteLength(math) },
    entry: { file: `assets/${scriptName}`, original: scriptPath },
    runtime: { file: runtimeFile, original: runtimePath },
    styles: { file: `assets/${cssName}`, fallbackFont: `assets/${fontName}`, icons: `assets/${iconName}`, originalIcons: iconPath, originalBytes: Buffer.byteLength(originalCss), bytes: Buffer.byteLength(css) }, files, compressed }
  await writeFile(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await buildDesignEditor()))

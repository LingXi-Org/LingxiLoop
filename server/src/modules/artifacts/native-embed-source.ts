import { createHash } from 'node:crypto'
import { Parser } from 'htmlparser2'

/** Standalone compatibility runtime. It contains React and a capture bridge, never an editor. */
const EMBED_RUNTIME_SOURCE = `
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { flushSync } from 'react-dom';
import { toPng } from 'html-to-image';
import { installDcRuntime } from './shared/artifact-dc-runtime.ts';
const ownScript = document.currentScript;
const nonce = ownScript?.dataset.lingxiNonce;
const roots = new WeakMap();
globalThis.React = React;
globalThis.ReactDOM = { ...ReactDOM, render(element, target) { let root = roots.get(target); if (!root) { root = ReactDOM.createRoot(target); roots.set(target, root); } root.render(element); } };
const dcReady = installDcRuntime(React, ReactDOM, flushSync);
let capturing;
window.addEventListener('message', async event => {
  if (event.source !== parent || !nonce || event.data?.type !== 'lingxi:embed:capture' || event.data.nonce !== nonce || typeof event.data.requestId !== 'string' || event.data.requestId.length > 128) return;
  const requestId = event.data.requestId;
  try {
    capturing ??= (async () => {
    await dcReady();
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const width = Math.max(1, Math.min(8192, window.innerWidth));
    const height = Math.max(1, Math.min(8192, window.innerHeight));
    const dataUrl = await toPng(document.body, { width, height, pixelRatio: 1, skipAutoScale: true, cacheBust: false });
    return dataUrl;
    })().finally(() => { capturing = undefined; });
    const dataUrl = await capturing;
    parent.postMessage({ type: 'lingxi:embed:captured', nonce, requestId, dataUrl }, '*');
  } catch (error) {
    parent.postMessage({ type: 'lingxi:embed:captured', nonce, requestId, error: error instanceof Error ? error.message : 'capture failed' }, '*');
  }
});
`
let runtime: Promise<string> | undefined
export function nativeEmbedRuntime(): Promise<string> {
  runtime ??= import('esbuild').then(async ({ build }) => {
    const result = await build({ stdin: { contents: EMBED_RUNTIME_SOURCE, resolveDir: process.cwd(), sourcefile: 'native-embed-runtime.ts', loader: 'ts' }, bundle: true, write: false,
      format: 'iife', platform: 'browser', target: 'es2022', minify: true, legalComments: 'inline', define: { 'process.env.NODE_ENV': '"production"' } })
    return result.outputFiles![0]!.text
  }).catch(error => { runtime = undefined; throw error })
  return runtime
}
const htmlAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function reactImports(source: string) {
  return source
    .replace(/\bimport\s+React\s*(?:,\s*\{([^}]*)\})?\s+from\s*['"]react['"]\s*;?/g, (_, named: string | undefined) => named ? `const {${named.replace(/\bas\b/g, ':')}} = globalThis.React;` : '')
    .replace(/\bimport\s+\*\s+as\s+(\w+)\s+from\s*['"]react['"]\s*;?/g, (_, name: string) => `const ${name} = globalThis.React;`)
    .replace(/\bimport\s*\{([^}]*)\}\s+from\s*['"]react['"]\s*;?/g, (_, named: string) => `const {${named.replace(/\bas\b/g, ':')}} = globalThis.React;`)
    .replace(/\bimport\s*\{([^}]*)\}\s+from\s*['"]react-dom(?:\/client)?['"]\s*;?/g, (_, named: string) => `const {${named.replace(/\bas\b/g, ':')}} = globalThis.ReactDOM;`)
    .replace(/\bimport\s+(\w+)\s+from\s*['"]react-dom(?:\/client)?['"]\s*;?/g, (_, name: string) => `const ${name} = globalThis.ReactDOM;`)
}

/** Transforms syntax only. Imported user code is never executed or resolved on the server. */
export async function renderNativeEmbedSource(source: string, format: 'html' | 'jsx', options: { runtimeUrl: string; nonce: string; resourceBaseUrl?: string }): Promise<string> {
  if (source.length > 4_000_000) throw new Error('isolated source is too large')
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(options.nonce)) throw new Error('invalid capture nonce')
  if (!/^\/(?!\/)/.test(options.runtimeUrl) && !/^https?:\/\//.test(options.runtimeUrl)) throw new Error('invalid isolated runtime URL')
  if (options.resourceBaseUrl && !/^\/(?!\/)/.test(options.resourceBaseUrl) && !/^https?:\/\//.test(options.resourceBaseUrl)) throw new Error('invalid isolated resource base')
  const { transform } = await import('esbuild')
  const compile = async (script: string, tsx = false) => {
    const result = await transform(reactImports(script), { loader: tsx ? 'tsx' : 'jsx', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment', target: 'es2022', charset: 'ascii', legalComments: 'inline' })
    return result.code.replace(/<\/script/gi, '<\\/script')
  }
  let html = source
  // Raw JSX payloads are mounted into a dedicated root; full legacy .dc.html retains its document.
  if (format === 'jsx' && !/<(?:html|head|body|script)\b/i.test(source)) {
    html = `<div id="root"></div><script>${await compile(source)}</script>`
  } else {
    const matches = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    let cursor = 0
    const parts: string[] = []
    for (const match of matches) {
      parts.push(source.slice(cursor, match.index))
      const attributes = match[1] ?? '', body = match[2] ?? ''
      if (/\bsrc\s*=\s*["'](?:\.\/)?support\.js["']/i.test(attributes)) { /* The documented virtual support.js is supplied by the independent runtime. */ }
      else if (/\bsrc\s*=/i.test(attributes) || /\btype\s*=\s*["'](?:application\/(?:ld\+)?json|importmap)["']/i.test(attributes)) parts.push(match[0])
      else {
        const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1] ?? ''
        const dc = type === 'text/x-dc'
        const jsx = dc || format === 'jsx' || /babel|jsx|tsx/.test(type) || /\bimport\s.+['"]react(?:-dom(?:\/client)?)?['"]/.test(body)
        if (jsx) {
          const cleaned = attributes.replace(/\btype\s*=\s*["'][^"']*["']/i, '')
          let code = await compile(body, type.includes('tsx'))
          if (dc) code = `(()=>{${code}\nglobalThis.__lingxiDCMain = Component;})();`
          parts.push(`<script${cleaned}${/\b(?:import|export)\s/.test(code) ? ' type="module"' : ''}>${code}</script>`)
        } else parts.push(match[0])
      }
      cursor = match.index! + match[0].length
    }
    parts.push(source.slice(cursor)); html = parts.join('')
  }
  if (options.resourceBaseUrl) html = html.replace(/<base\b[^>]*>/gi, '')
  const bridge = `<meta charset="utf-8">${options.resourceBaseUrl ? `<base href="${htmlAttribute(options.resourceBaseUrl)}">` : ''}<script src="${htmlAttribute(options.runtimeUrl)}" data-lingxi-nonce="${htmlAttribute(options.nonce)}"></script>`
  if (/<head\b[^>]*>/i.test(html)) html = html.replace(/<head\b[^>]*>/i, opening => opening + bridge)
  else if (/<html\b[^>]*>/i.test(html)) html = html.replace(/<html\b[^>]*>/i, opening => opening + `<head>${bridge}</head>`)
  else html = `<!doctype html><html><head><meta charset="utf-8">${bridge}</head><body style="margin:0">${html}</body></html>`
  return html
}

/** Stable HTTP cache validators are derived from generated program bytes only. */
export function nativeEmbedRuntimeEtag(source: string) { return `"${createHash('sha256').update(source).digest('hex')}"` }

/** Immutable child DC files compile to an independent registry module, not a nested editor. */
export async function renderNativeDcModule(source: string, key: string): Promise<string> {
  if (source.length > 4_000_000 || key.length > 4096) throw new Error('isolated component is too large')
  const template = /<x-dc\b[^>]*>([\s\S]*?)<\/x-dc\s*>/i.exec(source)?.[1]
  if (template === undefined) throw new Error('child component has no x-dc template')
  let script = '', recording = false, props: Record<string, unknown> = {}
  const parser = new Parser({
    onopentag(name, attributes) {
      recording = name === 'script' && attributes.type === 'text/x-dc'
      if (recording && attributes['data-props']) {
        const descriptors = JSON.parse(attributes['data-props']) as Record<string, { default?: unknown }>
        props = Object.fromEntries(Object.entries(descriptors).filter(([name]) => !name.startsWith('$')).map(([name, descriptor]) => [name, descriptor.default]))
      }
    },
    ontext(value) { if (recording) script += value },
    onclosetag(name) { if (name === 'script') recording = false },
  }, { decodeEntities: true })
  parser.end(source)
  const { transform } = await import('esbuild')
  const result = await transform(script || 'class Component extends DCLogic {}', { loader: 'jsx', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment', target: 'es2022', charset: 'ascii' })
  return `(()=>{${result.code}\nglobalThis.__lingxiDCRegister(${JSON.stringify(key)},{Component,template:${JSON.stringify(template)},props:${JSON.stringify(props)}});})();`
}

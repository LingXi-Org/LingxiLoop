import type { ArtifactNode, ArtifactPage, ArtifactRichText, ArtifactStyle } from '../../../../../shared/artifact-document'
import { isSafeArtifactSvg } from '../../../../../shared/artifact-document'
import { artifactPageBackground, artifactResolvedStyle } from '../../../../../shared/artifact-themes'
import { escapeHtml, ExportResources, offlineMathCss } from './common'

const safeText = (text: string) => escapeHtml(text).replace(/\n/g, '<br>')
export function nodeHasMath(node: ArtifactNode) { return node.type === 'math' || /\$|\\(?:\(|\[|begin\{)/.test([node.text ?? '', ...(node.cells ?? []).flat()].join('\n')) }
async function sourceText(text: string, resources: ExportResources): Promise<string> {
  if (!/\$|\\(?:\(|\[|begin\{)/.test(text)) return safeText(text)
  const [{ inlineDollarRanges, splitArtifactMath }, { default: katex }] = await Promise.all([import('../../../../../shared/artifact-math-source'), import('katex')])
  const formula = (source: string, displayMode: boolean, raw: string) => {
    try { return katex.renderToString(source, { displayMode, throwOnError: true, trust: false, maxExpand: 1000, maxSize: 20 }) }
    catch { resources.warnings.add('无效公式按源码导出。'); return safeText(raw) }
  }
  return splitArtifactMath(text).map(part => {
    if (part.type === 'math') return formula(part.data, part.display ?? false, part.rawData ?? part.data)
    let cursor = 0, html = ''
    for (const range of inlineDollarRanges(part.data)) { html += safeText(part.data.slice(cursor, range.start)) + formula(range.source, false, part.data.slice(range.start, range.end)); cursor = range.end }
    return html + safeText(part.data.slice(cursor))
  }).join('')
}
async function richText(node: ArtifactRichText, resources: ExportResources): Promise<string> {
  if (node.type === 'text') {
    let body = node.marks?.some(mark => mark.type === 'code') ? escapeHtml(node.text ?? '') : await sourceText(node.text ?? '', resources)
    for (const mark of node.marks ?? []) {
      const tag = ({ bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'code', link: 'a' })[mark.type]
      body = `<${tag}${mark.type === 'link' ? ` href="${escapeHtml(mark.attrs?.href ?? '#')}" rel="noreferrer"` : ''}>${body}</${tag}>`
    }
    return body
  }
  if (node.type === 'hardBreak') return '<br>'
  const body = (await Promise.all((node.content ?? []).map(child => richText(child, resources)))).join('')
  if (node.type === 'doc') return body
  const tag = ({ paragraph: 'p', heading: `h${node.attrs?.level ?? 2}`, bulletList: 'ul', orderedList: 'ol', listItem: 'li', blockquote: 'blockquote' })[node.type]
  return `<${tag}>${body}</${tag}>`
}
function textStyle(style: ArtifactStyle) {
  return Object.entries({ color: style.color, background: style.backgroundColor ?? style.fill, opacity: style.opacity, 'font-family': style.fontFamily, 'font-size': style.fontSize === undefined ? undefined : `${style.fontSize}px`,
    'font-weight': style.fontWeight, 'font-style': style.fontStyle, 'text-align': style.textAlign, 'text-decoration': style.textDecoration, 'line-height': style.lineHeight,
    'border-radius': style.borderRadius === undefined ? undefined : `${style.borderRadius}px`, padding: style.padding === undefined ? undefined : `${style.padding}px`,
    border: (style.borderColor ?? style.stroke) ? `${style.borderWidth ?? style.strokeWidth ?? 1}px solid ${style.borderColor ?? style.stroke}` : undefined,
  }).filter(([, value]) => value !== undefined).map(([key, value]) => `${key}:${String(value)}`).join(';')
}

export const EXPORT_PAGE_CSS = `.artifact-export-page{position:relative;overflow:hidden;box-sizing:border-box;font:32px/1.3 system-ui,sans-serif;color:#141413;background:white}.artifact-export-page *{box-sizing:border-box}.artifact-export-node{overflow:visible;min-width:0;min-height:0}.artifact-export-node p,.artifact-export-node h1,.artifact-export-node h2,.artifact-export-node h3,.artifact-export-node h4,.artifact-export-node h5,.artifact-export-node h6{font:inherit;line-height:inherit;margin:0}.artifact-export-node img,.artifact-export-node svg{display:block;width:100%;height:100%;object-fit:contain}.artifact-export-node table{border-collapse:collapse;width:100%;height:100%;table-layout:fixed}.artifact-export-node td{padding:.25em;border:1px solid currentColor;overflow-wrap:anywhere}.artifact-export-node .katex-display{margin:0;max-width:100%;overflow:hidden}.artifact-export-node a{color:inherit}.artifact-export-unsupported{display:flex;width:100%;height:100%;align-items:center;justify-content:center;border:1px dashed #73726c;color:#73726c;font-size:18px;white-space:pre-wrap}`

export async function renderPageHtml(page: ArtifactPage, resources: ExportResources): Promise<string> {
  resources.check()
  const children = (id: string | null) => page.nodeOrder.map(key => page.nodes[key]!).filter(node => node.parentId === id && !node.hidden)
  async function render(node: ArtifactNode): Promise<string> {
    resources.check()
    const parent = node.parentId ? page.nodes[node.parentId] : null
    const inFlow = parent?.layout?.mode === 'flex' || parent?.layout?.mode === 'grid'
    const position = inFlow ? 'position:relative;flex-shrink:1' : `position:absolute;left:${node.x}px;top:${node.y}px`
    const style = artifactResolvedStyle(node.style, resources.document)
    let css = `${position};width:${node.width}px;height:${node.height}px;transform:rotate(${node.rotation}deg);${textStyle(style)}`
    let content = ''
    switch (node.type) {
      case 'group': {
        const layout = node.layout
        if (layout?.mode === 'flex') css += `;display:flex;flex-direction:${layout.direction ?? 'column'};gap:${layout.gap ?? 0}px;align-items:${layout.align ?? 'stretch'};justify-content:${layout.justify ?? 'start'}`
        if (layout?.mode === 'grid') css += `;display:grid;grid-template-columns:repeat(${layout.columns ?? 2},minmax(0,1fr));gap:${layout.gap ?? 0}px`
        content = (await Promise.all(children(node.id).map(render))).join('')
        break
      }
      case 'text': content = node.richText ? await richText(node.richText, resources) : await sourceText(node.text ?? '', resources); break
      case 'image': {
        const source = node.assetId ? await resources.asset(node.assetId) : ''
        const crop = node.crop
        content = `<div style="width:100%;height:100%;overflow:hidden"><img alt="${escapeHtml(node.text ?? '')}" src="${escapeHtml(source)}"${crop && crop.width > 0 && crop.height > 0 ? ` style="max-width:none;width:${100 / crop.width}%;height:${100 / crop.height}%;transform:translate(${-crop.x * 100}%,-${crop.y * 100}%);object-fit:fill"` : ''}></div>`
        break
      }
      case 'math': {
        const katex = await import('katex')
        try { content = katex.default.renderToString(node.source ?? '', { displayMode: true, throwOnError: true, trust: false, maxExpand: 1000, maxSize: 20 }) }
        catch { content = safeText(node.source ?? ''); resources.warnings.add(`${page.title}：无效公式按源码导出。`) }
        break
      }
      case 'table': content = `<table>${(await Promise.all((node.cells ?? []).map(async row => `<tr>${(await Promise.all(row.map(async cell => `<td>${await sourceText(cell, resources)}</td>`))).join('')}</tr>`))).join('')}</table>`; break
      case 'svg': {
        const prefix = `${page.id}-${node.id}-`
        content = node.svg && isSafeArtifactSvg(node.svg) ? node.svg.replace(/\bid=("|')([^"']+)\1/g, (_, quote: string, id: string) => `id=${quote}${prefix}${id}${quote}`).replace(/url\(#([a-zA-Z0-9_-]+)\)/g, `url(#${prefix}$1)`) : ''
        break
      }
      case 'line': {
        const points = node.points?.length ? node.points : [{ x: 0, y: 0 }, { x: node.width, y: node.height }]
        content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${node.width || 1} ${node.height || 1}"><polyline points="${points.map(point => `${point.x},${point.y}`).join(' ')}" fill="none" stroke="${escapeHtml(style.stroke ?? style.color ?? '#141413')}" stroke-width="${style.strokeWidth ?? 2}"/></svg>`
        break
      }
      case 'shape': {
        const fill = escapeHtml(style.fill ?? '#d97757'), stroke = escapeHtml(style.stroke ?? 'none')
        const shape = node.shape === 'ellipse' ? '<ellipse cx="50" cy="50" rx="49" ry="49"/>' : node.shape === 'triangle' ? '<polygon points="50,1 99,99 1,99"/>' : node.shape === 'diamond' ? '<polygon points="50,1 99,50 50,99 1,50"/>' : node.shape === 'arrow' ? '<polygon points="0,25 65,25 65,0 100,50 65,100 65,75 0,75"/>' : `<rect x="0" y="0" width="100" height="100" rx="${Math.min(50, (style.borderRadius ?? 0) / Math.max(1, node.width) * 100)}"/>`
        content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none" fill="${fill}" stroke="${stroke}" stroke-width="${style.strokeWidth ?? 0}">${shape}</svg>`
        break
      }
      case 'embed': {
        const previewId = node.embed?.previewAssetId
        if (!previewId) throw new Error(`${page.title} / ${node.id}：隔离内容缺少当前版本的预览快照，请重新导出。`)
        content = `<img alt="隔离内容的静态快照" src="${escapeHtml(await resources.asset(previewId))}">`
        resources.warnings.add(`${page.title} / ${node.id}：交互内容以静态快照导出；原稿保留可执行源码与交互。`)
        break
      }
    }
    return `<div class="artifact-export-node" data-node-id="${node.id}" style="${escapeHtml(css)}">${content}</div>`
  }
  return `<section class="artifact-export-page" data-page-id="${page.id}" aria-label="${escapeHtml(page.title)}" style="width:${page.width}px;height:${page.height}px;background:${escapeHtml(artifactPageBackground(page, resources.document))}">${(await Promise.all(children(null).map(render))).join('')}</section>`
}

export async function mountExportPage(page: ArtifactPage, resources: ExportResources): Promise<{ element: HTMLElement; viewport: HTMLElement; dispose: () => void }> {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;contain:layout style;'
  host.setAttribute('aria-hidden', 'true')
  const style = document.createElement('style')
  const hasMath = Object.values(page.nodes).some(nodeHasMath)
  style.textContent = EXPORT_PAGE_CSS + (hasMath ? await offlineMathCss(resources.options.signal) : '')
  host.append(style)
  const surface = document.createElement('div')
  surface.innerHTML = await renderPageHtml(page, resources)
  host.append(surface); document.body.append(host)
  const element = surface.firstElementChild as HTMLElement
  try {
    await Promise.all([...element.querySelectorAll('img')].map(image => image.decode()))
    await document.fonts.ready
    resources.check()
    return { element, viewport: surface, dispose: () => host.remove() }
  } catch (error) { host.remove(); throw error }
}

export function pageText(page: ArtifactPage) {
  return page.nodeOrder.map(id => page.nodes[id]!).filter(node => !node.hidden).flatMap(node => node.type === 'text' ? [node.text ?? ''] : node.type === 'table' ? (node.cells ?? []).map(row => row.join('\t')) : node.type === 'math' ? [node.source ?? ''] : []).join('\n')
}

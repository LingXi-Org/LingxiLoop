import {canvasTextMetrics} from '../../../../../shared/artifact-canvas-typography'
import { artifactShapeGeometry } from '../../../../../shared/artifact-shapes'
import type { ArtifactNode, ArtifactPage, ArtifactRichText, ArtifactStyle } from '../../../../../shared/artifact-document'
import { artifactPageBackground, artifactResolvedStyle } from '../../../../../shared/artifact-themes'
import { awaitPageFonts } from './fonts'
import { escapeHtml, type ExportResources, offlineMathCss } from './common'
import { appearance, nodeTransform, paddingCss } from '../../../../../shared/artifact-appearance'
import { editorFontFamily } from '../editor-fonts'
import { presentSvg } from '../svg-presentation'

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
  const extra = Object.fromEntries(Object.entries(appearance(style)).map(([key,value]) => [key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`),value]))
  return Object.entries({ color: style.color, background: style.backgroundColor ?? style.fill, opacity: style.opacity, 'font-family': editorFontFamily(style.fontFamily), 'font-size': style.fontSize === undefined ? undefined : `${style.fontSize}px`,
    'font-weight': style.fontWeight, 'font-style': style.fontStyle, 'text-align': style.textAlign, 'text-decoration': style.textDecoration, 'line-height': style.lineHeight,
    'border-radius': style.borderRadius === undefined ? undefined : `${style.borderRadius}px`, padding:paddingCss(style),
    border: (style.borderColor ?? style.stroke) ? `${style.borderWidth ?? style.strokeWidth ?? 1}px ${style.borderStyle ?? 'solid'} ${style.borderColor ?? style.stroke}` : undefined, ...extra,
  }).filter(([, value]) => value !== undefined).map(([key, value]) => `${key}:${String(value)}`).join(';')
}

export const EXPORT_PAGE_CSS = `.artifact-export-page{position:relative;overflow:hidden;box-sizing:border-box;font:32px/1.3 system-ui,sans-serif;color:#141413;background:white}.artifact-export-page *{box-sizing:border-box}.artifact-export-node{overflow:visible;min-width:0;min-height:0}.artifact-export-node p,.artifact-export-node h1,.artifact-export-node h2,.artifact-export-node h3,.artifact-export-node h4,.artifact-export-node h5,.artifact-export-node h6{font:inherit;line-height:inherit;margin:0}.artifact-export-node img,.artifact-export-node svg{display:block;width:100%;height:100%;object-fit:contain}.artifact-export-node img{object-fit:cover}.artifact-export-node table{display:grid;width:100%;height:100%;box-sizing:border-box;border-top:2px solid color-mix(in srgb,currentColor 22%,transparent);border-left:2px solid color-mix(in srgb,currentColor 22%,transparent)}.artifact-export-node table>tbody,.artifact-export-node table tr{display:contents}.artifact-export-node td,.artifact-export-node th{box-sizing:content-box;min-width:0;min-height:1lh;padding:.35em .6em;border-right:2px solid color-mix(in srgb,currentColor 22%,transparent);border-bottom:2px solid color-mix(in srgb,currentColor 22%,transparent);white-space:pre-wrap;overflow-wrap:break-word;text-align:inherit;font-weight:inherit}.artifact-export-node th{font-weight:600;background:color-mix(in srgb,currentColor 8%,transparent)}.artifact-export-node .katex-display{margin:0;max-width:100%;overflow:hidden}.artifact-export-node a{color:inherit}.artifact-export-unsupported{display:flex;width:100%;height:100%;align-items:center;justify-content:center;border:1px dashed #73726c;color:#73726c;font-size:18px;white-space:pre-wrap}`

export async function renderPageHtml(page: ArtifactPage, resources: ExportResources): Promise<string> {
  resources.check()
  const children = (id: string | null) => page.nodeOrder.map(key => page.nodes[key]!).filter(node => node.parentId === id && !node.hidden && node.scope !== 'canvas')
  async function render(node: ArtifactNode): Promise<string> {
    resources.check()
    const parent = node.parentId ? page.nodes[node.parentId] : null
    const inFlow = parent?.layout?.mode === 'flex' || parent?.layout?.mode === 'grid'
    const position = inFlow ? 'position:relative;flex-shrink:1' : `position:absolute;left:${node.x}px;top:${node.y}px`
    const style = artifactResolvedStyle(node.style, resources.document)
    let css = `${position};width:${node.textSizing==='content'?'max-content':`${node.width}px`};${node.textSizing==='content'?`max-width:${node.width}px;height:auto;min-height:${canvasTextMetrics(style.fontSize??24).minHeight}px`:`height:${node.height}px`};transform:${nodeTransform(node)};${textStyle(style)}`
    let content = ''
    switch (node.type) {
      case 'group': {
        const layout = node.layout
        if (layout?.mode === 'flex') css += `;display:flex;flex-direction:${layout.direction ?? 'column'};gap:${layout.gap ?? 0}px;align-items:${layout.align ?? 'stretch'};justify-content:${layout.justify ?? 'start'}`
        if (layout?.mode === 'grid') css += `;display:grid;grid-template-columns:repeat(${layout.columns ?? 2},minmax(0,1fr));gap:${layout.gap ?? 0}px`
        content = (await Promise.all(children(node.id).map(render))).join('')
        break
      }
      case 'note':
      case 'text': content = node.richText ? await richText(node.richText, resources) : await sourceText(node.text ?? '', resources); break
      case 'video': {
        if (node.posterAssetId) { const crop=node.crop;content=`<div style="width:100%;height:100%;overflow:hidden"><img alt="${escapeHtml(node.text??'视频')}" src="${escapeHtml(await resources.asset(node.posterAssetId))}" ${crop?` style="max-width:none;width:${100/Math.max(.01,crop.width)}%;height:${100/Math.max(.01,crop.height)}%;transform:translate(${-crop.x*100}%,-${crop.y*100}%);object-fit:cover"`:''}></div>` }
        else content = `<div class="artifact-export-unsupported">${escapeHtml(node.text ?? '视频')}</div>`
        resources.warnings.add(`${page.title} / ${node.id}：视频以封面导出，原稿保留视频。`)
        break
      }
      case 'image': {
        const source = node.assetId ? await resources.asset(node.assetId) : ''
        const crop = node.crop
        content = `<div style="width:100%;height:100%;overflow:hidden"><img alt="${escapeHtml(node.text ?? '')}" src="${escapeHtml(source)}"${crop && crop.width > 0 && crop.height > 0 ? ` style="max-width:none;width:${100 / crop.width}%;height:${100 / crop.height}%;transform:translate(${-crop.x * 100}%,-${crop.y * 100}%);object-fit:cover"` : ''}></div>`
        break
      }
      case 'math': {
        const katex = await import('katex')
        try { content = katex.default.renderToString(node.source ?? '', { displayMode: true, throwOnError: true, trust: false, maxExpand: 1000, maxSize: 20 }) }
        catch { content = safeText(node.source ?? ''); resources.warnings.add(`${page.title}：无效公式按源码导出。`) }
        break
      }
      case 'table': {
        const columns=Math.max(1,...(node.cells??[]).map(row=>row.length))
        content=`<table style="grid-template-columns:repeat(${columns},minmax(0,1fr))"><tbody>${(await Promise.all((node.cells??[]).map(async(row,index)=>`<tr>${(await Promise.all(row.map(async(cell,column)=>{const tag=node.tableHeader&&index===0?'th':'td';return `<${tag}${tag==='th'?' scope="col"':''} style="grid-row:${index+1};grid-column:${column+1}">${await sourceText(cell,resources)}</${tag}>`}))).join('')}</tr>`))).join('')}</tbody></table>`
        break
      }
      case 'svg': {
        const prefix = `${page.id}-${node.id}-`
        content = node.svg ? presentSvg(node.svg, prefix) : ''
        break
      }
      case 'drawing':
      case 'line': {
        css += ';background:none;border:none'
        if(node.path){content=`<svg xmlns="http://www.w3.org/2000/svg" style="overflow:visible" viewBox="0 0 ${node.path.width} ${node.path.height}" preserveAspectRatio="none"><path d="${escapeHtml(node.path.d)}" fill="none" stroke="${escapeHtml(style.stroke??'#8a8378')}" stroke-width="${style.strokeWidth??2}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;break}
        const points = node.points?.length ? node.points : [{ x: 0, y: 0 }, { x: node.width, y: node.height }]
        const markerId = `marker-${page.id}-${node.id}`
        const marker = `<defs><marker id="${markerId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${escapeHtml(style.stroke ?? '#333')}"/></marker></defs>`
        content = `<svg xmlns="http://www.w3.org/2000/svg" style="overflow:visible" viewBox="0 0 ${node.width || 1} ${node.height || 1}">${marker}<polyline${node.lineStart === 'arrow' ? ` marker-start="url(#${markerId})"` : ''}${node.type !== 'drawing' && node.lineEnd !== 'none' ? ` marker-end="url(#${markerId})"` : ''} points="${points.map(point => `${point.x},${point.y}`).join(' ')}" fill="none" stroke="${escapeHtml(style.stroke ?? style.color ?? '#141413')}" stroke-width="${style.strokeWidth ?? 2}"/></svg>`
        break
      }
      case 'shape': {
        const gradientId = `gradient-${page.id}-${node.id}`
        const gradient = style.gradient
        const gradientDefinition = gradient ? `<defs><${gradient.type === 'radial' ? 'radialGradient' : 'linearGradient'} id="${gradientId}"${gradient.type === 'linear' ? ` x1="0%" y1="0%" x2="100%" y2="0%" gradientTransform="rotate(${gradient.angle-90} .5 .5)"` : ''}>${gradient.stops.map(stop => `<stop offset="${stop.offset}" stop-color="${escapeHtml(stop.color)}"/>`).join('')}</${gradient.type === 'radial' ? 'radialGradient' : 'linearGradient'}></defs>` : ''
        css += ';background:none'
        const fill = gradient ? `url(#${gradientId})` : escapeHtml(style.fill ?? '#d97757'), stroke = escapeHtml(style.stroke ?? 'none')
        const geometry=artifactShapeGeometry(node.shape,node.width,node.height,style.borderRadius)
        const shape=`<${geometry.tag} ${Object.entries(geometry.attributes).map(([key,value])=>`${key}="${value}"`).join(' ')}/>`
        content = `<svg xmlns="http://www.w3.org/2000/svg" style="overflow:visible" viewBox="0 0 ${node.width} ${node.height}" fill="${fill}" stroke="${stroke}" stroke-width="${style.strokeWidth ?? 0}">${gradientDefinition}${shape}</svg>`
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
    if(node.css){
      // Generated values reject semicolons. Replace matching declarations before
      // appending authored CSS so an invalid value cannot revive an old width.
      css=css.split(';').filter(declaration=>!Object.hasOwn(node.css!,declaration.slice(0,declaration.indexOf(':')).trim())).join(';')
      css+=';'+Object.entries(node.css).map(([name,value])=>`${name}:${value}`).join(';')
    }
    const tag=node.attributes?.href?'a':'div',attributes=Object.entries(node.attributes??{}).map(([name,value])=>` ${name}="${escapeHtml(value)}"`).join('')
    return `<${tag} class="artifact-export-node" data-node-id="${node.id}" data-motion-id="${node.motionId??node.id}"${node.parentId?'':' data-motion-root'}${attributes}${tag==='a'?' rel="noopener noreferrer"':''} style="${escapeHtml(css)}">${content}</${tag}>`
  }
  return `<section class="artifact-export-page" data-page-id="${page.id}" data-transition="${page.transition}" aria-label="${escapeHtml(page.title)}" style="width:${page.width}px;height:${page.height}px;background:${escapeHtml(artifactPageBackground(page, resources.document))}">${(await Promise.all(children(null).map(render))).join('')}</section>`
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
    await awaitPageFonts(element)
    resources.check()
    return { element, viewport: surface, dispose: () => host.remove() }
  } catch (error) { host.remove(); throw error }
}

export function pageText(page: ArtifactPage) {
  return page.nodeOrder.map(id => page.nodes[id]!).filter(node => {
    let current: ArtifactNode | undefined = node
    while (current) {
      if (current.hidden || current.scope === 'canvas') return false
      current = current.parentId ? page.nodes[current.parentId] : undefined
    }
    return true
  }).flatMap(node => node.type === 'text' || node.type === 'note' ? [node.text ?? ''] : node.type === 'table' ? (node.cells ?? []).map(row => row.join('\t')) : node.type === 'math' ? [node.source ?? ''] : []).join('\n')
}

import { Parser } from 'htmlparser2'
import {
  createDocument, createNode, createPage, isSafeArtifactSvg, validateArtifactDocument,
  type ArtifactDocument, type ArtifactNode, type ArtifactRichText, type ArtifactStyle,
} from './artifact-document'
import { projectArtifactThemes } from './artifact-themes'
import { importCanvasAnnotations } from './artifact-canvas-import'

/** Compatibility is a data conversion boundary. This module never evaluates imported source. */
export interface LegacyArtifactInput {
  id: string
  kind: 'design' | 'slides'
  title: string
  files: Record<string, { content: string; sha256: string }>
}
export interface LegacyArtifactResult {
  document: ArtifactDocument
  originals: Record<string, string>
  warnings: string[]
}
interface HtmlElement { tag: string; attrs: Record<string, string>; children: HtmlNode[]; contentStart?: number; innerSource?: string }
type HtmlNode = HtmlElement | string
const element = (node: HtmlNode): node is HtmlElement => typeof node !== 'string'
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const finite = (value: unknown, fallback: number) => Number.isFinite(Number(value)) && value !== '' && value !== undefined && value !== null ? Number(value) : fallback
const dimension = (value: unknown, fallback: number) => Math.max(1, Math.min(1_000_000, finite(value, fallback)))
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const safeId = (value: string, fallback: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || fallback
function hashId(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619)
  return (hash >>> 0).toString(16)
}
function parseHtml(source: string): HtmlElement {
  const root: HtmlElement = { tag: 'root', attrs: {}, children: [] }
  const stack = [root]
  const parser = new Parser({
    onopentag(tag, attrs) {
      const node: HtmlElement = { tag, attrs, children: [], ...(tag.toLowerCase() === 'x-embed' ? { contentStart: parser.endIndex + 1 } : {}) }
      stack.at(-1)!.children.push(node); stack.push(node)
    },
    ontext(text) { stack.at(-1)!.children.push(text) },
    onclosetag() {
      if (stack.length > 1) {
        const node = stack.pop()!
        if (node.contentStart !== undefined) node.innerSource = source.slice(node.contentStart, parser.startIndex)
      }
    },
  }, { decodeEntities: true, lowerCaseAttributeNames: false, lowerCaseTags: false })
  parser.end(source)
  return root
}
const textContent = (node: HtmlNode): string => typeof node === 'string' ? node : node.children.map(textContent).join(node.tag === 'br' ? '\n' : '')
function descendants(node: HtmlElement, tag: string, outsideEmbeds = false): HtmlElement[] {
  return node.children.flatMap(child => element(child) ? [...(child.tag.toLowerCase() === tag ? [child] : []), ...(outsideEmbeds && child.tag.toLowerCase() === 'x-embed' ? [] : descendants(child, tag, outsideEmbeds))] : [])
}
const serialize = (node: HtmlNode): string => typeof node === 'string' ? escapeHtml(node) : `<${node.tag}${Object.entries(node.attrs).map(([key, value]) => ` ${key}="${escapeHtml(value)}"`).join('')}>${node.children.map(serialize).join('')}</${node.tag}>`
const styles = (node: HtmlElement) => Object.fromEntries((node.attrs.style ?? '').split(';').map(part => part.split(/:(.*)/s).slice(0, 2)).filter(pair => pair.length === 2).map(([key, value]) => [key!.trim().toLowerCase(), value!.trim()]))
function storedImage(source: string, pagePath: string, files: LegacyArtifactInput['files']) {
  if (/^[a-z][a-z\d+.-]*:|^\/\/|\\/i.test(source)) return undefined
  try {
    const url = new URL(source, `https://artifact.invalid/${source.startsWith('project/') ? '' : pagePath}`)
    const path = decodeURIComponent(url.pathname.slice(1))
    const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', svg: 'image/svg+xml' }[path.split('.').at(-1)?.toLowerCase() ?? '']
    return path.startsWith('project/') && files[path] && mime ? { path, mime, file: files[path]! } : undefined
  } catch { return undefined }
}
function pixels(value: string | undefined, base: number, fallback: number) {
  if (!value || value === 'auto') return fallback
  if (/^-?[\d.]+%$/.test(value)) return Number.parseFloat(value) / 100 * base
  if (/^-?[\d.]+(?:px)?$/.test(value)) return Number.parseFloat(value)
  return fallback
}
function nodeStyle(css: Record<string, string>): ArtifactStyle {
  const result: ArtifactStyle = {}
  const safeColor = (value: string | undefined) => value && !/[<>;\\]|url\s*\(|expression\s*\(|@import/i.test(value) ? value : undefined
  if (safeColor(css.color)) result.color = css.color
  if (safeColor(css['background-color'] ?? css.background)) result.fill = css['background-color'] ?? css.background
  if (safeColor(css['border-color'])) result.stroke = css['border-color']
  const border = /^([\d.]+)px\s+solid\s+(.+)$/.exec(css.border ?? '')
  if (border && safeColor(border[2])) { result.strokeWidth = Number(border[1]); result.stroke = border[2] }
  if (css['font-family'] && !/[<>;{}]/.test(css['font-family'])) result.fontFamily = css['font-family']
  for (const [key, property] of [['font-size', 'fontSize'], ['border-radius', 'borderRadius'], ['border-width', 'strokeWidth'], ['padding', 'padding']] as const) {
    const value = pixels(css[key]?.split(/\s/)[0], 1, -1)
    if (value >= 0) Object.assign(result, { [property]: value })
  }
  const weight = css['font-weight'] === 'bold' ? 700 : Number(css['font-weight'])
  if (weight >= 100 && weight <= 1000) result.fontWeight = Math.round(weight)
  if (css['font-style'] === 'italic') result.fontStyle = 'italic'
  if (['left', 'center', 'right', 'justify'].includes(css['text-align'] ?? '')) result.textAlign = css['text-align'] as ArtifactStyle['textAlign']
  if (['underline', 'line-through', 'none'].includes(css['text-decoration'] ?? '')) result.textDecoration = css['text-decoration'] as ArtifactStyle['textDecoration']
  if (css.opacity && Number(css.opacity) >= 0 && Number(css.opacity) <= 1) result.opacity = Number(css.opacity)
  const lineHeight = Number(css['line-height'])
  if (lineHeight >= .5 && lineHeight <= 10) result.lineHeight = lineHeight
  return result
}

function richInline(node: HtmlNode, marks: NonNullable<ArtifactRichText['marks']> = []): ArtifactRichText[] {
  if (typeof node === 'string') return node ? [{ type: 'text', text: node, ...(marks.length ? { marks } : {}) }] : []
  const tag = node.tag.toLowerCase()
  if (tag === 'br') return [{ type: 'hardBreak' }]
  const mapped = ({ b: 'bold', strong: 'bold', i: 'italic', em: 'italic', u: 'underline', s: 'strike', del: 'strike', code: 'code' } as const)[tag as 'b']
  const next = mapped ? [...marks, { type: mapped }] : marks
  if (tag === 'a' && /^(https?:\/\/|mailto:|#)/i.test(node.attrs.href ?? '') && !/[\u0000-\u0020<>]/.test(node.attrs.href!)) next.push({ type: 'link', attrs: { href: node.attrs.href! } })
  return node.children.flatMap(child => richInline(child, next))
}
function richBlock(node: HtmlElement): ArtifactRichText {
  const tag = node.tag.toLowerCase()
  if (tag === 'ul' || tag === 'ol') return { type: tag === 'ul' ? 'bulletList' : 'orderedList', content: node.children.filter(element).filter(child => child.tag === 'li').map(child => ({ type: 'listItem', content: [{ type: 'paragraph', content: richInline(child) }] })) }
  return { type: /^h[1-6]$/.test(tag) ? 'heading' : 'paragraph', ...(/^h[1-6]$/.test(tag) ? { attrs: { level: Number(tag[1]) } } : {}), content: richInline(node) }
}
function formula(source: string): string | undefined {
  const value = source.trim()
  for (const [start, end] of [['$$', '$$'], ['\\[', '\\]'], ['\\(', '\\)'], ['$', '$']]) {
    if (value.startsWith(start!) && value.endsWith(end!) && value.length > start!.length + end!.length) return value.slice(start!.length, -end!.length)
  }
  return undefined
}
/** Receives an immutable file snapshot; caller commits only after comparing its original version. */
export function convertLegacyArtifact(input: LegacyArtifactInput): LegacyArtifactResult {
  const indexPath = `project/${input.kind === 'design' ? 'canvas' : 'deck'}.json`
  const indexFile = input.files[indexPath]
  if (!indexFile) throw new Error(`missing legacy index: ${indexPath}`)
  const index = object(JSON.parse(indexFile.content))
  if (index.v !== (input.kind === 'design' ? 3 : 4)) throw new Error(`unsupported legacy version: ${String(index.v)}`)
  const document = createDocument(input.kind, input.id, typeof index.title === 'string' ? index.title : input.title)
  const originals = Object.fromEntries(Object.entries(input.files).map(([path, file]) => [path, file.sha256]))
  const warnings: string[] = []
  for (const [path, file] of Object.entries(input.files)) {
    const theme = /^project\/ds\/([^/]+)\/tokens\.json$/.exec(path)
    if (!theme) continue
    try {
      const data = object(JSON.parse(file.content))
      const source = Array.isArray(index.designSystems) ? index.designSystems.map(object).find(item => item.namespace === theme[1]) : undefined
      const title = typeof source?.title === 'string' ? source.title : String(data.name ?? theme[1])
      for (const converted of projectArtifactThemes(theme[1]!, title, data, {
        ...(typeof source?.version === 'string' ? { version: source.version } : {}), ...(typeof source?.artifact === 'string' ? { url: source.artifact } : {}),
      })) {
        document.themes[converted.id] = converted
        if (!document.themeId) document.themeId = converted.id
      }
    } catch { warnings.push(`${path}：无法解析主题，原始文件已保留。`) }
  }
  if (input.kind === 'design' && Array.isArray(index.pages) && index.pages.length) {
    document.canvasPages = index.pages.map((value, ordinal) => {
      const source = object(value)
      return {id:safeId(String(source.id ?? ''), `canvas_page_${ordinal}`),name:typeof source.name==='string'?source.name:`页面 ${ordinal+1}`}
    })
  }
  const boards = object(index.boards)
  const order = Array.isArray(index.order) ? index.order.filter((item): item is string => typeof item === 'string') : Object.keys(boards)
  for (const [ordinal, oldId] of order.entries()) {
    const path = input.kind === 'slides' ? `project/slides/${oldId}.html` : `project/${oldId}`
    const file = input.files[path]
    if (!file) throw new Error(`missing legacy page: ${path}`)
    let id = safeId(oldId.replace(/\.dc\.html$/, ''), `page_${ordinal}`)
    if (document.pages[id]) id = `${id.slice(0, 110)}_${ordinal}`
    const page = createPage(id, oldId.replace(/\.dc\.html$/, ''))
    delete page.themeBackground // Imported pages retain their authored background across theme selection.
    if (input.kind === 'slides') { page.width = 1920; page.height = 1080 }
    else {
      const board = object(boards[oldId])
      if (document.canvasPages) page.canvasPageId = document.canvasPages.find(sheet=>sheet.id===safeId(String(board.page??''), ''))?.id ?? document.canvasPages[0]!.id
      page.x = finite(board.x, (ordinal % 4) * 1360); page.y = finite(board.y, Math.floor(ordinal / 4) * 800)
      page.width = dimension(board.w ?? board.width, 1280); page.height = dimension(board.h ?? board.height, 720)
      if (typeof board.title === 'string') page.title = board.title
      if (board.print === 'flow' || board.print === 'fixed') page.sizing = board.print
      if (board.paper === 'a4') page.paper = 'A4'
      else if (board.paper === 'letter') page.paper = 'Letter'
    }
    const tree = parseHtml(file.content)
    const section = (input.kind === 'slides' ? descendants(tree, 'section')[0] : undefined) ?? descendants(tree, 'body')[0] ?? tree
    const rootCss = styles(section)
    const background = rootCss['background-color'] ?? rootCss.background
    if (background && !/[<>;\\]|url\s*\(|expression\s*\(/i.test(background)) page.background = background
    page.notes = descendants(tree, 'aside', true).map(textContent).join('\n') || String(object(index.notes)[oldId] ?? '')
    page.transition = ['fade', 'slide'].includes(section.attrs['data-transition'] ?? '') ? section.attrs['data-transition'] as 'fade' | 'slide' : 'none'
    page.skip = section.attrs['data-skip'] === 'true'
    document.pages[id] = page; document.pageOrder.push(id)
    let serial = 0
    function add(node: ArtifactNode) { page.nodes[node.id] = node; page.nodeOrder.push(node.id); return node }
    function nodeId(preferred?: string) {
      let next = safeId(preferred ?? '', `${id.slice(0, 80)}_n${++serial}`)
      while (page.nodes[next]) next = `${id.slice(0, 80)}_n${++serial}`
      return next
    }
    function embed(source: string, x: number, y: number, width: number, height: number, parentId: string | null = null) {
      add({ ...createNode('embed', nodeId()), x, y, width, height, parentId,
        embed: { source, format: 'html', sourceHash: file!.sha256, originalPath: path } })
      warnings.push(`${page.title}：不能逐元素转换的内容作为隔离块保留。`)
    }
    const executable = descendants(tree, 'script', true).some(node => !/^(?:\.\/)?support\.js$/.test(node.attrs.src ?? '') && !/^(?:application\/(?:ld\+)?json|importmap)$/.test(node.attrs.type ?? ''))
      || descendants(tree, 'style', true).length || descendants(tree, 'link', true).some(node => node.attrs.rel === 'stylesheet')
    if (executable) { embed(file.content, 0, 0, page.width, page.height); continue }
    function convert(source: HtmlElement, parentId: string | null, box: { x: number; y: number; width: number; height: number }, cursor: number): number {
      const tag = source.tag.toLowerCase(), css = styles(source)
      if (['aside', 'head', 'title', 'meta', 'link', 'noscript'].includes(tag)) return 0
      const absolute = css.position === 'absolute'
      const fontSize = pixels(css['font-size'], box.width, /^h[1-6]$/.test(tag) ? 104 - Number(tag[1]) * 12 : 32)
      const width = Math.max(1, pixels(css.width ?? source.attrs.width, box.width, box.width))
      const plain = textContent(source).trim()
      const estimated = Math.max(fontSize * 1.35, Math.ceil(plain.length * fontSize * .6 / width) * fontSize * 1.35)
      const height = Math.max(1, pixels(css.height ?? source.attrs.height, box.height, tag === 'img' || tag === 'svg' ? 240 : estimated))
      const x = pixels(css.left, box.width, 0), y = css.bottom ? box.height - pixels(css.bottom, box.height, 0) - height : pixels(css.top, box.height, cursor)
      const style = nodeStyle(css)
      const rotation = Number(/rotate\(([-\d.]+)deg\)/.exec(css.transform ?? '')?.[1] ?? 0)
      const common = { x: absolute ? box.x + x : x, y: absolute ? box.y + y : y, width, height, rotation, parentId: absolute ? null : parentId, style }
      if (tag === 'iframe' && source.attrs.srcdoc !== undefined && !Object.keys(source.attrs).some(key => /^on/i.test(key))) {
        embed(source.attrs.srcdoc, common.x, common.y, width, height, common.parentId); return absolute ? 0 : height
      }
      if (tag === 'x-embed' && source.innerSource !== undefined && !Object.keys(source.attrs).some(key => /^on/i.test(key))) {
        embed(source.innerSource, common.x, common.y, width, height, common.parentId); return absolute ? 0 : height
      }
      if (Object.keys(source.attrs).some(key => /^on/i.test(key)) || ['script', 'iframe', 'object', 'embed', 'video', 'audio', 'x-embed'].includes(tag)) {
        embed(serialize(source), common.x, common.y, width, height, common.parentId); return absolute ? 0 : height
      }
      if (tag === 'svg') {
        const svg = serialize(source)
        if (isSafeArtifactSvg(svg)) add({ ...createNode('svg', nodeId(source.attrs.id)), ...common, svg })
        else embed(svg, common.x, common.y, width, height, common.parentId)
        return absolute ? 0 : height
      }
      if (tag === 'img') {
        const src = source.attrs.src ?? ''
        const stored = storedImage(src, path, input.files)
        if (stored || /^\/(?!\/)/.test(src) || /^https?:\/\//.test(src) || /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(src)) {
          const url = stored ? `/api/artifacts/${encodeURIComponent(input.id)}/originals/${stored.file.sha256}/${stored.path.split('/').map(encodeURIComponent).join('/')}` : src
          const assetId = `asset_${hashId(url)}`
          document.assets[assetId] = { id: assetId, url, contentType: stored?.mime ?? /^data:([^;]+)/.exec(src)?.[1] ?? 'image/*', ...(stored ? { sha256: stored.file.sha256 } : {}), width, height }
          add({ ...createNode('image', nodeId(source.attrs.id)), ...common, assetId, text: source.attrs.alt ?? '' })
        } else { embed(serialize(source), common.x, common.y, width, height, common.parentId) }
        return absolute ? 0 : height
      }
      if (tag === 'table') {
        const tableRows = descendants(source, 'tr')
        const cells = tableRows.map(row => row.children.filter(element).filter(cell => cell.tag === 'td' || cell.tag === 'th').map(textContent))
        const tableHeader = tableRows[0]?.children.some(cell => element(cell) && cell.tag === 'th') ?? false
        add({ ...createNode('table', nodeId(source.attrs.id)), ...common, height: pixels(css.height, box.height, cells.length * fontSize * 1.8), cells, ...(tableHeader ? { tableHeader: true } : {}) })
        return absolute ? 0 : cells.length * fontSize * 1.8
      }
      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'blockquote', 'pre'].includes(tag) || source.children.every(child => !element(child) || ['span', 'b', 'strong', 'em', 'i', 'u', 's', 'a', 'br', 'code'].includes(child.tag.toLowerCase()))) {
        if (!plain) {
          if (style.fill || style.stroke || css.border) {
            add({ ...createNode('shape', nodeId(source.attrs.id)), ...common, style: { fill: 'transparent', ...style }, shape: 'rect' })
            return absolute ? 0 : height
          }
          return 0
        }
        const tex = formula(plain)
        add({ ...createNode(tex === undefined ? 'text' : 'math', nodeId(source.attrs.id)), ...common, style: { fontSize, ...style },
          ...(tex === undefined ? { text: plain, richText: { type: 'doc' as const, content: [richBlock(source)] } } : { source: tex }) })
        return absolute ? 0 : height
      }
      if (!['root', 'html', 'body', 'section', 'div', 'main', 'article', 'header', 'footer', 'figure', 'figcaption', 'nav', 'x-dc'].includes(tag)) {
        embed(serialize(source), common.x, common.y, width, height, common.parentId); return absolute ? 0 : height
      }
      const groupId = nodeId(source.attrs.id), padding = style.padding ?? 0, gap = pixels(css.gap, width, 16)
      const mode = css.display === 'grid' ? 'grid' : css.display === 'flex' ? 'flex' : 'absolute'
      const columns = Number(/^repeat\(\s*(\d+)\s*,/.exec(css['grid-template-columns'] ?? '')?.[1]) || css['grid-template-columns']?.trim().split(/\s+/).length || 2
      const group = add({ ...createNode('group', groupId), ...common, height: pixels(css.height, box.height, box.height),
        layout: { mode, direction: mode === 'flex' && css['flex-direction'] !== 'column' ? 'row' : 'column', gap,
          ...(mode === 'grid' ? { columns: Math.max(1, Math.min(100, columns)) } : {}) } })
      let offset = padding, tallest = 0, childCount = 0
      for (const child of source.children) {
        const childElement = typeof child === 'string' ? (child.trim() ? { tag: 'p', attrs: {}, children: [child] } : null) : child
        if (!childElement) continue
        const consumed = convert(childElement, groupId, { x: box.x + group.x, y: box.y + group.y, width: Math.max(1, width - padding * 2), height: group.height }, offset)
        if (consumed) { offset += consumed + gap; tallest = Math.max(tallest, consumed); childCount++ }
      }
      if (parentId && !css.height) group.height = mode === 'grid' ? Math.ceil(childCount / columns) * (tallest + gap) + padding * 2
        : group.layout?.direction === 'row' ? tallest + padding * 2 : Math.max(1, offset + padding - gap)
      return absolute ? 0 : group.height
    }
    // The imported root remains a declarative container. DOM flex/grid performs final text layout.
    convert(section, null, { x: 0, y: 0, width: page.width, height: page.height }, 0)
  }
  importCanvasAnnotations(document,index.notes,warnings)
  return { document: validateArtifactDocument(document), originals, warnings: [...new Set(warnings)] }
}

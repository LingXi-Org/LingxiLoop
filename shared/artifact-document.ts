import { z } from 'zod'
import { canvasPages, canvasPageOf, artifactPageIds, MAX_CANVAS_PAGES } from './artifact-canvas-pages.js'
import {isArtifactPenPath} from './artifact-path.js'

/** Native documents contain data only. Executable source belongs to an isolated embed. */
export const ARTIFACT_DOCUMENT_SCHEMA_VERSION = 1 as const
export const artifactIdSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/).refine(value => !['__proto__', 'prototype', 'constructor'].includes(value), 'reserved id')
const finite = z.number().finite().min(-1_000_000).max(1_000_000)
const positive = z.number().finite().min(0).max(1_000_000)
const version = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const safeKey = z.string().min(1).max(512).refine(key => !['__proto__', 'prototype', 'constructor'].includes(key), 'unsafe key')
const color = z.string().max(128).refine(value => !/[<>;\\]|url\s*\(|expression\s*\(|@import/i.test(value), 'invalid color')

export const artifactStyleSchema = z.object({
  fill: color.optional(), color: color.optional(), stroke: color.optional(), strokeWidth: positive.optional(),
  backgroundColor: color.optional(), borderColor: color.optional(), borderWidth: positive.optional(),
  opacity: z.number().min(0).max(1).optional(), borderRadius: positive.optional(),
  gradient: z.object({ type: z.enum(['linear', 'radial']), angle: finite, stops: z.array(z.object({ color, offset: z.number().min(0).max(1) }).strict()).min(2).max(32) }).strict().optional(),
  shadow: z.object({ x: finite, y: finite, blur: positive, spread: finite, color }).strict().optional(),
  borderStyle: z.enum(['solid', 'dashed', 'dotted', 'double', 'none']).optional(),
  letterSpacing: finite.optional(), verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  fontFamily: z.string().max(200).refine(value => !/[<>;{}]/.test(value)).optional(),
  fontSize: z.number().min(1).max(1000).optional(), fontWeight: z.number().int().min(100).max(1000).optional(),
  fontStyle: z.enum(['normal', 'italic']).optional(), textAlign: z.enum(['left', 'center', 'right', 'justify']).optional(),
  textDecoration: z.enum(['none', 'underline', 'line-through']).optional(), lineHeight: z.number().min(0.5).max(10).optional(),
  themeColorFallback: color.optional(), themeFontFallback: z.string().max(200).refine(value => !/[<>;{}]/.test(value)).optional(),
  padding: positive.optional(), paddingX: positive.optional(), paddingY: positive.optional(), themeColor: z.string().max(128).optional(), themeFont: z.string().max(128).optional(), themeFill: z.string().max(128).optional(),
}).strict()
export type ArtifactStyle = z.infer<typeof artifactStyleSchema>

const safeLink = (value: string) => /^(https?:\/\/|mailto:|#)/i.test(value) && !/[\u0000-\u0020<>]/.test(value)
export interface ArtifactRichText {
  type: 'doc' | 'paragraph' | 'heading' | 'text' | 'bulletList' | 'orderedList' | 'listItem' | 'hardBreak' | 'blockquote'
  text?: string
  attrs?: { level?: number; start?: number; textAlign?: 'left' | 'center' | 'right' | 'justify' }
  marks?: Array<{ type: 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'link'; attrs?: { href: string; target?: '_blank' | '_self' } }>
  content?: ArtifactRichText[]
}
const richTextNodeSchema: z.ZodType<ArtifactRichText> = z.lazy(() => z.object({
  type: z.enum(['doc', 'paragraph', 'heading', 'text', 'bulletList', 'orderedList', 'listItem', 'hardBreak', 'blockquote']),
  text: z.string().max(100_000).optional(),
  attrs: z.object({ level: z.number().int().min(1).max(6).optional(), start: z.number().int().min(0).max(100_000).optional(), textAlign: z.enum(['left', 'center', 'right', 'justify']).optional() }).strict().optional(),
  marks: z.array(z.object({ type: z.enum(['bold', 'italic', 'underline', 'strike', 'code', 'link']), attrs: z.object({ href: z.string().max(2048).refine(safeLink, 'unsafe link'), target: z.enum(['_blank', '_self']).optional() }).strict().optional() }).strict()).max(16).optional(),
  content: z.array(richTextNodeSchema).max(10_000).optional(),
}).strict())
export const artifactRichTextSchema = z.preprocess((input, context) => {
  const stack = [{ value: input, depth: 0 }]
  const seen = new Set<object>()
  while (stack.length) {
    const { value, depth } = stack.pop()!
    if (!value || typeof value !== 'object') continue
    if (seen.has(value) || depth > 64 || seen.size >= 20_000) {
      context.addIssue({ code: 'custom', message: 'Rich text exceeds the supported depth or size' })
      return z.NEVER
    }
    seen.add(value)
    const content = (value as Record<string, unknown>).content
    if (Array.isArray(content)) for (const child of content) stack.push({ value: child, depth: depth + 1 })
  }
  return input
}, richTextNodeSchema)

/** A deliberately small SVG vocabulary; unsupported SVG imports become isolated embeds. */
export function isSafeArtifactSvg(value: string): boolean {
  if (value.length > 1_000_000 || /[\u0000-\u0008]|<!|<\?|\\|@import/i.test(value)) return false
  const tags = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'title', 'desc'])
  const attributes = new Set(['xmlns', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-opacity', 'opacity', 'transform', 'id', 'clip-path', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'fx', 'fy', 'preserveAspectRatio', 'role', 'aria-label'])
  const stack: string[] = []
  let cursor = 0, roots = 0, tagCount = 0
  while (cursor < value.length) {
    const start = value.indexOf('<', cursor)
    const text = value.slice(cursor, start === -1 ? value.length : start)
    if (!stack.length && text.trim()) return false
    if (start === -1) break
    let quote: string | null = null, end = start + 1
    for (; end < value.length; end++) {
      const char = value[end]!
      if (quote !== null) { if (char === quote) quote = null }
      else if (char === '"' || char === "'") quote = char
      else if (char === '>') break
      else if (char === '<') return false
    }
    if (end === value.length || quote !== null || ++tagCount > 20_000) return false
    const token = value.slice(start, end + 1)
    cursor = end + 1
    if (token.startsWith('</')) {
      const close = /^<\/([a-zA-Z][a-zA-Z0-9]*)\s*>$/.exec(token)
      if (!close || stack.pop() !== close[1]) return false
      continue
    }
    const match = /^<([a-zA-Z][a-zA-Z0-9]*)([\s\S]*?)(\/?)>$/.exec(token)
    if (!match || !tags.has(match[1]!)) return false
    if (!stack.length && (++roots > 1 || match[1] !== 'svg')) return false
    if (!match[3]) stack.push(match[1]!)
    if (stack.length > 64) return false
    let remaining = match[2]!
    while (remaining) {
      if (!remaining.trim()) break
      const attribute = /^\s+([a-zA-Z][a-zA-Z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(remaining)
      if (!attribute || !attributes.has(attribute[1]!)) return false
      const content = attribute[2] ?? attribute[3] ?? ''
      if (/[<>&]/.test(content) || /(?:javascript|data|https?):|expression\s*\(/i.test(content) && attribute[1] !== 'xmlns') return false
      if (attribute[1] === 'xmlns' && content !== 'http://www.w3.org/2000/svg') return false
      if (/url\s*\(/i.test(content) && !/^url\(#[a-zA-Z0-9_-]+\)$/.test(content)) return false
      remaining = remaining.slice(attribute[0].length)
    }
  }
  return roots === 1 && stack.length === 0
}

export const artifactNodeTypes = ['text', 'image', 'shape', 'line', 'table', 'svg', 'math', 'group', 'embed', 'note', 'drawing', 'video'] as const
export const artifactNodeSchema = z.object({
  id: artifactIdSchema,
  motionId: artifactIdSchema.optional(),
  type: z.enum(artifactNodeTypes),
  x: finite, y: finite, width: positive, height: positive, rotation: finite,
  parentId: artifactIdSchema.nullable(),
  name: z.string().max(1000).optional(), scope: z.enum(['artboard', 'canvas']).optional(),
  flipX: z.boolean().optional(), flipY: z.boolean().optional(),
  lineStart: z.enum(['none', 'arrow', 'circle']).optional(), lineEnd: z.enum(['none', 'arrow', 'circle']).optional(),
  style: artifactStyleSchema,
  text: z.string().max(100_000).optional(), textSizing: z.enum(['content']).optional(), richText: artifactRichTextSchema.optional(), source: z.string().max(100_000).optional(),
  assetId: artifactIdSchema.optional(),
  posterAssetId: artifactIdSchema.optional(),
  crop: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(0).max(1), height: z.number().min(0).max(1) }).strict().optional(),
  shape: z.enum(['rect', 'ellipse', 'triangle', 'diamond', 'arrow', 'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down']).optional(),
  points: z.array(z.object({ x: finite, y: finite }).strict()).max(10_000).optional(),
  path: z.object({d:z.string().max(24000).refine(isArtifactPenPath,'绘图路径格式无效'),width:z.number().finite().min(2).max(8000),height:z.number().finite().min(2).max(8000)}).strict().optional(),
  tableHeader: z.boolean().optional(),
  cells: z.array(z.array(z.string().max(10_000)).max(100)).max(100).optional(),
  svg: z.string().refine(isSafeArtifactSvg, 'unsupported or unsafe SVG').optional(),
  embed: z.object({ source: z.string().max(4_000_000), format: z.enum(['html', 'jsx']), sourceHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), resourceVersion: z.string().regex(/^local-[a-f0-9]{16}$/).optional(), originalPath: z.string().max(512).optional(), previewAssetId: artifactIdSchema.optional() }).strict().optional(),
  layout: z.object({ mode: z.enum(['absolute', 'flex', 'grid']), direction: z.enum(['row', 'column']).optional(), gap: positive.optional(), columns: z.number().int().min(1).max(100).optional(), align: z.enum(['start', 'center', 'end', 'stretch']).optional(), justify: z.enum(['start', 'center', 'end', 'space-between']).optional() }).strict().optional(),
  locked: z.boolean().optional(), hidden: z.boolean().optional(),
  animation: z.enum(['none', 'appear', 'fade', 'slide']).optional(),
}).strict()
export type ArtifactNode = z.infer<typeof artifactNodeSchema>
export type ArtifactNodeType = ArtifactNode['type']

export const artifactPageSchema = z.object({
  id: artifactIdSchema, title: z.string().max(1000),
  x: finite, y: finite, width: positive, height: positive,
  sizing: z.enum(['fixed', 'flow']).optional(), paper: z.enum(['A4', 'Letter', 'custom']).optional(),
  section: z.string().max(200).optional(),
  interactive: z.boolean().optional(), frameless: z.boolean().optional(),
  canvasPageId: artifactIdSchema.optional(),
  guides: z.array(z.object({ axis: z.enum(['x', 'y']), position: finite }).strict()).max(100).optional(),
  layoutGuides: z.array(z.object({ kind: z.enum(['columns', 'rows', 'grid']), count: z.number().int().min(1).max(1000), size: positive, gutter: positive, margin: positive, color, hidden: z.boolean().optional() }).strict()).max(6).optional(),
  background: color, themeBackground: z.string().max(128).optional(), notes: z.string().max(100_000), skip: z.boolean(), transition: z.enum(['none', 'fade', 'push', 'magic', 'slide']),
  nodeOrder: z.array(artifactIdSchema).max(10_000), nodes: z.record(artifactIdSchema, artifactNodeSchema),
}).strict()
export type ArtifactPage = z.infer<typeof artifactPageSchema>

const themeResourcePath = z.string().max(512).regex(/^[a-zA-Z0-9_./-]+\.(?:json|css|html|md)$/)
  .refine(path => path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..' && !['__proto__', 'prototype', 'constructor'].includes(segment)), 'theme resources require safe relative paths')
const utf8Bytes = (value: string) => new TextEncoder().encode(value).byteLength
/** Retained authoring sources are metadata, never native DOM markup or styles. */
export const artifactThemeResourcesSchema = z.record(themeResourcePath, z.string().max(2 * 1024 * 1024)
  .refine(value => utf8Bytes(value) <= 2 * 1024 * 1024, 'theme resource exceeds 2 MiB'))
  .refine(resources => Object.keys(resources).length <= 30, 'retain at most 30 theme resources')
  .refine(resources => Object.values(resources).reduce((total, value) => total + utf8Bytes(value), 0) <= 4 * 1024 * 1024, 'theme resources exceed 4 MiB')

export const artifactThemeSchema = z.object({
  id: artifactIdSchema, name: z.string().max(200), tokens: z.record(safeKey, z.union([z.string().max(1000), z.number().finite()])),
  source: z.object({ namespace: z.string().max(128), variant: z.string().max(128), version: z.string().max(128).optional(), url: z.string().max(2048).optional() }).strict().optional(),
  originalTokens: z.json().optional(),
  resources: artifactThemeResourcesSchema.optional(),
}).strict()
export type ArtifactTheme = z.infer<typeof artifactThemeSchema>
export const artifactAssetSchema = z.object({
  id: artifactIdSchema,
  url: z.string().max(4 * 1024 * 1024).refine(url => /^\/(?!\/)/.test(url) || /^https?:\/\//.test(url) || /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(url), 'asset URL must be a storage path, HTTP URL or encoded raster image'),
  contentType: z.string().max(200), sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(), width: positive.optional(), height: positive.optional(),
}).strict()
export type ArtifactAsset = z.infer<typeof artifactAssetSchema>

export const artifactCanvasPageSchema = z.object({id:artifactIdSchema,name:z.string().min(1).max(1000).refine(name=>Boolean(name.trim())),contentId:artifactIdSchema.optional()}).strict()
export type ArtifactCanvasPage = z.infer<typeof artifactCanvasPageSchema>

export const artifactDocumentSchema = z.object({
  schemaVersion: z.literal(ARTIFACT_DOCUMENT_SCHEMA_VERSION),
  id: artifactIdSchema, kind: z.enum(['design', 'slides']), title: z.string().max(1000), seq: version,
  themeId: artifactIdSchema.nullable(), themes: z.record(artifactIdSchema, artifactThemeSchema), assets: z.record(artifactIdSchema, artifactAssetSchema),
  pageOrder: z.array(artifactIdSchema).max(1000), pages: z.record(artifactIdSchema, artifactPageSchema),
  canvasPages: z.array(artifactCanvasPageSchema).min(1).max(MAX_CANVAS_PAGES).optional(),
  versions: z.record(safeKey, version),
}).strict()
export type ArtifactDocument = z.infer<typeof artifactDocumentSchema>

export function createDocument(kind: ArtifactDocument['kind'], id: string, title = kind === 'design' ? '设计' : '演示文稿'): ArtifactDocument {
  return { schemaVersion: 1, id, kind, title, seq: 0, themeId: null, themes: {}, assets: {}, pageOrder: [], pages: {}, versions: {} }
}
export function createPage(id: string, title = '页面'): ArtifactPage {
  return { id, title, x: 0, y: 0, width: 1280, height: 720, background: '#ffffff', themeBackground: 'background', notes: '', skip: false, transition: 'none', nodeOrder: [], nodes: {} }
}
export function createNode(type: ArtifactNodeType, id: string): ArtifactNode {
  const style: ArtifactStyle = type === 'text' || type === 'math' || type === 'table' ? { themeColor: 'text', themeFont: 'font.sans' } : type === 'shape' ? { themeFill: 'accent' } : {}
  return { id, type, x: 80, y: 80, width: 320, height: type === 'text' ? 64 : 180, rotation: 0, parentId: null, style,
    ...(type === 'text' ? { text: '文本' } : type === 'math' ? { source: 'E=mc^2' } : type === 'shape' ? { shape: 'rect' as const } : type === 'table' ? { cells: [['', ''], ['', '']] } : {}) }
}

/** Canvas membership is a document-wide metadata relation, even when page bodies are unchanged. */
export function validateArtifactCanvasPages(document: Pick<ArtifactDocument,'kind'|'canvasPages'|'pages'|'pageOrder'>): void {
  const canvas = canvasPages(document), ids = new Set(canvas.map(page=>page.id))
  if (ids.size !== canvas.length) throw new Error('画布页面标识重复。')
  if (document.kind !== 'design' && (document.canvasPages || Object.values(document.pages).some(page=>page.canvasPageId))) throw new Error('画布页面只适用于设计稿件。')
  if (document.kind === 'design' && Object.values(document.pages).some(page=>!ids.has(canvasPageOf(page)))) throw new Error('画板所属页面不存在。')
  const contents=canvas.flatMap(page=>page.contentId?[page.contentId]:[])
  const all=artifactPageIds(document)
  if(new Set(all).size!==all.length||all.length!==Object.keys(document.pages).length||all.some(id=>!Object.hasOwn(document.pages,id)))throw new Error('画板与画布内容索引不一致。')
  if(document.pageOrder.some(id=>document.pages[id]&&(document.pages[id]!.width<=0||document.pages[id]!.height<=0)))throw new Error('画板尺寸必须大于零。')
  if(new Set(contents).size!==contents.length||contents.some(id=>document.pageOrder.includes(id)))throw new Error('画布内容不能共用或列入画板顺序。')
  for(const sheet of canvas)if(sheet.contentId&&(!document.pages[sheet.contentId]||canvasPageOf(document.pages[sheet.contentId]!)!==sheet.id))throw new Error('画布内容归属无效。')
  for(const sheet of canvas)if(sheet.contentId){const page=document.pages[sheet.contentId]!;if(page.x!==0||page.y!==0||page.width!==0||page.height!==0)throw new Error('独立画布内容不能具有画板边界。')}
}

/** Referential validation also applies after a batch, allowing create+link in one transaction. */
export function validateArtifactDocument(input: unknown): ArtifactDocument {
  const document = artifactDocumentSchema.parse(input)
  const sameIds = (order: string[], entries: Record<string, unknown>) => order.length === new Set(order).size && order.length === Object.keys(entries).length && order.every(id => Object.hasOwn(entries, id))
  validateArtifactCanvasPages(document)
  if (!sameIds(artifactPageIds(document), document.pages)) throw new Error('page order must include every page exactly once')
  if (document.themeId !== null && !Object.hasOwn(document.themes, document.themeId)) throw new Error('unknown theme')
  for (const [id, theme] of Object.entries(document.themes)) if (id !== theme.id) throw new Error('theme id mismatch')
  for (const [id, asset] of Object.entries(document.assets)) if (id !== asset.id) throw new Error('asset id mismatch')
  for (const [id, page] of Object.entries(document.pages)) {
    if (id !== page.id || !sameIds(page.nodeOrder, page.nodes)) throw new Error('invalid page or node order')
    for (const [nodeId, node] of Object.entries(page.nodes)) {
      if (nodeId !== node.id) throw new Error('node id mismatch')
      if (node.assetId && !Object.hasOwn(document.assets, node.assetId)) throw new Error('unknown asset')
      if (node.posterAssetId && !Object.hasOwn(document.assets, node.posterAssetId)) throw new Error('unknown poster asset')
      if (node.embed?.previewAssetId && !Object.hasOwn(document.assets, node.embed.previewAssetId)) throw new Error('unknown preview asset')
      const ancestors = new Set([node.id])
      let parentId = node.parentId
      while (parentId !== null) {
        const parent = page.nodes[parentId]
        if (!parent || parent.type !== 'group' || ancestors.has(parentId)) throw new Error('invalid parent or group cycle')
        ancestors.add(parentId)
        parentId = parent.parentId
      }
    }
  }
  return document
}

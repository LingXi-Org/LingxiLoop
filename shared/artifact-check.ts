import { artifactDocumentSchema, type ArtifactDocument, type ArtifactNode, type ArtifactRichText } from './artifact-document.js'

export interface ArtifactCheckIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  pageId?: string
  nodeId?: string
}
export interface ArtifactCheckReport {
  problems: number
  issues: ArtifactCheckIssue[]
  pageCount: number
  boardCount: number
  checkedPageIds: string[]
  checkedBoardPaths: string[]
}

function richTextContent(value: ArtifactRichText | undefined): string {
  return value ? (value.text ?? '') + (value.content ?? []).map(richTextContent).join('') : ''
}
function hasContent(node: ArtifactNode): boolean {
  if (node.hidden || node.width <= 0 || node.height <= 0 && node.type !== 'line') return false
  if (node.type === 'text') return Boolean((node.richText ? richTextContent(node.richText) : node.text ?? '').trim())
  if (node.type === 'math') return Boolean(node.source?.trim())
  if (node.type === 'image') return Boolean(node.assetId)
  if (node.type === 'svg') return Boolean(node.svg)
  if (node.type === 'embed') return Boolean(node.embed?.source.trim())
  if (node.type === 'table') return Boolean(node.cells?.length)
  return node.type !== 'group'
}

/** Structural evidence only. Rendering, formula compilation and export are separate acceptance checks. */
export function checkArtifactDocument(input: unknown, requestedPaths?: readonly string[]): ArtifactCheckReport {
  const issues: ArtifactCheckIssue[] = []
  const result: ArtifactCheckReport = { problems: 0, issues, pageCount: 0, boardCount: 0, checkedPageIds: [], checkedBoardPaths: [] }
  const add = (code: string, message: string, pageId?: string, nodeId?: string, severity: ArtifactCheckIssue['severity'] = 'error') => {
    issues.push({ severity, code, message, ...(pageId ? { pageId } : {}), ...(nodeId ? { nodeId } : {}) })
    if (severity === 'error') result.problems++
  }
  let document: ArtifactDocument
  try {
    const parsed = artifactDocumentSchema.safeParse(input)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.map(String), pageIndex = path.indexOf('pages'), nodeIndex = path.indexOf('nodes')
        add(path[0] === 'schemaVersion' ? 'unsupported_schema' : 'invalid_schema', `${path.join('.') || 'document'}: ${issue.message}`,
          pageIndex === -1 ? undefined : path[pageIndex + 1], nodeIndex === -1 ? undefined : path[nodeIndex + 1])
      }
      return result
    }
    document = parsed.data
  } catch {
    add('invalid_schema', '文档结构无法读取。')
    return result
  }
  result.pageCount = document.pageOrder.length
  result.boardCount = document.kind === 'design' ? result.pageCount : 0
  const sameKeys = (order: string[], values: Record<string, unknown>) => order.length === new Set(order).size && order.length === Object.keys(values).length && order.every(id => Object.hasOwn(values, id))
  if (!sameKeys(document.pageOrder, document.pages)) add('page_order', '页面顺序必须包含每个页面，且不能重复。')
  if (document.themeId !== null && !Object.hasOwn(document.themes, document.themeId)) add('missing_theme', `主题不存在：${document.themeId}`)
  for (const [id, theme] of Object.entries(document.themes)) if (id !== theme.id) add('theme_id', '主题 ID 与索引不一致。')
  for (const [id, asset] of Object.entries(document.assets)) if (id !== asset.id) add('asset_id', '资源 ID 与索引不一致。')
  for (const [pageId, page] of Object.entries(document.pages)) {
    if (page.id !== pageId) add('page_id', '页面 ID 与索引不一致。', pageId)
    if (page.width <= 0 || page.height <= 0) add('page_size', '页面尺寸必须大于零。', pageId)
    if (!sameKeys(page.nodeOrder, page.nodes)) add('node_order', '元素顺序必须包含每个元素，且不能重复。', pageId)
    for (const [nodeId, node] of Object.entries(page.nodes)) {
      if (node.id !== nodeId) add('node_id', '元素 ID 与索引不一致。', pageId, nodeId)
      if (node.assetId && !Object.hasOwn(document.assets, node.assetId)) add('missing_asset', `图片资源不存在：${node.assetId}`, pageId, nodeId)
      if (node.embed?.previewAssetId && !Object.hasOwn(document.assets, node.embed.previewAssetId)) add('missing_preview', '隔离内容预览资源不存在。', pageId, nodeId)
      const visited = new Set([nodeId])
      let parentId = node.parentId
      while (parentId !== null) {
        if (visited.has(parentId)) { add('group_cycle', '组合关系不能形成循环。', pageId, nodeId); break }
        const parent = page.nodes[parentId]
        if (!parent || parent.type !== 'group') { add('missing_parent', '父元素不存在或不是组合。', pageId, nodeId); break }
        visited.add(parentId)
        parentId = parent.parentId
      }
      switch (node.type) {
        case 'text': if (node.text === undefined && node.richText === undefined) add('missing_text', '文字元素缺少文本数据。', pageId, nodeId); break
        case 'image': if (!node.assetId) add('missing_image', '图片元素尚未关联资源。', pageId, nodeId); break
        case 'math': if (!node.source?.trim()) add('missing_formula', '公式元素缺少 TeX 源码。', pageId, nodeId); break
        case 'svg': if (!node.svg) add('missing_svg', 'SVG 元素缺少图形数据。', pageId, nodeId); break
        case 'table': if (!node.cells) add('missing_table', '表格元素缺少单元格数据。', pageId, nodeId); break
        case 'embed':
          if (!node.embed?.source.trim()) add('missing_embed', '隔离内容缺少源文件。', pageId, nodeId)
          else add('isolated_content', '此内容在隔离环境中运行，不能逐元素编辑；结构检查不验证其运行结果。', pageId, nodeId, 'warning')
          break
      }
    }
  }
  const requested = requestedPaths === undefined ? document.pageOrder : [...new Set(requestedPaths.slice(0, 32).flatMap(path => {
    const match = /^project\/pages\/([a-zA-Z0-9_-]{1,128})\.json$/.exec(path)
    return match && document.pageOrder.includes(match[1]!) ? [match[1]!] : []
  }))]
  for (const id of requested) {
    const page = document.pages[id]
    if (!page) continue
    const visibleContent = Object.values(page.nodes).some(node => {
      if (!hasContent(node) || node.style.opacity === 0) return false
      const visited = new Set<string>()
      let parentId = node.parentId
      while (parentId !== null) {
        if (visited.has(parentId)) return false
        visited.add(parentId)
        const parent = page.nodes[parentId]
        if (!parent || parent.hidden || parent.style.opacity === 0) return false
        parentId = parent.parentId
      }
      return true
    })
    if (!visibleContent) {
      if (requestedPaths !== undefined) add('empty_page', '请求检查的页面尚无可见内容，不能作为已完成的创作证据。', id)
      continue
    }
    if (issues.some(issue => issue.severity === 'error' && (!issue.pageId || issue.pageId === id))) continue
    result.checkedPageIds.push(id)
    if (document.kind === 'design') result.checkedBoardPaths.push(`project/pages/${id}.json`)
  }
  return result
}

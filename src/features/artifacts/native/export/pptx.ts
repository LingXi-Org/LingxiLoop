import { trackExportWorker, releaseExportWorker } from './worker-lifecycle'
import type { ArtifactDocument, ArtifactRichText } from '../../../../../shared/artifact-document'
import { artifactPageBackground, artifactResolvedStyle } from '../../../../../shared/artifact-themes'
import type { ArtifactExportOptions, ArtifactExportResult } from '../export-artifact'
import { exportFilename, ExportResources } from './common'
import { mountExportPage, nodeHasMath } from './render'
import type { PptxJob, PptxPage } from './pptx.worker'

const color = (value: string | undefined, fallback = '141413') => /^#[a-fA-F0-9]{6}$/.test(value ?? '') ? value!.slice(1) : /^#[a-fA-F0-9]{3}$/.test(value ?? '') ? [...value!.slice(1)].map(character => character + character).join('') : fallback
function packPptx(job: PptxJob, signal?: AbortSignal): Promise<ArrayBuffer> {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const worker = trackExportWorker(new Worker(new URL('./pptx.worker.ts', import.meta.url), { type: 'module' }))
    const cleanup = () => { releaseExportWorker(worker); signal?.removeEventListener('abort', aborted) }
    const aborted = () => { cleanup(); reject(signal?.reason ?? new DOMException('Export cancelled', 'AbortError')) }
    signal?.addEventListener('abort', aborted, { once: true })
    worker.onmessage = (event: MessageEvent<{ bytes?: ArrayBuffer; error?: string }>) => {
      cleanup()
      if (event.data.bytes) resolve(event.data.bytes)
      else reject(new Error(event.data.error ?? 'PPTX 打包失败'))
    }
    worker.onerror = event => { cleanup(); reject(new Error(event.message)) }
    worker.postMessage(job)
  })
}
function textRuns(node: ArtifactRichText): Array<{ text: string; options?: Record<string, unknown> }> {
  if (node.type === 'text') {
    const options: Record<string, unknown> = {}
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') options.bold = true
      if (mark.type === 'italic') options.italic = true
      if (mark.type === 'underline') options.underline = true
      if (mark.type === 'strike') options.strike = true
      if (mark.type === 'link' && mark.attrs) options.hyperlink = { url: mark.attrs.href }
    }
    return [{ text: node.text ?? '', options }]
  }
  if (node.type === 'hardBreak') return [{ text: '\n' }]
  const children = (node.content ?? []).flatMap(textRuns)
  if (['paragraph', 'heading', 'listItem'].includes(node.type)) children.push({ text: '\n' })
  return children
}

export async function exportDocument(document: ArtifactDocument, options: ArtifactExportOptions): Promise<ArtifactExportResult> {
  const resources = new ExportResources(document, options)
  try {
    const { toPng } = await import('html-to-image')
    const pages: PptxPage[] = []
    const first = document.pages[document.pageOrder[0] ?? '']
    if (!first) throw new Error('没有可导出的页面')
    for (const [index, pageId] of document.pageOrder.entries()) {
      const page = document.pages[pageId]!, output: PptxPage = { background: color(artifactPageBackground(page, document), 'FFFFFF'), notes: page.notes, hidden: page.skip, commands: [] }
      pages.push(output)
      const slide = {
        addText: (...args: unknown[]) => output.commands.push({ kind: 'text', args }),
        addShape: (...args: unknown[]) => output.commands.push({ kind: 'shape', args }),
        addTable: (...args: unknown[]) => output.commands.push({ kind: 'table', args }),
        addImage: (...args: unknown[]) => output.commands.push({ kind: 'image', args }),
      }
      if (page.width !== first.width || page.height !== first.height) resources.warnings.add(`${page.title}：PPTX 使用第一页尺寸，其他画板等比缩放。`)
      const scale = Math.min(first.width / page.width, first.height / page.height)
      const mounted = await mountExportPage(page, resources)
      try {
        const pageBounds = mounted.element.getBoundingClientRect()
        // Group IDs are not necessarily before their children in nodeOrder:
        // grouping existing objects appends the group after those objects.
        const rasterGroups = new Set(page.nodeOrder.filter(id => {
          const node=page.nodes[id]!, style=artifactResolvedStyle(node.style,document)
          return node.type==='group' && !!(style.gradient || style.shadow || node.flipX || node.flipY)
        }))
        for (const id of page.nodeOrder) {
          resources.check()
          const node = page.nodes[id]!
          const style = artifactResolvedStyle(node.style, document)
          if (node.hidden || node.scope === 'canvas') continue
          let parentId = node.parentId, captured = false
          while (parentId) { if (rasterGroups.has(parentId)) { captured = true; break } parentId = page.nodes[parentId]?.parentId ?? null }
          if (captured) continue
          const element = mounted.element.querySelector<HTMLElement>(`[data-node-id="${node.id}"]`)
          if (!element) continue
          const rect = element.getBoundingClientRect()
          const box = { x: (rect.x + rect.width / 2 - element.offsetWidth / 2 - pageBounds.x) / 96 * scale, y: (rect.y + rect.height / 2 - element.offsetHeight / 2 - pageBounds.y) / 96 * scale, w: element.offsetWidth / 96 * scale, h: element.offsetHeight / 96 * scale }
          let rotation = node.rotation, ancestor = node.parentId
          while (ancestor) { rotation += page.nodes[ancestor]!.rotation; ancestor = page.nodes[ancestor]!.parentId }
          if (box.w <= 0 || box.h <= 0) continue
          const computed = getComputedStyle(element)
          const fontSize = (style.fontSize ?? Number.parseFloat(computed.fontSize)) * .75 * scale
          if (style.gradient || style.shadow || node.flipX || node.flipY || node.type === 'video') {
            const data = await toPng(element, { pixelRatio: 2, skipAutoScale: true, style: { position: 'static', left: '0', top: '0', transform: 'none', margin: '0' } })
            resources.check(); slide.addImage({data,...box,rotate:rotation,flipH:node.flipX,flipV:node.flipY})
            if (node.type === 'group') rasterGroups.add(node.id)
            resources.warnings.add(`${page.title} / ${node.id}：复杂外观以图片导出；原稿保留可编辑属性。`)
          } else if (node.type === 'group') {
            if (style.fill) slide.addShape('rect', { ...box, fill: { color: color(style.fill, 'FFFFFF') }, line: { transparency: 100 } })
          } else if ((node.type === 'text' || node.type === 'note') && !nodeHasMath(node)) {
            slide.addText(node.richText ? textRuns(node.richText) : node.text ?? '', { ...box, fontSize, fontFace: (style.fontFamily ?? 'Arial').split(',')[0]!.replace(/["']/g, ''),
              color: color(style.color), bold: (style.fontWeight ?? 400) >= 600, italic: style.fontStyle === 'italic', align: style.textAlign ?? 'left',
              margin: (style.padding??0)*.75*scale, ...(node.type==='note' && style.fill ? {fill:{color:color(style.fill,'FFF3B0')}} : {}), breakLine: false, valign: 'top', rotate: rotation, transparency: (1 - (style.opacity ?? 1)) * 100 })
          } else if (node.type === 'shape') {
            const shape = ({ rect: style.borderRadius ? 'roundRect' : 'rect', ellipse: 'ellipse', triangle: 'triangle', diamond: 'diamond', arrow: 'rightArrow' } as const)[node.shape ?? 'rect']
            slide.addShape(shape, { ...box, rectRadius: Math.min(.5, (style.borderRadius ?? 0) / Math.min(node.width, node.height)), rotate: rotation, fill: { color: color(style.fill, 'D97757'), transparency: (1 - (style.opacity ?? 1)) * 100 }, line: style.stroke && style.strokeWidth ? { color: color(style.stroke), width: style.strokeWidth * .75 } : { transparency: 100 } })
          } else if (node.type === 'table' && !nodeHasMath(node)) {
            slide.addTable((node.cells ?? []).map(row => row.map(text => ({ text }))), { ...box, fontSize, color: color(style.color), border: { type: 'solid', color: color(style.stroke, '73726C'), pt: 1 }, margin: 4, autoPage: false })
          } else if (node.type === 'line' && (!node.points || node.points.length === 2)) {
            slide.addShape('line', { ...box, line: { color: color(style.stroke ?? style.color), width: (style.strokeWidth ?? 2) * .75 } })
          } else {
            // Only unsupported nodes become pictures; ordinary objects on the page remain editable.
            const data = await toPng(element, { pixelRatio: 2, skipAutoScale: true, style: { position: 'static', left: '0', top: '0', transform: 'none', margin: '0' } })
            resources.check()
            slide.addImage({ data, ...box, rotate: rotation })
            if (['math', 'svg', 'embed', 'text', 'table'].includes(node.type)) resources.warnings.add(`${page.title} / ${node.id}：${node.type === 'math' ? '公式' : '复杂内容'}以图片导出；文档保留源数据。`)
          }
        }
      } finally { mounted.dispose() }
      resources.progress(index + 1)
    }
    resources.check()
    const output = await packPptx({ title: document.title, subject: document.kind === 'slides' ? '演示文稿' : '设计画板', width: first.width / 96, height: first.height / 96, pages }, options.signal)
    resources.check()
    return { blob: new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), filename: exportFilename(document.title, 'pptx'), warnings: [...resources.warnings] }
  } finally { resources.dispose() }
}

import type { ArtifactDocument } from '../../../../../shared/artifact-document'
import type { ArtifactExportOptions, ArtifactExportResult } from '../export-artifact'
import { escapeHtml, exportFilename, ExportResources, offlineMathCss } from './common'
import { offlineDocumentFonts } from './fonts'
import { EXPORT_PAGE_CSS, nodeHasMath, renderPageHtml } from './render'

export async function exportDocument(document: ArtifactDocument, options: ArtifactExportOptions): Promise<ArtifactExportResult> {
  const resources = new ExportResources(document, options)
  try {
    const pages: string[] = []
    for (const [index, id] of document.pageOrder.entries()) {
      const page = document.pages[id]!
      pages.push(`<article${page.skip ? ' data-skipped="true"' : ''}>${await renderPageHtml(page, resources)}<aside hidden>${escapeHtml(page.notes)}</aside></article>`)
      resources.progress(index + 1)
    }
    const math = Object.values(document.pages).some(page => Object.values(page.nodes).some(nodeHasMath))
    const css = EXPORT_PAGE_CSS + await offlineDocumentFonts(resources) + (math ? await offlineMathCss(options.signal) : '')
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-src 'self' data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(document.title)}</title><style>${css}\nhtml,body{margin:0;background:#252525}article{width:max-content;max-width:none;margin:24px auto}nav{position:sticky;top:0;padding:8px;display:flex;gap:12px;background:#fff;z-index:10}button{font:inherit;padding:6px 12px}article:focus{outline:3px solid #d97757}@media print{nav{display:none}article{break-after:page;margin:0}@page{margin:0}}</style></head><body><nav aria-label="放映导航"><button type="button" id="previous">上一页</button><button type="button" id="next">下一页</button><output id="position">1 / ${pages.length}</output></nav><main>${pages.join('\n')}</main><script>(()=>{const pages=[...document.querySelectorAll('main>article')];let current=0;function go(delta){current=Math.max(0,Math.min(pages.length-1,current+delta));pages[current]?.scrollIntoView({block:'start'});document.querySelector('#position').textContent=(current+1)+' / '+pages.length}document.querySelector('#previous').onclick=()=>go(-1);document.querySelector('#next').onclick=()=>go(1);document.addEventListener('keydown',event=>{if(['ArrowRight','PageDown'].includes(event.key))go(1);if(['ArrowLeft','PageUp'].includes(event.key))go(-1)})})();</script></body></html>`
    return { blob: new Blob([html], { type: 'text/html;charset=utf-8' }), filename: exportFilename(document.title, 'html'), warnings: [...resources.warnings] }
  } finally { resources.dispose() }
}

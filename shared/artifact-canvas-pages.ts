import type { ArtifactCanvasPage, ArtifactDocument, ArtifactPage } from './artifact-document.js'
import type { ArtifactOperation } from './artifact-operations.js'

export const MAX_CANVAS_PAGES = 40
export const DEFAULT_CANVAS_PAGE = {id:'canvas-page-1',name:'页面 1'} as const
export function canvasPages(document: Pick<ArtifactDocument, 'canvasPages'>): readonly ArtifactCanvasPage[] {
  return document.canvasPages ?? [{...DEFAULT_CANVAS_PAGE}]
}
export const canvasPageOf = (page: Pick<ArtifactPage, 'canvasPageId'>) => page.canvasPageId ?? DEFAULT_CANVAS_PAGE.id
function requireDesign(document: ArtifactDocument) {
  if (document.kind !== 'design') throw new Error('此操作只适用于设计画布。')
}
export function createCanvasPage(document: ArtifactDocument, id: string): ArtifactOperation[] {
  requireDesign(document)
  const pages = canvasPages(document)
  if (pages.length >= MAX_CANVAS_PAGES) throw new Error('此画布已达到 40 个页面的上限。')
  if (pages.some(page => page.id === id)) throw new Error('页面已存在。')
  let ordinal = pages.length + 1
  while (pages.some(page => page.name === `页面 ${ordinal}`)) ordinal++
  return [{type:'document.patch',patch:{canvasPages:[...pages,{id,name:`页面 ${ordinal}`}]}}]
}
export function renameCanvasPage(document: ArtifactDocument, id: string, name: string): ArtifactOperation[] {
  requireDesign(document)
  if (!name.trim() || !canvasPages(document).some(page => page.id === id)) throw new Error('请输入有效的页面名称。')
  return [{type:'document.patch',patch:{canvasPages:canvasPages(document).map(page=>page.id===id?{...page,name:name.trim()}:page)}}]
}
export function deleteCanvasPage(document: ArtifactDocument, id: string): ArtifactOperation[] {
  requireDesign(document)
  const pages = canvasPages(document)
  if (pages.length === 1) throw new Error('不能删除最后一个页面。')
  if (!pages.some(page => page.id === id)) throw new Error('页面不存在。')
  return [...document.pageOrder.filter(board => canvasPageOf(document.pages[board]!) === id).map(pageId=>({type:'page.delete' as const,pageId})),
    {type:'document.patch',patch:{canvasPages:pages.filter(page=>page.id!==id)}}]
}
export function moveCanvasArtboards(document: ArtifactDocument, pageIds: string[], target: string): ArtifactOperation[] {
  requireDesign(document)
  if (!canvasPages(document).some(page => page.id === target)) throw new Error('目标页面不存在。')
  return pageIds.map(pageId=>({type:'page.patch',pageId,patch:{canvasPageId:target}}))
}

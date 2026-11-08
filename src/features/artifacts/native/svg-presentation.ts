import { artifactResolvedStyle } from '../../../../shared/artifact-themes'
import { isSafeArtifactSvg, type ArtifactDocument, type ArtifactPage, type ArtifactNode } from '../../../../shared/artifact-document'
import { editorFontFamily } from './editor-fonts'

/** Design画板沿用参考HTML的浏览器默认；自由画布文字保留原默认。 */
export function pageDefaultFontFamily(document:Pick<ArtifactDocument,'kind'|'canvasPages'>,pageId:string):string|undefined{
 return document.kind==='design'&&!document.canvasPages?.some(page=>page.contentId===pageId)?'Times New Roman':undefined
}

/** Presentation only: original SVG data and its strict input vocabulary stay unchanged. */
export function presentSvg(source: string, idPrefix = ''): string {
  if (!isSafeArtifactSvg(source)) return ''
  return source.replace(/<[^>]+>/g, tag => tag.replace(/(\s+)([a-zA-Z][a-zA-Z0-9:-]*)(\s*=\s*)(["'])([\s\S]*?)\4/g,
    (attribute, space: string, name: string, equals: string, _quote: string, value: string) => {
      let next = name === 'font-family' ? editorFontFamily(value) ?? value : value
      if (idPrefix && name === 'id') next = idPrefix + next
      else if (idPrefix && ['fill', 'stroke', 'clip-path'].includes(name)) next = next.replace(/url\(#([a-zA-Z0-9_-]+)\)/g, `url(#${idPrefix}$1)`)
      return next === value ? attribute : `${space}${name}${equals}"${next.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`
    }))
}


/** Match the font inheritance used by the SVG export without changing the node. */
export function inheritedSvgFont(node:ArtifactNode,page:ArtifactPage,document:ArtifactDocument):string|undefined {
  let family=artifactResolvedStyle(node.style,document).fontFamily,parent=node.parentId
  while(!family&&parent){const group=page.nodes[parent];if(!group)break;family=artifactResolvedStyle(group.style,document).fontFamily;parent=group.parentId}
  return family??(node.scope==='canvas'?undefined:pageDefaultFontFamily(document,page.id))
}

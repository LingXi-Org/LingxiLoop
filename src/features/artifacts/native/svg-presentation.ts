import { isSafeArtifactSvg } from '../../../../shared/artifact-document'
import { editorFontFamily } from './editor-fonts'

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

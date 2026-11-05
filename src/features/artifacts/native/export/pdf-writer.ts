/** Small streaming-friendly PDF writer: raster appearance, searchable Unicode text and links.
 * The invisible text font is the standard Adobe CJK STSong-Light CID font; page appearance
 * does not depend on the reader having it installed. No editor code or DOM enters this layer.
 */
export interface PdfPageImage {
  width: number
  height: number
  jpeg: Uint8Array
  text: string
  links?: Array<{ href: string; x: number; y: number; width: number; height: number }>
}
const utf8 = (text: string) => new TextEncoder().encode(text)
const hex4 = (value: number) => value.toString(16).padStart(4, '0')
function unicodeHex(value: string) {
  let result = ''
  for (let index = 0; index < value.length; index++) result += hex4(value.charCodeAt(index))
  return result
}
const concat = (chunks: Uint8Array[]) => {
  const out = new Uint8Array(chunks.reduce((sum, item) => sum + item.length, 0))
  let offset = 0
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length }
  return out
}

export function encodeArtifactPdf(pages: readonly PdfPageImage[], title: string): Uint8Array {
  const glyphs = new Map<string, number>()
  for (const page of pages) for (const character of page.text) if (!glyphs.has(character)) glyphs.set(character, glyphs.size + 1)
  if (glyphs.size > 65534) throw new Error('PDF 字符种类超过容量')
  const objects: Uint8Array[] = []
  const reserve = () => { objects.push(utf8('')); return objects.length }
  const set = (id: number, content: string | Uint8Array) => { objects[id - 1] = typeof content === 'string' ? utf8(content) : content }
  const stream = (dictionary: string, bytes: Uint8Array) => concat([utf8(`<< ${dictionary} /Length ${bytes.length} >>\nstream\n`), bytes, utf8('\nendstream')])
  const catalog = reserve(), tree = reserve(), font = reserve(), cid = reserve(), descriptor = reserve(), unicode = reserve(), info = reserve()
  const mappings = [...glyphs.entries()]
  let cmap = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /LingxiUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n'
  for (let at = 0; at < mappings.length; at += 100) {
    const batch = mappings.slice(at, at + 100)
    cmap += `${batch.length} beginbfchar\n${batch.map(([character, code]) => `<${hex4(code)}> <${unicodeHex(character)}>`).join('\n')}\nendbfchar\n`
  }
  cmap += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend'
  set(unicode, stream('', utf8(cmap)))
  set(descriptor, '<< /Type /FontDescriptor /FontName /STSong-Light /Flags 4 /FontBBox [0 -250 1000 900] /ItalicAngle 0 /Ascent 900 /Descent -250 /CapHeight 700 /StemV 80 >>')
  set(cid, `<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /FontDescriptor ${descriptor} 0 R /DW 1000 >>`)
  set(font, `<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${unicode} 0 R >>`)
  set(info, `<< /Title <FEFF${unicodeHex(title)}> /Producer (LingxiLoop native artifact export) >>`)
  const pageIds: number[] = []
  for (const page of pages) {
    const pageId = reserve(), pictureId = reserve(), contentId = reserve()
    pageIds.push(pageId)
    const width = page.width * .75, height = page.height * .75
    set(pictureId, stream(`/Type /XObject /Subtype /Image /Width ${Math.round(page.width)} /Height ${Math.round(page.height)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, page.jpeg))
    const encoded = [...page.text].map(character => hex4(glyphs.get(character)!)).join('')
    set(contentId, stream('', utf8(`q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q\nBT /F0 12 Tf 3 Tr 1 0 0 1 0 ${height} Tm <${encoded}> Tj ET`)))
    const annotations = (page.links ?? []).filter(link => /^(https?:\/\/|mailto:|#)/i.test(link.href)).map(link => {
      const annotationId = reserve()
      const x = link.x * .75, y = height - (link.y + link.height) * .75
      const href = link.href.replace(/([\\()])/g, '\\$1').replace(/[\r\n]/g, '')
      set(annotationId, `<< /Type /Annot /Subtype /Link /Rect [${x} ${y} ${x + link.width * .75} ${y + link.height * .75}] /Border [0 0 0] /A << /S /URI /URI (${href}) >> >>`)
      return `${annotationId} 0 R`
    })
    set(pageId, `<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${pictureId} 0 R >> /Font << /F0 ${font} 0 R >> >> /Contents ${contentId} 0 R${annotations.length ? ` /Annots [${annotations.join(' ')}]` : ''} >>`)
  }
  set(tree, `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`)
  set(catalog, `<< /Type /Catalog /Pages ${tree} 0 R >>`)
  const chunks = [utf8('%PDF-1.7\n%LingxiLoop\n')], offsets = [0]
  let length = chunks[0]!.length
  objects.forEach((body, index) => {
    offsets.push(length)
    const chunk = concat([utf8(`${index + 1} 0 obj\n`), body, utf8('\nendobj\n')])
    chunks.push(chunk); length += chunk.length
  })
  const xref = length
  chunks.push(utf8(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${offset.toString().padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`))
  return concat(chunks)
}

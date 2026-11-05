import { isSafeArtifactSvg, type ArtifactDocument, type ArtifactPage } from '../../../../../shared/artifact-document'
import { artifactResolvedStyle } from '../../../../../shared/artifact-themes'
import { blobDataUrl, type ExportResources } from './common'

const normalize = (family: string) => family.trim().replace(/^["']|["']$/g, '').toLowerCase()
const retainedFonts = new Set(['inter', 'noto sans sc', 'jetbrains mono'])
function requestedFonts(document: ArtifactDocument, pages: ArtifactPage[]) {
  const requested = new Map<string, string>()
  const append = (family: string | undefined, text: string) => {
    if (!text.trim()) return
    for (const entry of (family ?? '').split(',')) {
      const key = normalize(entry)
      if (retainedFonts.has(key)) requested.set(key, (requested.get(key) ?? '') + text)
    }
  }
  for (const page of pages) for (const node of Object.values(page.nodes)) {
    if (node.hidden || !['text', 'table', 'math', 'svg'].includes(node.type)) continue
    let family = artifactResolvedStyle(node.style, document).fontFamily, parent = node.parentId
    while (!family && parent) { family = artifactResolvedStyle(page.nodes[parent]!.style, document).fontFamily; parent = page.nodes[parent]!.parentId }
    if (node.type === 'svg') {
      if (!node.svg || !isSafeArtifactSvg(node.svg)) continue
      // This inert document uses the same SVG-in-HTML parsing as the renderer.
      // Whitelisting precedes parsing; no source DOM enters the live export page.
      const root = new DOMParser().parseFromString(node.svg, 'text/html').querySelector('svg')
      if (!root) continue
      const visit = (element: Element, inherited: string | undefined, inText: boolean) => {
        if (element.localName === 'title' || element.localName === 'desc') return
        const declared = element.getAttribute('font-family')
        const current = declared === null || /^(?:inherit|unset)$/i.test(declared.trim()) ? inherited : declared
        const text = inText || element.localName === 'text'
        for (const child of element.childNodes) {
          if (child.nodeType === Node.TEXT_NODE && text) append(current, child.textContent ?? '')
          else if (child instanceof Element) visit(child, current, text)
        }
      }
      visit(root, family, false)
    } else {
      append(family, [node.text ?? '', node.source ?? '', ...(node.cells ?? []).flat(), JSON.stringify(node.richText ?? '')].join(''))
    }
  }
  return requested
}

/** Load the actual inherited/marked style and weight of each rendered text run. */
export async function awaitPageFonts(element: HTMLElement) {
  const registered = new Set([...window.document.fonts].map(face => normalize(face.family)))
  const requested = new Map<string, string>()
  const walker = window.document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim() || !node.parentElement) continue
    const style = getComputedStyle(node.parentElement)
    for (const candidate of style.fontFamily.split(',')) {
      const family = normalize(candidate)
      if (!retainedFonts.has(family)) continue
      if (!registered.has(family)) throw new Error(`字体样式未能加载：${family}，请重试导出。`)
      const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} "${family}"`
      requested.set(font, (requested.get(font) ?? '') + node.textContent)
    }
  }
  await Promise.all([...requested].map(async ([font, text]) => {
    const faces = await window.document.fonts.load(font, text)
    if (!faces.length) throw new Error(`字体未能加载：${font}，请重试导出。`)
  }))
  await window.document.fonts.ready
}
function hasGlyph(range: string, text: string) {
  if (!range) return true
  const intervals = range.split(',').map(part => /^U\+([0-9a-f?]+)(?:-([0-9a-f]+))?$/i.exec(part.trim())).filter(match => match !== null).map(match => [Number.parseInt(match[1]!.replaceAll('?', '0'), 16), Number.parseInt((match[2] ?? match[1]!).replaceAll('?', 'f'), 16)])
  return [...text].some(character => intervals.some(([start, end]) => character.codePointAt(0)! >= start! && character.codePointAt(0)! <= end!))
}

/** Offline HTML includes only retained families and Unicode subsets used in the snapshot. */
export async function offlineDocumentFonts(resources: ExportResources): Promise<string> {
  if (typeof window === 'undefined') return ''
  const requested = requestedFonts(resources.document, resources.document.pageOrder.map(id => resources.document.pages[id]!))
  if (!requested.size) return ''
  const rules: CSSFontFaceRule[] = []
  for (const sheet of window.document.styleSheets) for (const rule of sheet.cssRules) if (rule.type === CSSRule.FONT_FACE_RULE) rules.push(rule as CSSFontFaceRule)
  for (const family of requested.keys()) if (!rules.some(rule => normalize(rule.style.fontFamily) === family)) throw new Error(`字体样式未能加载：${family}，请重试导出。`)
  const sources = new Map<string, Promise<string>>()
  return (await Promise.all(rules.filter(rule => {
    const text = requested.get(normalize(rule.style.fontFamily))
    return text !== undefined && hasGlyph(rule.style.getPropertyValue('unicode-range'), text)
  }).map(async rule => {
    let css = rule.cssText
    for (const match of css.matchAll(/url\((?:"|')?([^)'"\s]+)(?:"|')?\)/g)) {
      const relative = match[1]!
      if (relative.startsWith('data:')) continue
      const url = new URL(relative, rule.parentStyleSheet?.href ?? window.location.href)
      if (url.origin !== window.location.origin) throw new Error('导出字体必须来自已安装的本地字体')
      let encoded = sources.get(url.href)
      if (!encoded) {
        encoded = fetch(url, { signal: resources.options.signal, credentials: 'omit', redirect: 'error' }).then(async response => {
          if (!response.ok) throw new Error(`字体加载失败 (${response.status})`)
          return blobDataUrl(await response.blob(), resources.options.signal)
        })
        sources.set(url.href, encoded)
      }
      css = css.replace(match[0], `url("${await encoded}")`)
    }
    return css
  }))).join('\n')
}

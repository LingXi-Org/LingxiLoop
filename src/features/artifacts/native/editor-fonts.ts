import type { ArtifactStyle } from '../../../../shared/artifact-document'

export interface EditorFont {
  value: string
  label: string
  family: string
  theme?: string
}

/** Source order is retained; visible names are Chinese and document values stay portable. */
export const EDITOR_FONTS: readonly EditorFont[] = [
  { value: 'role:sans', label: '无衬线体', family: 'sans-serif', theme: 'font.sans' },
  { value: 'role:serif', label: '衬线体', family: 'serif', theme: 'font.serif' },
  { value: 'role:mono', label: '等宽体', family: 'monospace', theme: 'font.mono' },
  { value: 'Helvetica', label: '赫尔维提卡体', family: 'Helvetica' },
  { value: 'Arial', label: '阿里亚尔体', family: 'Arial' },
  { value: 'Bebas Neue', label: '贝巴斯体', family: 'Bebas Neue' },
  { value: 'Caveat', label: '卡维特手写体', family: 'Caveat' },
  { value: 'Courier New', label: '新信使体', family: 'Courier New' },
  { value: 'DM Sans', label: '迪姆无衬线体', family: 'DM Sans' },
  { value: 'Garamond', label: '加拉蒙体', family: 'Garamond' },
  { value: 'Georgia', label: '乔治亚体', family: 'Georgia' },
  { value: 'Inter', label: '英特体', family: 'Inter' },
  { value: 'Lato', label: '拉托体', family: 'Lato' },
  { value: 'Lora', label: '洛拉体', family: 'Lora' },
  { value: 'Manrope', label: '曼罗普体', family: 'Manrope' },
  { value: 'Merriweather', label: '梅里韦瑟体', family: 'Merriweather' },
  { value: 'Montserrat', label: '蒙特塞拉特体', family: 'Montserrat' },
  { value: 'Nunito', label: '努尼托体', family: 'Nunito' },
  { value: 'Open Sans', label: '开放无衬线体', family: 'Open Sans' },
  { value: 'Playfair Display', label: '普莱费尔展示体', family: 'Playfair Display' },
  { value: 'Poppins', label: '波平斯体', family: 'Poppins' },
  { value: 'Raleway', label: '雷勒韦体', family: 'Raleway' },
  { value: 'Roboto', label: '罗博托体', family: 'Roboto' },
  { value: 'Space Grotesk', label: '太空无衬线体', family: 'Space Grotesk' },
  { value: 'Tahoma', label: '塔霍马体', family: 'Tahoma' },
  { value: 'Times New Roman', label: '新罗马体', family: 'Times New Roman' },
  { value: 'Trebuchet MS', label: '投石机体', family: 'Trebuchet MS' },
  { value: 'Verdana', label: '维达纳体', family: 'Verdana' },
  { value: 'Work Sans', label: '工作无衬线体', family: 'Work Sans' },
]

const local = new Set(['Bebas Neue', 'Caveat', 'DM Sans', 'Inter', 'Lato', 'Lora', 'Manrope', 'Merriweather', 'Montserrat', 'Nunito', 'Open Sans', 'Playfair Display', 'Poppins', 'Raleway', 'Roboto', 'Space Grotesk', 'Work Sans'].map(name => name.toLowerCase()))
const alias = 'LingxiLoopEditor '
export const editorFontKey = (family: string) => family.trim().replace(/^["']|["']$/g, '').replace(/^LingxiLoopEditor /, '').toLowerCase()
export const isLocalEditorFont = (family: string) => local.has(editorFontKey(family))

/** Private face names prevent an editor font from changing the surrounding workspace. */
export function editorFontFamily(family: string | undefined): string | undefined {
  if (family === undefined) return undefined
  const source = family.split(',')
  const families = source.map(part => {
    const font = EDITOR_FONTS.find(font => font.family.toLowerCase() === editorFontKey(part))
    return font && local.has(editorFontKey(font.family)) ? `"${alias}${font.family}"` : part.trim()
  })
  if (source.some(isLocalEditorFont) && !source.some(part => /^(?:(?:ui-)?(?:serif|sans-serif|monospace|rounded)|system-ui|math|emoji|fangsong|cursive|fantasy)$/.test(editorFontKey(part)))) {
    families.push(['merriweather', 'lora', 'playfair display'].includes(editorFontKey(source[0] ?? '')) ? 'serif' : 'sans-serif')
  }
  return families.join(', ')
}

export function editorFontChoice(family: string | undefined, theme?: string): EditorFont | undefined {
  if (theme) return EDITOR_FONTS.find(font => font.theme === theme)
  const key = editorFontKey((family ?? '').split(',')[0] ?? '')
  return EDITOR_FONTS.find(font => editorFontKey(font.family) === key)
    ?? (key === 'system-ui' ? EDITOR_FONTS[0] : undefined)
}


export interface EditorFontVariant { weight: number; style: 'normal' | 'italic'; label: string }
const weightLabels: Record<number, string> = { 100: '极细', 200: '纤细', 300: '细体', 400: '常规', 500: '中等', 600: '半粗', 700: '粗体', 800: '加粗', 900: '特粗', 1000: '超粗' }
const ranges: Record<string, [number, number]> = {
  inter: [100, 900], roboto: [100, 900], 'open sans': [300, 800], montserrat: [100, 900], raleway: [100, 900], nunito: [200, 1000],
  'playfair display': [400, 900], merriweather: [300, 900], 'work sans': [100, 900], 'dm sans': [100, 1000], manrope: [200, 800],
  'space grotesk': [300, 700], lora: [400, 700], caveat: [400, 700],
}
export function editorFontVariantLabel(weight: number, style = 'normal') {
  return `${weightLabels[weight] ?? weight}${style === 'italic' ? '斜体' : ''}`
}
export function editorFontVariants(family: string | undefined): EditorFontVariant[] {
  const key = editorFontKey((family ?? '').split(',')[0] ?? ''), range = ranges[key]
  const weights = range ? Array.from({ length: (range[1] - range[0]) / 100 + 1 }, (_, i) => range[0] + i * 100)
    : key === 'lato' ? [100, 300, 400, 700, 900] : key === 'poppins' ? [100, 200, 300, 400, 500, 600, 700, 800, 900] : key === 'bebas neue' ? [400] : [400, 700]
  const styles: Array<'normal' | 'italic'> = ['manrope', 'space grotesk', 'bebas neue', 'caveat'].includes(key) ? ['normal'] : ['normal', 'italic']
  return weights.flatMap(weight => styles.map(style => ({ weight, style, label: editorFontVariantLabel(weight, style) })))
}

/** Changing family only adjusts a face when that face does not exist in the new family. */
export function editorFontFacePatch(family: string, current: Pick<ArtifactStyle, 'fontWeight' | 'fontStyle'>): Pick<ArtifactStyle, 'fontWeight' | 'fontStyle'> {
  const variants = editorFontVariants(family), weight = current.fontWeight ?? 400, style = current.fontStyle ?? 'normal'
  const closest = variants.reduce((best, item) => Math.abs(item.weight - weight) < Math.abs(best.weight - weight) ? item : best)
  const range = ranges[editorFontKey(family.split(',')[0] ?? '')]
  const nextWeight = range && weight >= range[0] && weight <= range[1] ? weight : closest.weight
  const nextStyle = variants.some(item => item.style === style) ? style : 'normal'
  return { ...(nextWeight === weight ? {} : { fontWeight: nextWeight }), ...(nextStyle === style ? {} : { fontStyle: nextStyle }) }
}

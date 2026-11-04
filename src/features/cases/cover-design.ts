export const coverColors = {
  orange: { label: '橙色', swatch: '#E58A45', background: '#FAEBDD', dots: '#EFD7C4' },
  green: { label: '绿色', swatch: '#5FB394', background: '#E4F1EB', dots: '#C3DFD2' },
  blue: { label: '蓝色', swatch: '#5B86DB', background: '#E8EEFA', dots: '#CBD8F3' },
  red: { label: '红色', swatch: '#D9605A', background: '#FAE8E6', dots: '#EDCBC8' },
  yellow: { label: '黄色', swatch: '#E3B04B', background: '#FBF3DD', dots: '#EEDFB8' },
  purple: { label: '紫色', swatch: '#9A7FD1', background: '#F0EAF8', dots: '#DCD0ED' },
} as const
export type CoverColor = keyof typeof coverColors

export function coverDesign(content: { title: string; coverText?: string; coverColor?: CoverColor }) {
  return { text: content.coverText?.trim() || Array.from(content.title.trim()).slice(0, 12).join('') || '案例', color: content.coverColor ?? 'blue' }
}

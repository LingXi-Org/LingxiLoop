import type { ArtifactNodeType, ArtifactTheme } from '../../../../shared/artifact-document'

/** Do not surface browser, library or server English diagnostics as editor copy. */
export function editorError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback
  const message = error.message.trim()
  return /\p{Script=Han}/u.test(message) && !/[A-Za-z<>]/.test(message) ? message : fallback
}

export const resizeHandleLabels = { nw: '左上角', n: '上边缘', ne: '右上角', e: '右边缘', se: '右下角', s: '下边缘', sw: '左下角', w: '左边缘' } as const

export const nodeTypeLabels = {drawing:'绘图',video:'视频',shape:'形状',group:'组合',image:'图片',line:'连接线',table:'表格',svg:'矢量图',math:'公式',embed:'交互内容',text:'文本',note:'便签'} satisfies Record<ArtifactNodeType, string>

/** Translate editor color choices without changing their stored CSS value. */
export function editorColorLabel(value:string):string{
  const keyword=value.trim().toLowerCase()
  return keyword==='none'?'无':keyword==='transparent'?'透明':value
}

/** 内置资源的产品名称本地化；作者内容与原始资源保持不变。 */
export function editorThemeLabel(theme: Pick<ArtifactTheme, 'name' | 'source'>): string {
  const labels: Record<string, string> = { 'slides-builtin': '经典', 'baoyu-ember': '余烬', 'baoyu-seazar': '塞扎尔' }
  const label = theme.source && labels[theme.source.namespace]
  if (!label) return theme.name
  const variant = theme.source?.variant === 'dark' ? '深色' : theme.source?.variant === 'light' ? '浅色' : ''
  return label + (variant ? ` · ${variant}` : '')
}

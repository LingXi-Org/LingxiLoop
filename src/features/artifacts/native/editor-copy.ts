import type { ArtifactNodeType } from '../../../../shared/artifact-document'

/** Do not surface browser, library or server English diagnostics as editor copy. */
export function editorError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback
  const message = error.message.trim()
  return /\p{Script=Han}/u.test(message) && !/[A-Za-z<>]/.test(message) ? message : fallback
}

export const resizeHandleLabels = { nw: '左上角', n: '上边缘', ne: '右上角', e: '右边缘', se: '右下角', s: '下边缘', sw: '左下角', w: '左边缘' } as const

export const nodeTypeLabels = {drawing:'绘图',video:'视频',shape:'形状',group:'组合',image:'图片',line:'连接线',table:'表格',svg:'矢量图',math:'公式',embed:'交互内容',text:'文本',note:'便签'} satisfies Record<ArtifactNodeType, string>

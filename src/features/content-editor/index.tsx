import { Component, lazy, Suspense, type ReactNode } from 'react'
import type { ComponentProps, Ref } from 'react'
import type { ContentEditorHandle } from './ContentEditor'
export type { ContentDocument } from './document'
export type { ContentEditorHandle } from './ContentEditor'
const Editor = lazy(() => import('./ContentEditor').then(module => ({ default: module.ContentEditor })))
const Reader = lazy(() => import('./ContentEditor').then(module => ({ default: module.ContentDocumentView })))
class DocumentBoundary extends Component<{ children: ReactNode; source: string }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <div className="space-y-2 text-sm"><p role="alert">此文档暂时无法打开。原始内容仍已保留，请重新加载后重试。</p><pre className="whitespace-pre-wrap break-words">{this.props.source}</pre></div>
    return this.props.children
  }
}
export function ContentEditor(props: ComponentProps<typeof Editor> & { ref?: Ref<ContentEditorHandle> }) {
  return <DocumentBoundary source={props.document?.legacyMarkdown ?? props.value}><Suspense fallback={<p role="status" className="py-4 text-sm text-muted-foreground">正在加载编辑器…</p>}><Editor {...props} /></Suspense></DocumentBoundary>
}
export function ContentDocumentView(props: ComponentProps<typeof Reader>) {
  return <DocumentBoundary source={props.document.legacyMarkdown ?? JSON.stringify(props.document.blocks)}><Suspense fallback={<p role="status">正在加载内容…</p>}><Reader {...props} /></Suspense></DocumentBoundary>
}

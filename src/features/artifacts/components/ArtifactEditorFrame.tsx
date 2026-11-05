import { lazy, Suspense } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import type { SlideEditorContext } from '../../../../shared/slides-editor-context'
import type { ArtifactKind } from '../contracts'

export const loadNativeEditor = () => import('../native/NativeEditor')
const NativeEditor = lazy(loadNativeEditor)

/** Trusted DOM/SVG editing shares the host React runtime. Only executable nodes
 * receive isolated frames; a native document never loads a legacy application. */
export function ArtifactEditorFrame(props: {
  artifactId: string; kind: ArtifactKind; title: string
  onEditorContext?(context: SlideEditorContext): void
  agentWorking?: boolean
  exitPresentation?: number
  visible?: boolean
}) {
  return <Suspense fallback={<ResourceSkeleton variant="media" label="正在打开编辑器" />}><NativeEditor key={props.artifactId} {...props} /></Suspense>
}

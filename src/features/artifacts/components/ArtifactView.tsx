import type { ReactNode } from 'react'
import { PageHeader, type PageHeaderCrumb } from '@/components/shell/PageHeader'
import { PanelCloseButton, RightPanelHeader } from '@/components/shell/RightPanel'
import { ARTIFACT_LABELS, type ArtifactKind } from '../contracts'
import { ArtifactEditorFrame } from './ArtifactEditorFrame'

/** One artifact's editor with the host's own title bar; the editor below it is the upstream page.
 * `back` shows it as a full page (PageHeader); otherwise it is a right panel (RightPanelHeader). */
export function ArtifactView({ artifactId, kind, title, onClose, closeLabel, back = false, actions, crumbs }: {
  artifactId: string
  kind: ArtifactKind
  title: string
  onClose(): void
  closeLabel?: string
  back?: boolean
  actions?: ReactNode
  crumbs?: PageHeaderCrumb[]
}) {
  const label = ARTIFACT_LABELS[kind]
  return <div className="flex h-full min-h-0 flex-col bg-background" data-artifact-view={kind}>
    {back
      ? <PageHeader title={title} crumbs={crumbs} actions={actions} leading={<PanelCloseButton back label={closeLabel ?? '返回'} onClick={onClose} className="-ms-2" />} />
      : <RightPanelHeader eyebrow={label} title={title} actions={actions} onClose={onClose} closeLabel={closeLabel ?? `关闭${label}`} />}
    <div className="min-h-0 flex-1">
      <ArtifactEditorFrame artifactId={artifactId} kind={kind} title={title} />
    </div>
  </div>
}

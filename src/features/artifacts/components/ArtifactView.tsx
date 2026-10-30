import { ArrowLeft01Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { ARTIFACT_LABELS, type ArtifactKind } from '../contracts'
import { ArtifactEditorFrame } from './ArtifactEditorFrame'

/** One artifact's editor with the host's own title bar; the editor below it is the upstream page. */
export function ArtifactView({ artifactId, kind, title, onClose, closeLabel, back = false, actions }: {
  artifactId: string
  kind: ArtifactKind
  title: string
  onClose(): void
  closeLabel?: string
  back?: boolean
  actions?: ReactNode
}) {
  const label = ARTIFACT_LABELS[kind]
  return <div className="flex h-full min-h-0 flex-col bg-background" data-artifact-view={kind}>
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2">
      {back && <Button type="button" variant="ghost" size="icon" className="size-10" aria-label={closeLabel ?? `返回`} onClick={onClose}>
        <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-5" />
      </Button>}
      <div className="min-w-0 flex-1 px-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <h2 className="truncate text-sm font-medium leading-tight">{title}</h2>
      </div>
      {actions}
      {!back && <Button type="button" variant="ghost" size="icon" className="size-10" aria-label={closeLabel ?? `关闭${label}`} onClick={onClose}>
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-5" />
      </Button>}
    </header>
    <div className="min-h-0 flex-1">
      <ArtifactEditorFrame artifactId={artifactId} kind={kind} title={title} />
    </div>
  </div>
}

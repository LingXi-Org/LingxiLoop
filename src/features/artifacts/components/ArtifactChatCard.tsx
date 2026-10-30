import { PanelsTopLeftIcon, PresentationIcon } from 'lucide-react'
import { ArtifactCard } from '@/components/assistant-ui/elements/artifact-card'
import { useApp } from '@/stores/app'
import { useSurface } from '@/stores/surface'
import { ARTIFACT_LABELS, type ArtifactKind } from '../contracts'

/** Opens a Design canvas over the conversation, or a Slides deck in the presentations view. */
export function openArtifact(kind: ArtifactKind, artifactId: string, title: string) {
  if (kind === 'design') { useSurface.getState().openDesign(artifactId, title); return }
  const url = new URL(window.location.href)
  url.searchParams.set('deck', artifactId)
  window.history.replaceState(window.history.state, '', url)
  useApp.getState().setView('slides')
}

export function ArtifactChatCard({ artifactId, kind, title, description }: { artifactId: string; kind: ArtifactKind; title: string; description?: string }) {
  const label = ARTIFACT_LABELS[kind]
  return <ArtifactCard
    title={title}
    meta={description ? `${label} · ${description}` : label}
    icon={kind === 'slides' ? <PresentationIcon /> : <PanelsTopLeftIcon />}
    preview={<p className="grid h-full place-items-center px-4 text-center text-xs text-muted-foreground">打开{label}查看和编辑</p>}
    onOpen={() => openArtifact(kind, artifactId, title)}
    openLabel={`打开${label}`}
    data-artifact-open-trigger={artifactId}
  />
}

import type { ArtifactKind } from './contracts'

let editorModule: Promise<unknown> | undefined
/** Intent warming shares the native editor module; export and legacy adapters
 * stay outside this import graph and are loaded only by their explicit action. */
export function warmEditor(_kind: ArtifactKind, _priority: RequestPriority = 'high'): Promise<void> {
  editorModule ??= import('./native/NativeEditor').catch(error => { editorModule = undefined; throw error })
  return editorModule.then(() => undefined)
}
export function warmEditorWhenIdle(_kind: ArtifactKind) {
  // Do not download an editor for people who never open a document.
}
export function prefetchEditor(kind: ArtifactKind, _artifactId?: string) { void warmEditor(kind).catch(() => {}) }

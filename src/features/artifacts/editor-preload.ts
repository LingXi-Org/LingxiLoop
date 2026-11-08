let editorModule: Promise<unknown> | undefined
/** Intent warming shares the native editor module; export and legacy adapters
 * stay outside this import graph and are loaded only by their explicit action. */
export function warmEditor(): Promise<void> {
  editorModule ??= import('./native/NativeEditor').catch(error => { editorModule = undefined; throw error })
  return editorModule.then(() => undefined)
}
export function prefetchEditor() { void warmEditor().catch(() => {}) }

/** Slides runs on its grant's own origin; its repository-owned hashed assets
 * stay on the shared public URL so every deck and reopen reuses one cached copy. */
export function slidesPageAssets(html: string, publicBase: string) {
  const origin = new URL(publicBase).origin
  if (!/^https?:\/\//.test(origin)) throw new Error('Slides assets require the public HTTP origin')
  const base = `${origin}/artifact-editor/slides-assets/`
  return { html: html.replaceAll('"/artifact-editor/slides-assets/', `"${base}`), source: base }
}

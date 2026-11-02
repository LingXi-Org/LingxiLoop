/** Only repository-owned hashed JS/CSS/fonts use the shared anonymous URL.
 * Documents, grant pages, uploads and editing requests keep the grant origin. */
export function designPageAssets(html: string, publicBase: string) {
  const origin = new URL(publicBase).origin
  if (!/^https?:\/\//.test(origin)) throw new Error('Design assets require the public HTTP origin')
  const base = `${origin}/artifact-editor/design-assets/`
  // Failures of the trusted shell's blocking assets otherwise leave its pinned
  // Loading placeholder forever. Child-artboard events do not bubble here.
  const failure = `<script>window.addEventListener('error',function(event){var target=event.target;if((target instanceof HTMLScriptElement||target instanceof HTMLLinkElement)&&target.hasAttribute('data-lingxi-design-critical'))parent.postMessage({__lingxi_design_resource_error:true},'*')},true);</script>`
  return { html: html.replaceAll('__LINGXI_DESIGN_ASSET_ORIGIN__', origin).replace('<head>', `<head>${failure}`), source: base }
}

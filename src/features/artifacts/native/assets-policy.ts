/** An authored resource URL cannot turn the editor into a credentialed API proxy. */
export function artifactAssetRequest(urlValue: string, artifactId: string, locationHref: string) {
  const url = new URL(urlValue, locationHref), origin = new URL(locationHref).origin
  if (url.username || url.password) throw new Error('不支持带凭据的资源地址。')
  if (url.protocol === 'data:') {
    if (!/^data:image\/(?:png|jpeg|webp|gif|avif|svg\+xml)(?:;charset=[a-zA-Z0-9-]+)?(?:;base64)?,/i.test(urlValue)) throw new Error('不支持的内嵌资源类型。')
    return { url: url.href, authenticated: false }
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('不支持的资源地址。')
  if (url.origin !== origin) return { url: url.href, authenticated: false }
  const root = `/api/artifacts/${encodeURIComponent(artifactId)}/`
  const relative = url.pathname.startsWith(root) ? url.pathname.slice(root.length) : ''
  const ownedAsset = /^(?:assets|original-assets)\/[a-zA-Z0-9_-]+$/.test(relative)
    || /^originals\/[a-f0-9]{64}\/.+/.test(relative) && !/%2f|%5c/i.test(relative)
  if (ownedAsset && !url.search) return { url: url.href, authenticated: true }
  if (/^\/api(?:\/|$)/i.test(url.pathname)) throw new Error('资源地址不属于当前稿件。')
  return { url: url.href, authenticated: false }
}
export function requireAssetContentType(contentType: string | null) {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase()
  if (!/^image\/(png|jpeg|webp|gif|avif|svg\+xml)$/.test(type) && !/^font\/(woff2?|ttf|otf)$/.test(type) && !/^video\/(mp4|webm|ogg)$/.test(type)) throw new Error('资源响应不是支持的图片、视频或字体。')
  return type
}

// Only the seven named lazy capabilities. Prime their immutable HTTP-cache
// entries before import() so a transient fetch failure cannot poison the browser
// module map. No document, grant or product state enters this cache.
const prepared = new Map()
export function prepareEditorFeature(feature) {
  if (typeof document === 'undefined') return Promise.resolve()
  let pending = prepared.get(feature)
  if (!pending) {
    const meta = document.querySelector('meta[name="lingxi-editor-features"]')
    // Keep standalone/Node integrations that do not use the product shell.
    if (!meta) return Promise.resolve()
    pending = Promise.resolve().then(() => {
      const resources = JSON.parse(meta.content)[feature]
      const entry = document.querySelector('script[type="module"][src]')
      if (!Array.isArray(resources) || !entry) throw new Error('资源暂时无法加载，请重试。')
      return Promise.all(resources.map(file => fetch(new URL(file, entry.src), {
        mode: 'cors', credentials: 'omit', cache: 'force-cache', priority: 'high', signal: AbortSignal.timeout(30_000),
      }).then(response => {
        if (!response.ok) throw new Error('资源暂时无法加载，请重试。')
        return response.arrayBuffer()
      })))
    }).then(() => undefined).catch(error => { prepared.delete(feature); throw error })
    prepared.set(feature, pending)
  }
  return pending
}

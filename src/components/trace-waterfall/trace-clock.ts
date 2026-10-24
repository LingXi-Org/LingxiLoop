/** Lifecycle for the existing elapsed display; never changes persisted timing.
 * A hidden trace remains mounted, retaining its filter, expansion and selection. */
export function observeTraceClock(element: HTMLElement, enabled: boolean, tick: () => void): () => void {
  if (!enabled) return () => {}
  const doc = element.ownerDocument
  let intersecting = typeof IntersectionObserver === 'undefined'
  let disposed = false
  let timer: ReturnType<typeof setInterval> | undefined
  const update = () => {
    if (disposed) return
    if (intersecting && doc.visibilityState === 'visible') {
      if (timer === undefined) { tick(); timer = setInterval(tick, 100) }
    } else if (timer !== undefined) { clearInterval(timer); timer = undefined }
  }
  const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.target === element) intersecting = entry.isIntersecting
    update()
  })
  observer?.observe(element)
  doc.addEventListener('visibilitychange', update)
  update()
  return () => {
    disposed = true
    observer?.disconnect()
    doc.removeEventListener('visibilitychange', update)
    if (timer !== undefined) clearInterval(timer)
  }
}

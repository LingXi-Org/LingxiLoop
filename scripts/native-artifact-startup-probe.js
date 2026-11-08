/* Measurement only: bounded main-frame timing; no names, URLs or document data. */
(() => {
  if (window !== window.top) return
  let rows = [], dropped = 0
  const supported = PerformanceObserver.supportedEntryTypes.includes('longtask')
  const collect = entries => {
    for (const entry of entries) {
      rows.push({ startEpochMs: performance.timeOrigin + entry.startTime, durationMs: entry.duration })
      if (rows.length > 256) { rows.shift(); dropped++ }
    }
  }
  const observer = supported ? new PerformanceObserver(list => collect(list.getEntries())) : null
  observer?.observe({ type: 'longtask', buffered: true })
  window.__nativeArtifactStartup = (since, until) => {
    if (observer) { collect(observer.takeRecords()); observer.disconnect() }
    const navigation = performance.getEntriesByType('navigation')[0]
    const epoch = value => value > 0 ? performance.timeOrigin + value : null
    const longTasks = rows.filter(row => row.startEpochMs < until && row.startEpochMs + row.durationMs > since)
    rows = []
    return {
      supported, dropped, truncated: dropped > 0, windowStartEpochMs: since, windowEndEpochMs: until,
      timeOriginEpochMs: performance.timeOrigin,
      domInteractiveEpochMs: epoch(navigation?.domInteractive),
      domContentLoadedEpochMs: epoch(navigation?.domContentLoadedEventEnd),
      loadEpochMs: epoch(navigation?.loadEventEnd), longTasks,
    }
  }
})()

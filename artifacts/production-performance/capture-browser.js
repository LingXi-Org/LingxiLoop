// Paste into DevTools before switching conversations or sending the fixed test message.
// Call await lingxiPerformanceSamples.export('cold-1', 'same mainland network') afterward.
// No URLs, identifiers, message text or prompts are recorded.
(() => {
  globalThis.lingxiPerformanceSamples?.stop()
  const samples = []
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if (!entry.name.startsWith('lingxiloop.chat.')) continue
      const detail = entry.detail ?? {}
      const safe = Object.fromEntries(['stage', 'durationMs', 'sinceSendMs', 'sincePreviewMs', 'resets', 'disconnects', 'paintSamples', 'receiveToPaintP95Ms']
        .filter(key => typeof detail[key] === 'number' || key === 'stage' && typeof detail[key] === 'string')
        .map(key => [key, detail[key]]))
      samples.push({ name: entry.name, startTime: entry.startTime, duration: entry.duration, detail: safe })
      if (samples.length > 1000) samples.shift()
    }
  })
  observer.observe({ type: 'measure', buffered: true })
  globalThis.lingxiPerformanceSamples = {
    export: async (label, network) => {
      const resources = performance.getEntriesByType('resource')
      const navigation = performance.getEntriesByType('navigation')[0]
      const groups = {}
      for (const sample of samples) for (const key of ['durationMs', 'sinceSendMs', 'receiveToPaintP95Ms']) {
        if (typeof sample.detail[key] === 'number') (groups[`${sample.detail.stage}.${key}`] ??= []).push(sample.detail[key])
      }
      const medians = Object.fromEntries(Object.entries(groups).map(([key, values]) => {
        values.sort((a, b) => a - b)
        const middle = Math.floor(values.length / 2)
        return [key, values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2]
      }))
      const meta = await fetch('/api/meta', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).catch(() => null)
      return JSON.stringify({ label, network, version: meta?.version ?? null, commitSha: meta?.commitSha ?? null,
        userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight },
        navigation: navigation ? { type: navigation.type, responseStart: navigation.responseStart,
          domContentLoadedEventEnd: navigation.domContentLoadedEventEnd, loadEventEnd: navigation.loadEventEnd } : null,
        resourceRequestCount: resources.length, transferBytes: resources.reduce((sum, resource) => sum + resource.transferSize, 0),
        samples, medians }, null, 2)
    },
    stop: () => observer.disconnect(),
  }
})()

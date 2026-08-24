export function shouldUseMockIm(dev: boolean, hostname: string, search = ''): boolean {
  if (!dev || new URLSearchParams(search).get('api') === '1') return false
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

export function isMockImDevelopment(): boolean {
  const env = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env
  return Boolean(env?.DEV && typeof location !== 'undefined'
    && shouldUseMockIm(true, location.hostname, location.search))
}

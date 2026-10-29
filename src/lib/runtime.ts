/** Analytics classification for app subdomains and local previews. */
export const isWebAppHost: boolean = typeof window !== 'undefined'
  && (/^app\./i.test(window.location.hostname) || window.location.search.includes('webonly=1'))

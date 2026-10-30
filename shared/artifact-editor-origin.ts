/** One browser origin per signed grant keeps executable boards away from other artifacts. */
export async function artifactEditorOrigin(grant: string, base: string): Promise<string> {
  const url = new URL(base)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(grant))
  const id = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32)
  url.hostname = `${id}-${url.hostname}`
  return url.origin
}

// No auth, SPA or other artifact grant is served on an executable editor's origin.
export async function isolatedEditor(request: Request, base: string, backend: string, fetcher: typeof fetch = fetch): Promise<Response | null> {
  const url = new URL(request.url), origin = new URL(base)
  if (!url.hostname.endsWith(`-${origin.hostname}`)) return null
  const editor = /^\/artifact-editor\/design\/([A-Za-z0-9_.-]{1,2048})(?:\/.*)?$/.exec(url.pathname)
  const blob = /^\/_blob\/[a-f0-9]{32}$/.test(url.pathname)
  if (url.protocol !== origin.protocol || url.port !== origin.port || request.headers.has('service-worker') || (!editor && !blob)
    || !/^[a-f0-9]{32}$/.test(url.hostname.slice(0, -(origin.hostname.length + 1)))
    || (editor && await artifactEditorOrigin(editor[1], base) !== url.origin)) {
    return new Response('Not found', { status: 404 })
  }
  const headers = new Headers(request.headers)
  for (const name of ['cookie', 'authorization', 'host', 'x-lingxiloop-gateway', 'x-forwarded-host']) headers.delete(name)
  const destination = new URL(url.pathname + url.search, backend)
  const response = await fetcher(new Request(destination, {
    method: request.method, headers, redirect: 'manual',
    ...(!['GET', 'HEAD'].includes(request.method) ? { body: request.body, duplex: 'half' } : {}),
  }))
  const output = new Headers(response.headers)
  output.delete('set-cookie')
  // Only the trusted editor shell gets DOM access to its own child frames.
  // Project HTML retains its script-free CSP; the main-site response stays opaque.
  const csp = output.get('content-security-policy')
  if (editor && csp?.startsWith('sandbox allow-scripts ')) {
    output.set('content-security-policy', csp.replace('sandbox allow-scripts ', 'sandbox allow-scripts allow-same-origin '))
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: output })
}

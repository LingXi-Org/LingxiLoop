// @e2e-dev/web 0.12 has no media-preference option. Configure the dedicated
// browser's native preference via CDP; all navigation/actions/assertions still
// use the official engine. No Playwright API is imported or called here.
export async function reduceMotion(caseId: string) {
  const endpoint = process.env.E2E_CDP_URL
  if (!endpoint) throw new Error('Reduced-motion verification requires a dedicated E2E_CDP_URL')
  const pages = await (await fetch(new URL('/json/list', endpoint))).json() as { type: string; url: string; webSocketDebuggerUrl: string }[]
  const targets = pages.filter(page => page.type === 'page' && page.url.includes('/e2e/question-index/index.html')
    && new URL(page.url).searchParams.get('media-case') === caseId)
  if (targets.length !== 1) throw new Error('Expected one question-index fixture in the dedicated browser')
  const socket = new WebSocket(targets[0].webSocketDebuggerUrl)
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Media preference setup timed out')), 5_000)
      socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Media preference connection failed')) }, { once: true })
      socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Emulation.setEmulatedMedia', params: {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      } })), { once: true })
      socket.addEventListener('message', event => {
        const result = JSON.parse(String(event.data)) as { id?: number; error?: { message: string } }
        if (result.id !== 1) return
        clearTimeout(timeout)
        if (result.error) reject(new Error(result.error.message))
        else resolve()
      })
    })
    return () => socket.close()
  } catch (error) { socket.close(); throw error }
}

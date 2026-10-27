/** Executes as the first classic script, before any generated code. No capabilities are put on window. */
export function trustedBootstrap(capture: {url:string;integrity:string} | null = null) {
  const channel = new MessageChannel()
  const send = channel.port1.postMessage.bind(channel.port1)
  const listen = EventTarget.prototype.addEventListener
  const nativeClearTimeout = window.clearTimeout.bind(window)
  const nativeSetTimeout = window.setTimeout.bind(window)
  const legacyToCanvas = (window as unknown as {htmlToImage?: {toCanvas(node: HTMLElement, options: Record<string, unknown>): Promise<HTMLCanvasElement>}}).htmlToImage?.toCanvas
  delete (window as unknown as {htmlToImage?: unknown}).htmlToImage
  // Establish the loader and capture its DOM operations before any author code.
  // Module exports stay lexical; a later window.htmlToImage setter is irrelevant.
  const createElement = document.createElement.bind(document)
  const append = document.head.append.bind(document.head)
  const setAttribute = Element.prototype.setAttribute
  let failedCaptures = 0
  let captureModule: Promise<{toCanvas: NonNullable<typeof legacyToCanvas>}> | undefined
  const loadCapture = () => {
    if (!capture) return Promise.resolve({toCanvas:legacyToCanvas!})
    const url = capture.url + (failedCaptures ? `?capture-retry=${failedCaptures}` : '')
    captureModule ??= new Promise<void>((resolve,reject)=>{
      // SRI validates the module before import consumes the browser module map.
      const link = createElement('link')
      setAttribute.call(link,'rel','modulepreload')
      setAttribute.call(link,'href',url)
      setAttribute.call(link,'integrity',capture.integrity)
      setAttribute.call(link,'crossorigin','anonymous')
      const timer = nativeSetTimeout(()=>{link.remove();reject(new Error('Image capture resource timed out'))},10000)
      link.onload=()=>{nativeClearTimeout(timer);link.remove();resolve()}
      link.onerror=()=>{nativeClearTimeout(timer);link.remove();reject(new Error('Image capture resource failed'))}
      append(link)
    }).then(()=>import(/* @vite-ignore */ url)).catch(error=>{failedCaptures++;captureModule=undefined;throw error})
    return captureModule
  }
  const gesture = (event: Event) => {
    if (!event.isTrusted || event instanceof KeyboardEvent && (event.repeat || !['Enter', ' '].includes(event.key))) return
    send({type: 'gesture'})
  }
  listen.call(document, 'pointerdown', gesture, true)
  listen.call(document, 'keydown', gesture, true)
  channel.port1.onmessage = async event => {
    const request = event.data
    if (request?.type !== 'capture' || typeof request.id !== 'string') return
    try {
      const {toCanvas} = await loadCapture()
      if (!toCanvas) throw new Error('Image capture is unavailable')
      await document.fonts.ready
      const rect = request.rect
      if (!Number.isFinite(request.pixelRatio) || request.pixelRatio < 0.5 || request.pixelRatio > 8) throw new Error('Invalid image pixel ratio')
      if (!rect || ![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite) || rect.width < 1 || rect.height < 1 || rect.width * rect.height * request.pixelRatio ** 2 > 16_000_000) throw new Error('Image dimensions exceed the capture limit')
      const pixelRatio = request.pixelRatio
      const snapshot = await toCanvas(document.body, {pixelRatio, width: innerWidth, height: innerHeight, canvasWidth: innerWidth, canvasHeight: innerHeight, cacheBust: false})
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(rect.width * pixelRatio);canvas.height = Math.round(rect.height * pixelRatio)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Image canvas is unavailable')
      context.drawImage(snapshot,rect.x*pixelRatio,rect.y*pixelRatio,canvas.width,canvas.height,0,0,canvas.width,canvas.height)
      const blob = await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'))
      if (!blob || blob.size > 20_000_000) throw new Error('Image capture exceeded its size limit')
      send({type: 'capture', id: request.id, blob})
    } catch (error) { send({type:'capture', id:request.id, error: String(error)}) }
  }
  channel.port1.start()
  window.parent.postMessage({type:'lingxi-visualize-private'}, '*', [channel.port2])
  // The timer function is captured before author scripts can replace it.
  nativeSetTimeout(() => send({type:'booted'}), 0)
}

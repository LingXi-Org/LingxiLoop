export type BloubClockListener = (time: number) => void

const listeners = new Set<BloubClockListener>()
let animationFrame = 0
let sceneTime = 0
let lastFrame = 0

function canRun() {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden'
}

function stop() {
  if (animationFrame && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(animationFrame)
  animationFrame = 0
  lastFrame = 0
}

function tick(timestamp: number) {
  animationFrame = 0
  if (listeners.size === 0 || !canRun()) { stop(); return }
  const delta = lastFrame ? Math.min((timestamp - lastFrame) / 1000, 0.064) : 0
  lastFrame = timestamp
  sceneTime += delta
  for (const listener of listeners) listener(sceneTime)
  animationFrame = requestAnimationFrame(tick)
}

function start() {
  if (animationFrame || listeners.size === 0 || !canRun() || typeof requestAnimationFrame === 'undefined') return
  animationFrame = requestAnimationFrame(tick)
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stop()
    else start()
  })
}

export function getBloubClockTime() {
  return sceneTime
}

export function subscribeBloubClock(listener: BloubClockListener) {
  listeners.add(listener)
  start()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stop()
  }
}


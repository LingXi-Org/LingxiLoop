import { createCoverGuest } from './guest'

// This entry is bundled as TEXT by build-guest.mjs. Application code never imports it.
// Every object below lives in QuickJS memory, including its synthetic document.
const guest = createCoverGuest()
Object.assign(globalThis, guest.globals)
let mounted = false
Object.defineProperty(globalThis, 'hairline', { value: (figure: {
  mount: (surface: unknown, value: number) => unknown; range: number[]
}) => {
  if (mounted || typeof figure?.mount !== 'function' || !Array.isArray(figure.range) || figure.range.length !== 3 || !figure.range.every(Number.isFinite)) throw Error('invalid_figure')
  mounted = true
  figure.mount({ stage: guest.stage, svg: guest.svg, read: guest.read }, figure.range[1])
} })
Object.defineProperty(globalThis, '__coverDispatch', { value: (event: { type: string; [key: string]: unknown }) => {
  switch (event.type) {
    case 'snapshot': if (!mounted) throw Error('missing_figure'); break
    case 'tick': guest.advance(event.delta as number); break
    case 'environment': guest.environment(event as unknown as { visible: boolean; reducedMotion: boolean }); break
    case 'pointer': guest.pointer(event.kind as 'pointermove', event.x as number, event.y as number, event.pointerType as 'mouse'); break
    case 'focus': guest.focus(event.focused as boolean); break
    default: throw Error('invalid_event')
  }
  return guest.snapshot()
} })

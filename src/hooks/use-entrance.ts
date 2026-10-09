import { useLayoutEffect, useRef } from 'react'
import { EASE_OUT, ENTRANCE_SECONDS } from '@/lib/motion'

/** Replay a surface entrance without remounting its editor, form or runtime. */
export function useEntrance<T extends HTMLElement = HTMLDivElement>(identity: string | number | boolean | null) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (identity === null || !element?.animate) return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (preference.matches) return
    const animation = element.animate(
      [{ opacity: 0, translate: '0 4px' }, { opacity: 1, translate: '0 0' }],
      { duration: ENTRANCE_SECONDS * 1000, easing: `cubic-bezier(${EASE_OUT.join(',')})` },
    )
    const stop = () => { if (preference.matches) animation.cancel() }
    preference.addEventListener('change', stop)
    return () => { animation.cancel(); preference.removeEventListener('change', stop) }
  }, [identity])
  return ref
}

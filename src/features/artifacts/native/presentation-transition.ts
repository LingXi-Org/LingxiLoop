import type { ArtifactPage } from '../../../../shared/artifact-document'

export type SlideTransition = 'fade' | 'push' | 'magic'
export function navigationTransition(
  from: ArtifactPage,
  to: ArtifactPage,
  back: boolean,
  reducedMotion: boolean,
): SlideTransition | null {
  const value = (back ? to : from).transition
  return reducedMotion || value === 'none' ? null : value === 'slide' ? 'push' : value
}
export function transitionTiming(kind: SlideTransition): KeyframeAnimationOptions {
  return {
    duration: { fade: 320, push: 420, magic: 480 }[kind],
    easing: 'cubic-bezier(0.33, 0.01, 0.2, 1)',
    fill: 'forwards',
  }
}
export function transitionRect(
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  origin: Pick<DOMRect, 'left' | 'top'>,
  scale: number,
): Keyframe {
  return {
    left: `${(rect.left - origin.left) / scale}px`,
    top: `${(rect.top - origin.top) / scale}px`,
    width: `${rect.width / scale}px`,
    height: `${rect.height / scale}px`,
    right: 'auto',
    bottom: 'auto',
    transform: 'none',
  }
}

/** Only two rendered slides participate; cancellation releases every animation. */
export function animateSlideTransition(
  old: HTMLElement,
  next: HTMLElement,
  from: ArtifactPage,
  to: ArtifactPage,
  kind: SlideTransition,
  back: boolean,
  scale: number,
  veil: HTMLElement | null,
  done: () => void,
) {
  const animations: Animation[] = [],
    timing = transitionTiming(kind)
  const hidden: Array<[HTMLElement, string]> = []
  const animate = (element: HTMLElement, frames: Keyframe[]) =>
    animations.push(element.animate(frames, timing))
  if (kind === 'fade') animate(old, [{ opacity: 1 }, { opacity: 0 }])
  else if (kind === 'push') {
    const distance = from.width * (back ? -1 : 1)
    animate(old, [{ transform: 'translateX(0px)' }, { transform: `translateX(${-distance}px)` }])
    animate(next, [{ transform: `translateX(${distance}px)` }, { transform: 'translateX(0px)' }])
  } else {
    if (veil) animate(veil, [{ opacity: 1 }, { opacity: 0 }])
    const oldOrigin = old.getBoundingClientRect(),
      newOrigin = next.getBoundingClientRect()
    const matching = new Map(
        to.nodeOrder.flatMap((id) => {
          const n = to.nodes[id]
          return n && !n.parentId && !n.hidden && n.scope !== 'canvas'
            ? [[n.motionId ?? n.id, n] as const]
            : []
        }),
      ),
      paired = new Set<string>()
    const find = (root: HTMLElement, id: string) =>
      root.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`)
    for (const id of from.nodeOrder) {
      const node = from.nodes[id]
      if (!node || node.parentId || node.hidden || node.scope === 'canvas') continue
      const source = find(old, id),
        target = matching.get(node.motionId ?? node.id),
        element = target ? find(next, target.id) : null
      if (!source || getComputedStyle(source).visibility === 'hidden') continue
      if (!element) {
        animate(source, [{ opacity: 1 }, { opacity: 0 }])
        continue
      }
      paired.add(target!.id)
      const a = source.getBoundingClientRect(),
        b = element.getBoundingClientRect()
      hidden.push([source, source.style.visibility])
      source.style.visibility = 'hidden'
      if (
        Math.abs(a.left - oldOrigin.left - b.left + newOrigin.left) >= 0.5 * scale ||
        Math.abs(a.top - oldOrigin.top - b.top + newOrigin.top) >= 0.5 * scale ||
        Math.abs(a.width - b.width) >= 0.5 * scale ||
        Math.abs(a.height - b.height) >= 0.5 * scale
      )
        animate(element, [transitionRect(a, oldOrigin, scale), transitionRect(b, newOrigin, scale)])
    }
    for (const node of matching.values())
      if (!paired.has(node.id)) {
        const element = find(next, node.id)
        if (element) animate(element, [{ opacity: 0 }, { opacity: 1 }])
      }
  }
  let disposed = false
  const finish = () => {
    if (!disposed) {
      disposed = true
      done()
    }
  }
  void Promise.allSettled(animations.map((animation) => animation.finished)).then(finish)
  const timeout = setTimeout(finish, Number(timing.duration) + 250)
  return () => {
    disposed = true
    clearTimeout(timeout)
    for (const animation of animations) animation.cancel()
    for (const [element, visibility] of hidden) element.style.visibility = visibility
  }
}

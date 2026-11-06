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

/** Executable descendants keep their one live root instead of entering a DOM mirror. */
export function executableRootIds(page: ArtifactPage): Set<string> {
  const roots = new Set<string>()
  for (const node of Object.values(page.nodes))
    if (node.type === 'embed') {
      let ancestor = node
      while (ancestor.parentId && page.nodes[ancestor.parentId])
        ancestor = page.nodes[ancestor.parentId]
      roots.add(ancestor.id)
    }
  return roots
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
  const mirrors: MutationObserver[] = []
  let overlay: HTMLElement | undefined
  const mixedAspect = from.width * to.height !== to.width * from.height
  const lift = (element: HTMLElement) => {
    if (!mixedAspect) return element
    if (!overlay) {
      const stage = next.closest<HTMLElement>('.native-slides-presentation-stage')!
      const frame = document.createElement('div')
      frame.className = 'native-slides-presentation-frame native-magic-overlay'
      frame.setAttribute('aria-hidden', 'true')
      frame.inert = true
      Object.assign(frame.style, {
        width: `${to.width * scale}px`,
        height: `${to.height * scale}px`,
        overflow: 'visible',
        zIndex: '3',
        pointerEvents: 'none',
      })
      const container = document.createElement('div')
      container.className = 'native-slides-presentation-scale'
      Object.assign(container.style, {
        width: `${to.width}px`,
        height: `${to.height}px`,
        transform: `scale(${scale})`,
      })
      overlay = next
        .querySelector<HTMLElement>(':scope > .native-page-content')!
        .cloneNode(false) as HTMLElement
      Object.assign(overlay.style, { background: 'transparent', overflow: 'visible' })
      container.append(overlay)
      frame.append(container)
      stage.append(frame)
    }
    const clone = element.cloneNode(true) as HTMLElement
    overlay.append(clone)
    hidden.push([element, element.style.visibility])
    element.style.visibility = 'hidden'
    // React can finish loading images, formulas or SVG fonts after this layout.
    // Mirror their live descendants while the temporary root owns the motion.
    const mirror = new MutationObserver(() => {
      clone.replaceChildren(...Array.from(element.childNodes, (child) => child.cloneNode(true)))
    })
    mirror.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })
    mirrors.push(mirror)
    return clone
  }
  const animate = (element: HTMLElement, frames: Keyframe[]) =>
    animations.push(element.animate(frames, timing))
  if (kind === 'fade') animate(old, [{ opacity: 1 }, { opacity: 0 }])
  else if (kind === 'push') {
    const distance = from.width * (back ? -1 : 1)
    animate(old, [{ transform: 'translateX(0px)' }, { transform: `translateX(${-distance}px)` }])
    animate(next, [
      { transform: `translateX(${to.width * (back ? -1 : 1)}px)` },
      { transform: 'translateX(0px)' },
    ])
  } else {
    if (veil) animate(veil, [{ opacity: 1 }, { opacity: 0 }])
    const newOrigin = next.getBoundingClientRect()
    const executable = executableRootIds(to)
    const matching = new Map(
        to.nodeOrder.flatMap((id) => {
          const n = to.nodes[id]
          return n && !n.parentId && !n.hidden && n.scope !== 'canvas' && !executable.has(id)
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
      const start = transitionRect(source.getBoundingClientRect(), newOrigin, scale),
        end = transitionRect(element.getBoundingClientRect(), newOrigin, scale)
      hidden.push([source, source.style.visibility])
      source.style.visibility = 'hidden'
      if (
        ['left', 'top', 'width', 'height'].some(
          (key) =>
            Math.abs(Number.parseFloat(String(start[key])) - Number.parseFloat(String(end[key]))) >=
            0.5,
        )
      )
        animate(lift(element), [start, end])
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
    for (const mirror of mirrors) mirror.disconnect()
    for (const animation of animations) animation.cancel()
    for (const [element, visibility] of hidden) element.style.visibility = visibility
    overlay?.closest('.native-magic-overlay')?.remove()
  }
}

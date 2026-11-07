import type { ArtifactStyle } from '../../../../../shared/artifact-document'

/** Capture overflow ink without stretching the authored object. Symmetric bleed
 * keeps the rotation/flip center unchanged when placed back into the slide. */
export async function captureWithBleed(
  page: HTMLElement,
  element: HTMLElement,
  styles: ArtifactStyle[],
) {
  const { toPng } = await import('html-to-image')
  const stroke = Math.max(
    0,
    ...Array.from(element.querySelectorAll('polyline,line,path')).map(
      (ink) => Number.parseFloat(getComputedStyle(ink).strokeWidth) || 0,
    ),
  )
  const padding = Math.ceil(
    Math.max(
      2,
      stroke * 5,
      ...styles.map((style) =>
        Math.max(
          (style.strokeWidth ?? 0) * 5,
          style.shadow
            ? Math.max(Math.abs(style.shadow.x), Math.abs(style.shadow.y)) +
                2 * style.shadow.blur +
                Math.max(0, style.shadow.spread)
            : 0,
        ),
      ),
    ),
  )
  const wrapper = document.createElement('div'),
    clone = element.cloneNode(true) as HTMLElement
  const width = element.offsetWidth,
    height = element.offsetHeight
  const computed = getComputedStyle(element)
  for (const property of [
    'color',
    'font-family',
    'font-size',
    'font-style',
    'font-weight',
    'font-stretch',
    'font-kerning',
    'font-feature-settings',
    'font-variation-settings',
    'line-height',
    'letter-spacing',
    'word-spacing',
    'text-align',
    'text-transform',
    'text-indent',
    'text-shadow',
    'white-space',
    'direction',
    'writing-mode',
    'visibility',
  ])
    clone.style.setProperty(property, computed.getPropertyValue(property))
  Object.assign(wrapper.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${width + 2 * padding}px`,
    height: `${height + 2 * padding}px`,
    pointerEvents: 'none',
  })
  Object.assign(clone.style, {
    position: 'absolute',
    left: `${padding}px`,
    top: `${padding}px`,
    width: `${width}px`,
    height: `${height}px`,
    transform: 'none',
    margin: '0',
  })
  if (computed.boxSizing === 'content-box') {
    // width/height above describe the painted border box, including padding.
    clone.style.boxSizing = 'border-box'
    for (const property of ['padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width']) {
      clone.style.setProperty(property, computed.getPropertyValue(property))
    }
  }
  wrapper.append(clone)
  page.append(wrapper)
  try {
    return { data: await toPng(wrapper, { pixelRatio: 2, skipAutoScale: true }), padding }
  } finally {
    wrapper.remove()
  }
}

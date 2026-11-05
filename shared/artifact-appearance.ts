import type { ArtifactStyle, ArtifactNode } from './artifact-document.js'

/** Generated solely from validated, structured native properties; never source CSS. */
export function appearance(style: ArtifactStyle) {
  const gradient = style.gradient
  return {
    backgroundImage: gradient ? `${gradient.type === 'radial' ? 'radial-gradient(circle' : `linear-gradient(${gradient.angle}deg`},${gradient.stops.map(s => `${s.color} ${s.offset * 100}%`).join(',')})` : undefined,
    boxShadow: style.shadow ? `${style.shadow.x}px ${style.shadow.y}px ${style.shadow.blur}px ${style.shadow.spread}px ${style.shadow.color}` : undefined,
    letterSpacing: style.letterSpacing === undefined ? undefined : `${style.letterSpacing}px`,
    borderStyle: style.borderStyle,
  }
}
export function nodeTransform(node: ArtifactNode) {
  return `rotate(${node.rotation}deg) scale(${node.flipX ? -1 : 1},${node.flipY ? -1 : 1})`
}

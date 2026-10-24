/** Data boundary, not a JavaScript sandbox. Parse only strings copied out of the VM. */
export const COVER_VM_LIMITS = Object.freeze({ bytes: 262144, nodes: 1024, depth: 16, attributes: 24, value: 16384, callbacks: 128 })
export type CoverSvgNode = { id: number; tag: string; attrs: Record<string, string>; children: CoverSvgNode[] }
export type CoverFrame = { version: 1; sequence: number; root: CoverSvgNode }
const tags = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'linearGradient', 'stop', 'mask'])
const numeric = new Set(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'stop-opacity', 'offset'])
const classes = new Set(['nf', 'fo', 'sil', 'hi', 'lo', 'dash', 'dot', 'm', 'off', 'ghost'])
const idPattern = /^hl-[a-zA-Z0-9-]{1,64}$/
const localPaint = /^url\(#(hl-[a-zA-Z0-9-]{1,64})\)$/
export function invalidCoverData(): never { throw new Error('invalid_cover_vm_data') }
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function keys(value: Record<string, unknown>, expected: string) {
  if (Object.keys(value).sort().join(',') !== expected) invalidCoverData()
}
export function validateCoverAttribute(name: string, value: string): void {
  if (value.length > COVER_VM_LIMITS.value || /[\u0000-\u001f<>]/.test(value)) invalidCoverData()
  if (numeric.has(name)) {
    if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?%?$/i.test(value) || !Number.isFinite(Number(value.replace(/%$/, ''))) || Math.abs(Number(value.replace(/%$/, ''))) > 100000) invalidCoverData()
    return
  }
  switch (name) {
    case 'id': if (!idPattern.test(value)) invalidCoverData(); return
    case 'class': if (value.split(/\s+/).filter(Boolean).some(item => !classes.has(item))) invalidCoverData(); return
    case 'viewBox': if (value !== '0 0 400 320') invalidCoverData(); return
    case 'aria-hidden': if (value !== 'true') invalidCoverData(); return
    case 'd': if (!/^[MmZzLlHhVvCcSsQqTtAa0-9.,+eE\s-]*$/.test(value)) invalidCoverData(); return
    case 'points': if (!/^[0-9.,+eE\s-]*$/.test(value)) invalidCoverData(); return
    case 'fill': case 'stroke': case 'stop-color':
      if (!/^(?:none|#[\da-fA-F]{3}(?:[\da-fA-F]{3})?|var\(--hl-(?:plate|hi|edge|mid|lo)\))$/.test(value) && !localPaint.test(value)) invalidCoverData()
      return
    case 'mask': if (!localPaint.test(value)) invalidCoverData(); return
    case 'gradientUnits': case 'maskUnits': if (value !== 'userSpaceOnUse') invalidCoverData(); return
    case 'stroke-linecap': if (!['round', 'butt', 'square'].includes(value)) invalidCoverData(); return
    case 'stroke-linejoin': if (!['round', 'miter', 'bevel'].includes(value)) invalidCoverData(); return
    case 'vector-effect': if (value !== 'non-scaling-stroke') invalidCoverData(); return
    default: invalidCoverData()
  }
}

/** One complete bounded snapshot. No functions, DOM handles, CSS, URLs or partial mutations. */
export function parseCoverFrame(json: string): CoverFrame {
  if (typeof json !== 'string' || json.length > COVER_VM_LIMITS.bytes) invalidCoverData()
  // QuickJS has no browser TextEncoder; keep the guest check entirely VM-local.
  let bytes = 0
  for (const character of json) {
    const point = character.codePointAt(0)!
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4
    if (bytes > COVER_VM_LIMITS.bytes) invalidCoverData()
  }
  const frame: unknown = JSON.parse(json)
  if (!record(frame)) invalidCoverData()
  keys(frame, 'root,sequence,version')
  if (frame.version !== 1 || !Number.isSafeInteger(frame.sequence) || Number(frame.sequence) < 0) invalidCoverData()
  const ids = new Set<number>(), localIds = new Map<string, string>(), references: { name: string; id: string }[] = []
  let count = 0
  function visit(value: unknown, depth: number): CoverSvgNode {
    if (++count > COVER_VM_LIMITS.nodes || depth > COVER_VM_LIMITS.depth || !record(value)) invalidCoverData()
    keys(value, 'attrs,children,id,tag')
    if (!Number.isSafeInteger(value.id) || Number(value.id) < 1 || ids.has(Number(value.id)) || typeof value.tag !== 'string' || !tags.has(value.tag)) invalidCoverData()
    ids.add(Number(value.id))
    if ((depth === 0) !== (value.tag === 'svg') || !record(value.attrs) || !Array.isArray(value.children) || Object.keys(value.attrs).length > COVER_VM_LIMITS.attributes) invalidCoverData()
    const attrs: Record<string, string> = Object.create(null)
    for (const [name, attr] of Object.entries(value.attrs)) {
      if (typeof attr !== 'string') invalidCoverData()
      validateCoverAttribute(name, attr)
      attrs[name] = attr
      if (name === 'id') { if (localIds.has(attr)) invalidCoverData(); localIds.set(attr, value.tag) }
      const reference = localPaint.exec(attr)
      if (reference) references.push({ name, id: reference[1] })
    }
    if (depth === 0 && attrs.viewBox !== '0 0 400 320') invalidCoverData()
    return { id: Number(value.id), tag: value.tag, attrs, children: value.children.map(child => visit(child, depth + 1)) }
  }
  const root = visit(frame.root, 0)
  for (const reference of references) {
    if (localIds.get(reference.id) !== (reference.name === 'mask' ? 'mask' : 'linearGradient')) invalidCoverData()
  }
  return { version: 1, sequence: Number(frame.sequence), root }
}

/** Copy only primitive strings, checking their own immutable length first.
 * QuickJS 0.32's QTS_GetLength fast path does not accept primitive strings.
 * Reading the primitive's own length avoids that object-only API; never coerce
 * a guest object or use dump(), which can invoke guest hooks while copying.
 */
export function copyCoverFrameString<Handle extends { dispose(): void }>(context: {
  typeof(value: Handle): string
  getProp(value: Handle, name: string): Handle
  getNumber(value: Handle): number
  getString(value: Handle): string
}, value: Handle): string {
  if (context.typeof(value) !== 'string') invalidCoverData()
  const lengthHandle = context.getProp(value, 'length')
  try {
    if (context.typeof(lengthHandle) !== 'number') invalidCoverData()
    const length = context.getNumber(lengthHandle)
    if (!Number.isSafeInteger(length) || length < 0 || length > COVER_VM_LIMITS.bytes) invalidCoverData()
  } finally { lengthHandle.dispose() }
  const json = context.getString(value)
  parseCoverFrame(json)
  return json
}

/** This sink belongs inside the opaque presentation document, never the app DOM. */
export function createCoverSvgSink<Node extends {
  setAttribute(name: string, value: string): void
  appendChild(child: NoInfer<Node>): unknown
}>(stage: {
  ownerDocument: { createElementNS(namespace: string, tag: string): Node }
  replaceChildren(...children: NoInfer<Node>[]): void
}) {
  let sequence = -1, disposed = false
  return {
    accept(json: string) {
      if (disposed) return false
      const frame = parseCoverFrame(json)
      if (frame.sequence <= sequence) return false
      const build = (node: CoverSvgNode): Node => {
        const element = stage.ownerDocument.createElementNS('http://www.w3.org/2000/svg', node.tag)
        for (const [name, value] of Object.entries(node.attrs)) element.setAttribute(name, value)
        for (const child of node.children) element.appendChild(build(child))
        return element
      }
      const svg = build(frame.root)
      stage.replaceChildren(svg)
      sequence = frame.sequence
      return true
    },
    dispose() { disposed = true; stage.replaceChildren() },
  }
}

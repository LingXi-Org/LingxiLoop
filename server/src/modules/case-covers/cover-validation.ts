import { load } from 'cheerio'
import { z } from 'zod'

export type CoverFailure = 'invalid_model_output' | 'invalid_svg' | 'upstream_validation' | 'source_integrity' | 'renderer_unavailable' | 'render_failed'
/** Fixed, non-sensitive category: never persist a model reply, prompt, or browser exception. */
export class CaseCoverGenerationError extends Error {
  constructor(readonly code: CoverFailure, readonly checks: string[] = []) { super(`case_cover_${code}`); this.name = 'CaseCoverGenerationError' }
}
const proposalSchema = z.object({
  objectName: z.string().trim().min(1).max(80),
  rationale: z.string().trim().min(1).max(500),
  altText: z.string().trim().min(1).max(300).regex(/[\u3400-\u9fff]/),
  figure: z.string().trim().min(1).max(65_536),
}).strict()
export type CoverProposal = z.infer<typeof proposalSchema>
export function parseCoverProposal(value: string): CoverProposal {
  try {
    if (Buffer.byteLength(value) > 90_000) throw new Error()
    const parsed = proposalSchema.parse(JSON.parse(value))
    // This only protects the HTML script slot. Upstream checks are not an execution sandbox.
    if (/<\/script|<!--|-->/i.test(parsed.figure) || parsed.figure.split('\n').length > 200) throw new Error()
    return parsed
  } catch { throw new CaseCoverGenerationError('invalid_model_output') }
}
const tags = new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','defs','mask','linearGradient','stop'])
const attributes = new Set(['xmlns','viewBox','d','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','width','height','points','transform','id','class','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-dasharray','stroke-opacity','fill-opacity','opacity','mask','maskUnits','gradientUnits','offset','stop-color','stop-opacity','aria-hidden','role','preserveAspectRatio'])
const numeric = new Set(['x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','width','height','stroke-width','stroke-opacity','fill-opacity','opacity','offset','stop-opacity'])
const colors = /^(?:none|black|white|#[0-9a-fA-F]{3,8})$/
const localReference = /^url\(#([A-Za-z_][\w.-]{0,80})\)$/
const classNames = new Set(['sil','hi','lo','nf','fo','dash','dot','m','off','ghost'])
const geometryTags = new Set(['path','rect','circle','ellipse','line','polyline','polygon'])

/** XML parse + closed whitelist. Reject unknown active content; never repair it into a success. */
export function sanitizeCoverSvg(input: string): string {
  const fail = (): never => { throw new CaseCoverGenerationError('invalid_svg') }
  if (!input || Buffer.byteLength(input) > 512_000 || /<!|<\?|&(?:#|[a-z])/i.test(input)) fail()
  const $ = load(input, { xml: true })
  const roots = $.root().children()
  if (roots.length !== 1 || roots[0]?.tagName !== 'svg' || roots.attr('viewBox') !== '0 0 400 320') fail()
  const all = $('*')
  if (all.length > 1600) fail()
  const ids = new Set<string>(), references: string[] = []
  let geometry = 0
  all.each((_, node) => {
    if (!('tagName' in node)) return fail()
    if (!tags.has(node.tagName) || (node !== roots[0] && node.tagName === 'svg')) fail()
    const el = $(node)
    for (const [key, value] of Object.entries(node.attribs)) {
      if (!attributes.has(key) || value.length > 32_768 || /[<>\u0000-\u0008]/.test(value)) fail()
      if (key === 'xmlns' && value !== 'http://www.w3.org/2000/svg') fail()
      if (key === 'id') { if (!/^[A-Za-z_][\w.-]{0,80}$/.test(value) || ids.has(value)) fail(); ids.add(value) }
      if (['opacity','stroke-opacity','fill-opacity','stop-opacity'].includes(key) && (Number(value)<0 || Number(value)>1)) fail()
      if (numeric.has(key) && (!/^-?(?:\d+(?:\.\d*)?|\.\d+)%?$/.test(value) || Math.abs(parseFloat(value)) > 100_000)) fail()
      if (['fill','stroke','stop-color'].includes(key) && !colors.test(value)) {
        const ref = key === 'fill' ? localReference.exec(value) : null
        if (!ref || !el.parents('defs,mask').length) fail(); else references.push(ref[1])
      }
      if (key === 'mask') { const ref = localReference.exec(value); if (!ref) fail(); else references.push(ref[1]) }
      if (key === 'd' && (!/^[MmLlHhVvCcSsQqTtAaZz\d\s.,+eE-]+$/.test(value) || !/[Mm]/.test(value))) fail()
      if (key === 'points' && !/^[\d\s.,+eE-]+$/.test(value)) fail()
      if (key === 'transform' && !/^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\([\d\s.,+eE-]+\)\s*)+$/.test(value)) fail()
      if (key === 'stroke-dasharray' && !/^[\d.,\s]+$/.test(value)) fail()
      if (key === 'stroke-linecap' && !['round','butt','square'].includes(value)) fail()
      if (key === 'stroke-linejoin' && !['round','miter','bevel'].includes(value)) fail()
      if (['maskUnits','gradientUnits'].includes(key) && !['userSpaceOnUse','objectBoundingBox'].includes(value)) fail()
    }
    const classes = (el.attr('class') || '').split(/\s+/).filter(Boolean)
    if (classes.some(c => !classNames.has(c))) fail()
    if (node.tagName === 'path' && !el.attr('d')?.trim()) fail()
    if (geometryTags.has(node.tagName) && !el.parents('defs,mask').length) {
      geometry++
      // Inline fixed palette makes the exported preview self-contained, without arbitrary CSS.
      el.attr('fill', classes.includes('nf') || el.parents('.ghost').length ? 'none' : '#ffffff')
      el.attr('stroke', classes.includes('fo') ? 'none' : classes.includes('lo') ? '#e0e0e4' : '#c3c3c9')
      el.attr('stroke-width','0.9').attr('stroke-linecap','round').attr('stroke-linejoin','round')
      if (classes.includes('sil')) el.attr('stroke','#a4a4ac')
      if (classes.includes('hi')) el.attr('stroke','#232327')
      if (classes.includes('dot')) el.attr('fill',classes.includes('off') ? '#e0e0e4' : classes.includes('m') ? '#a4a4ac' : '#232327').attr('stroke','none')
      if (classes.includes('dash')) el.attr('stroke-dasharray','1 3')
    }
    for (const child of node.children) if (child.type !== 'tag' && !(child.type === 'text' && !child.data.trim())) fail()
  })
  all.removeAttr('class')
  if (!geometry || references.some(id => !ids.has(id))) fail()
  roots.prepend('<rect x="0" y="0" width="400" height="320" fill="#ffffff"/>')
  roots.attr('xmlns','http://www.w3.org/2000/svg').attr('width','400').attr('height','320').attr('preserveAspectRatio','xMidYMid meet')
  return $.xml(roots)
}

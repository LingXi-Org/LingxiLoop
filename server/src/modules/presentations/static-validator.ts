import { createHash } from 'node:crypto'

export const PRESENTATION_STATIC_VALIDATOR_VERSION = 'lingxiloop-presentation-static-validator@1.0.0'
export const PRESENTATION_STATIC_REPORT_SCHEMA_VERSION = 'presentation_static_validation_report_v1'

const MAX_HTML_BYTES = 25 * 1024 * 1024
const DECK_WIDTH = 1280
const DECK_HEIGHT = 720
const SAFE_MARGIN = 64
const PINNED_RUNTIME_VERSION = 'interactive-lecture-deck@ca99f22+a5802b9+2973db3'

const CHECK_IDS = [
  'html.envelope',
  'html.size',
  'html.selfContained',
  'html.activeContent',
  'csp.outer',
  'csp.scriptHashes',
  'iframe.sandbox',
  'deck.data',
  'deck.manifest',
  'deck.structure',
  'slide.srcdoc',
  'slide.geometry',
  'slide.zoom',
  'runtime.layers',
  'runtime.protectedView',
  'runtime.slowLoadGuard',
  'runtime.reducedMotion',
  'runtime.input',
  'runtime.escape',
] as const

export type PresentationStaticCheckId = typeof CHECK_IDS[number]

export interface PresentationStaticValidationIssueV1 {
  code: string
  checkId: PresentationStaticCheckId
  location: string | null
  message: string
}

export interface PresentationStaticValidationCheckV1 {
  id: PresentationStaticCheckId
  passed: boolean
  violationCount: number
}

export interface PresentationStaticValidationReportV1 {
  schemaVersion: typeof PRESENTATION_STATIC_REPORT_SCHEMA_VERSION
  validatorVersion: typeof PRESENTATION_STATIC_VALIDATOR_VERSION
  artifactSha256: string
  sizeBytes: number
  passed: boolean
  metrics: {
    slideCount: number
    contentSlideCount: number
    stepCount: number
    anchorCount: number
    executableScriptCount: number
    iframeCount: number
  }
  checks: PresentationStaticValidationCheckV1[]
  issues: PresentationStaticValidationIssueV1[]
}

interface AttributeResult {
  present: boolean
  value: string
}

interface ScriptTag {
  attributes: string
  body: string
  executable: boolean
}

interface RectV1 {
  x: number
  y: number
  width: number
  height: number
}

interface DeckAnchorV1 {
  id?: unknown
  label?: unknown
  rect?: unknown
  panel?: unknown
}

interface DeckSlideV1 {
  id?: unknown
  title?: unknown
  html?: unknown
  anchors?: unknown
}

interface DeckDataV1 {
  manifest?: unknown
  slides?: unknown
}

type IssueWriter = (
  checkId: PresentationStaticCheckId,
  code: string,
  message: string,
  location?: string,
) => void

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function attribute(attributes: string, name: string): AttributeResult {
  const expression = new RegExp(
    `(?:^|\\s)${escapeRegExp(name)}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+)))?`,
    'i',
  )
  const match = expression.exec(attributes)
  if (!match) return { present: false, value: '' }
  return { present: true, value: match[1] ?? match[2] ?? match[3] ?? '' }
}

function extractTags(html: string, tagName: string): string[] {
  const expression = new RegExp(`<${escapeRegExp(tagName)}\\b([^>]*)>`, 'gi')
  return [...html.matchAll(expression)].map((match) => match[1] ?? '')
}

function extractScripts(html: string): ScriptTag[] {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].map((match) => {
    const attributes = match[1] ?? ''
    const type = attribute(attributes, 'type').value.trim().toLowerCase()
    return {
      attributes,
      body: match[2] ?? '',
      executable: type === '' || type === 'module' || /^(?:text|application)\/(?:java|ecma)script$/.test(type),
    }
  })
}

function extractOuterCsp(html: string): string | null {
  for (const attributes of extractTags(html, 'meta')) {
    if (attribute(attributes, 'http-equiv').value.toLowerCase() === 'content-security-policy') {
      return attribute(attributes, 'content').value || null
    }
  }
  return null
}

function parseCsp(value: string): { directives: Map<string, string[]>; duplicates: string[] } {
  const directives = new Map<string, string[]>()
  const duplicates: string[] = []
  for (const part of value.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean)
    const name = tokens.shift()?.toLowerCase()
    if (!name) continue
    if (directives.has(name)) duplicates.push(name)
    else directives.set(name, tokens)
  }
  return { directives, duplicates }
}

function hasOnlyNone(directives: Map<string, string[]>, name: string): boolean {
  const values = directives.get(name)
  return values?.length === 1 && values[0] === "'none'"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function parseRect(value: unknown): RectV1 | null {
  if (!isRecord(value)) return null
  const keys = ['x', 'y', 'width', 'height'] as const
  if (!keys.every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]))) return null
  return { x: value.x as number, y: value.y as number, width: value.width as number, height: value.height as number }
}

function externalResourceMatches(html: string): string[] {
  const matches: string[] = []
  const attributePattern = /\b(?:src|href|action|formaction|poster|data|cite)\s*=\s*(?:"\s*([^"\s]+)|'\s*([^'\s]+)|([^\s>]+))/gi
  for (const match of html.matchAll(attributePattern)) {
    const value = match[1] ?? match[2] ?? match[3] ?? ''
    if (/^(?:https?:|wss?:|\/\/)/i.test(value)) matches.push(value)
  }
  for (const match of html.matchAll(/(?:url\(|@import\s+)(?:\s*["']?)((?:https?:|\/\/)[^)"'\s;]+)/gi)) {
    matches.push(match[1] ?? '')
  }
  return matches
}

function hasInlineEventAttribute(html: string): boolean {
  return [...html.matchAll(/<[a-z][^>]*>/gi)].some((match) => /\s(?:on[a-z]+)\s*=/i.test(match[0]))
}

function classifySlide(html: string): 'opening' | 'content' | 'sources' | 'closing' | null {
  const main = /<main\b[^>]*\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/i.exec(html)
  const classes = (main?.[1] ?? main?.[2] ?? '').split(/\s+/)
  if (classes.includes('content-slide')) return 'content'
  for (const kind of ['opening', 'sources', 'closing'] as const) {
    if (classes.includes('special-slide') && classes.includes(kind)) return kind
  }
  return null
}

function protectedView(rect: RectV1): {
  panel: RectV1
  target: RectV1
  protectedRegion: RectV1
} {
  const panelWidth = 330
  const panelGap = 34
  const roomRight = DECK_WIDTH - (rect.x + rect.width)
  const roomLeft = rect.x
  const side = roomRight >= panelWidth + panelGap || roomRight >= roomLeft ? 'right' : 'left'
  const panelX = side === 'right' ? DECK_WIDTH - panelWidth - 42 : 42
  const protectedX = side === 'right' ? 46 : panelWidth + panelGap + 46
  const protectedWidth = DECK_WIDTH - panelWidth - panelGap - 92
  const rawScale = Math.min(
    protectedWidth / Math.max(180, rect.width * 1.65),
    500 / Math.max(120, rect.height * 1.65),
  )
  const scale = Math.max(0.84, Math.min(1.72, rawScale))
  const targetX = protectedX + protectedWidth / 2
  const targetY = DECK_HEIGHT / 2
  return {
    panel: { x: panelX, y: 82, width: panelWidth, height: 556 },
    protectedRegion: { x: protectedX, y: SAFE_MARGIN, width: protectedWidth, height: DECK_HEIGHT - SAFE_MARGIN * 2 },
    target: {
      x: targetX - rect.width * scale / 2,
      y: targetY - rect.height * scale / 2,
      width: rect.width * scale,
      height: rect.height * scale,
    },
  }
}

function rectanglesOverlap(left: RectV1, right: RectV1): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y
}

function containedBy(inner: RectV1, outer: RectV1, tolerance = 0.01): boolean {
  return inner.x >= outer.x - tolerance
    && inner.y >= outer.y - tolerance
    && inner.x + inner.width <= outer.x + outer.width + tolerance
    && inner.y + inner.height <= outer.y + outer.height + tolerance
}

function validateRuntime(script: string, html: string, add: IssueWriter): void {
  const layerRequirements = [
    ['runtime.layers.html', 'id="viewport"', 'The viewport layer is missing'],
    ['runtime.layers.html', 'class="fit"', 'The fit layer is missing'],
    ['runtime.layers.html', 'class="interaction"', 'The interaction layer is missing'],
    ['runtime.layers.html', 'id="spatial"', 'The spatial layer is missing'],
    ['runtime.layers.html', 'id="camera"', 'The camera layer is missing'],
    ['runtime.layers.html', 'id="highlight"', 'The highlight layer is missing'],
    ['runtime.layers.html', 'id="geometry-probe"', 'The geometry probe is missing'],
    ['runtime.layers.perspective', 'perspective:1500px', 'The pinned 1500px perspective is missing'],
    ['runtime.layers.fit', 'Math.min(innerWidth / 1280, innerHeight / 720)', 'The 1280×720 fit solver is missing'],
    ['runtime.layers.coplanar', '.frame-shell', 'The frame shell style is missing'],
    ['runtime.layers.coplanar', 'iframe{display:block;width:1280px;height:720px', 'The iframe does not use the fixed deck plane'],
    ['runtime.layers.coplanar', '.highlight{position:absolute', 'The highlight plane style is missing'],
    ['runtime.layers.coplanar', '.geometry-probe{position:absolute', 'The geometry probe plane style is missing'],
    ['runtime.layers.steps', 'steps.push({ slideIndex, anchor: null })', 'Every slide overview is not represented as a step'],
    ['runtime.layers.steps', 'slide.anchors.forEach(anchor => steps.push({ slideIndex, anchor }))', 'Zoom anchors are not represented as steps'],
    ['runtime.layers.steps', 'document.documentElement.dataset.stepCount = String(steps.length)', 'Runtime step count is not exposed deterministically'],
  ] as const
  for (const [code, token, message] of layerRequirements) {
    if (!html.includes(token)) add('runtime.layers', code, message)
  }
  for (const selector of ['frame-shell', 'highlight', 'geometry-probe']) {
    if (!new RegExp(`\\.${selector}\\{[^}]*transform:translateZ\\(0\\)`).test(html)) {
      add('runtime.layers', 'runtime.layers.coplanar', 'Frame, iframe, highlight, and probe must share the zero-Z plane', selector)
    }
  }
  if (!/iframe\{[^}]*transform:translateZ\(0\)/.test(html)) {
    add('runtime.layers', 'runtime.layers.coplanar', 'Frame, iframe, highlight, and probe must share the zero-Z plane', 'iframe')
  }

  const protectedRequirements = [
    ['runtime.protected.function', 'function protectedView(rect)', 'The protected-view solver is missing'],
    ['runtime.protected.panel', 'const panelWidth = 330, panelGap = 34', 'The pinned panel exclusion geometry is missing'],
    ['runtime.protected.bounds', '1280 - panelWidth - panelGap - 92', 'The protected viewport width formula is missing'],
    ['runtime.protected.scale', '), .84, 1.72)', 'The protected-view scale clamp is missing'],
    ['runtime.protected.bridge', "translate3d(0,0,-92px)", 'The spatial back-step bridge is missing'],
  ] as const
  for (const [code, token, message] of protectedRequirements) {
    if (!script.includes(token)) add('runtime.protectedView', code, message)
  }

  const raceRequirements = [
    ['runtime.load.pending', 'pendingSlideLoad?.cancel?.()', 'A superseded iframe load is not cancelled'],
    ['runtime.load.onload', 'frame.onload = onload', 'Iframe load completion is not guarded by onload'],
    ['runtime.load.frame', 'frame.srcdoc = data.slides[index].html', 'Slides are not loaded through inert srcdoc'],
    ['runtime.load.run', 'const run = ++renderRun', 'The render run fence is missing'],
    ['runtime.load.guard', 'if (run !== renderRun || stepIndex !== targetStep) return', 'A slow iframe load can overwrite a newer step'],
    ['runtime.load.identity', 'if (pendingSlideLoad?.index === index) return pendingSlideLoad.promise', 'Concurrent loads of the same slide are not coalesced'],
  ] as const
  for (const [code, token, message] of raceRequirements) {
    if (!script.includes(token)) add('runtime.slowLoadGuard', code, message)
  }

  const reducedRequirements = [
    ['runtime.motion.query', "matchMedia('(prefers-reduced-motion: reduce)').matches", 'Reduced-motion preference is not observed'],
    ['runtime.motion.bridge', 'if (reduced || !spatial.animate) return Promise.resolve()', 'Reduced motion does not disable the 3D bridge'],
    ['runtime.motion.camera', 'if (!animate || reduced || !camera.animate)', 'Reduced motion does not disable camera animation'],
    ['runtime.motion.css', '@media(prefers-reduced-motion:reduce)', 'Reduced-motion CSS is missing'],
    ['runtime.motion.css', 'transition:none!important', 'Reduced-motion CSS does not disable transitions'],
  ] as const
  for (const [code, token, message] of reducedRequirements) {
    if (!html.includes(token) && !script.includes(token)) add('runtime.reducedMotion', code, message)
  }

  const inputRequirements = [
    ['runtime.input.keyboard', "addEventListener('keydown'", 'Keyboard navigation is missing'],
    ['runtime.input.forward', "['ArrowRight','ArrowDown','PageDown',' ']", 'Forward keyboard bindings are incomplete'],
    ['runtime.input.backward', "['ArrowLeft','ArrowUp','PageUp']", 'Backward keyboard bindings are incomplete'],
    ['runtime.input.bounds', "event.key === 'Home'", 'Home keyboard navigation is missing'],
    ['runtime.input.bounds', "event.key === 'End'", 'End keyboard navigation is missing'],
    ['runtime.input.zero', "event.key === '0'", 'Keyboard reset is missing'],
    ['runtime.input.wheel', "viewport.addEventListener('wheel'", 'Wheel zoom is missing'],
    ['runtime.input.wheel', '{ passive: false }', 'Wheel zoom cannot reliably suppress page scrolling'],
    ['runtime.input.wheel', '), .72, 2.45)', 'Wheel zoom does not use the pinned safe scale bounds'],
    ['runtime.input.pointer', "viewport.addEventListener('pointerdown'", 'Pointer drag start is missing'],
    ['runtime.input.pointer', "viewport.addEventListener('pointermove'", 'Pointer drag movement is missing'],
    ['runtime.input.pointer', "viewport.addEventListener('pointerup'", 'Pointer drag completion is missing'],
    ['runtime.input.capture', 'viewport.setPointerCapture(event.pointerId)', 'Pointer drag does not capture the pointer'],
    ['runtime.input.reset', "viewport.addEventListener('dblclick'", 'Double-click reset is missing'],
    ['runtime.input.reset', 'free = { x: 0, y: 0, scale: 1, yaw: 0, pitch: 0 }', 'The canonical camera reset state is missing'],
  ] as const
  for (const [code, token, message] of inputRequirements) {
    if (!script.includes(token)) add('runtime.input', code, message)
  }

  if (!script.includes('function escapeText(value)') || !script.includes('escapeText(selected.anchor.panel.observation)')) {
    add('runtime.escape', 'runtime.escape.panel', 'Zoom panel text is not escaped before innerHTML insertion')
  }
  if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts)\s*\(/.test(script)
    || /navigator\.sendBeacon\s*\(/.test(script)) {
    add('html.selfContained', 'html.runtime.networkApi', 'The trusted runtime contains a network API')
  }
  if (/\b(?:window|globalThis)\.open\s*\(/.test(script)) {
    add('html.activeContent', 'html.runtime.popup', 'The trusted runtime can open a popup')
  }
}

/**
 * Performs the deterministic, browser-free publication gate for a compiled lecture deck.
 * The report deliberately contains no timestamps or environment data, so identical bytes
 * always produce an identical report.
 */
export function validatePresentationHtml(html: string): PresentationStaticValidationReportV1 {
  const issues: PresentationStaticValidationIssueV1[] = []
  const checkOrder = new Map(CHECK_IDS.map((id, index) => [id, index]))
  const add: IssueWriter = (checkId, code, message, location) => {
    issues.push({ checkId, code, message, location: location ?? null })
  }
  const sizeBytes = Buffer.byteLength(html)
  const artifactSha256 = createHash('sha256').update(html).digest('hex')
  let slideCount = 0
  let contentSlideCount = 0
  let stepCount = 0
  let anchorCount = 0

  if (!/^\s*<!doctype html>/i.test(html) || !/<html\b/i.test(html) || !/<\/html>\s*$/i.test(html)) {
    add('html.envelope', 'html.envelope.document', 'Artifact must be a complete HTML document')
  }
  if (sizeBytes > MAX_HTML_BYTES) {
    add('html.size', 'html.size.limit', 'Artifact exceeds the 25 MiB publication limit')
  }

  for (const external of externalResourceMatches(html)) {
    add('html.selfContained', 'html.externalResource', 'Artifact contains an external resource URL', external.slice(0, 160))
  }
  if (/\bjavascript\s*:/i.test(html)) {
    add('html.activeContent', 'html.javascriptUrl', 'Artifact contains a javascript: URL')
  }
  if (/\btarget\s*=\s*(?:"_blank"|'_blank'|_blank)/i.test(html)) {
    add('html.activeContent', 'html.popupTarget', 'Artifact contains a popup navigation target')
  }
  if (/<\s*(?:form|object|embed|applet)\b/i.test(html)) {
    add('html.activeContent', 'html.forbiddenElement', 'Artifact contains a form, object, embed, or applet element')
  }
  if (hasInlineEventAttribute(html)) {
    add('html.activeContent', 'html.eventAttribute', 'Artifact contains an inline event-handler attribute')
  }

  const cspValue = extractOuterCsp(html)
  let cspDirectives = new Map<string, string[]>()
  if (!cspValue) {
    add('csp.outer', 'csp.missing', 'Artifact has no Content-Security-Policy meta element')
  } else {
    const parsedCsp = parseCsp(cspValue)
    cspDirectives = parsedCsp.directives
    for (const duplicate of parsedCsp.duplicates) {
      add('csp.outer', 'csp.duplicate', 'Content-Security-Policy contains a duplicate directive', duplicate)
    }
    for (const directive of ['default-src', 'connect-src', 'object-src', 'worker-src', 'base-uri', 'form-action']) {
      if (!hasOnlyNone(cspDirectives, directive)) {
        add('csp.outer', `csp.${directive}`, `${directive} must be explicitly restricted to 'none'`)
      }
    }
    for (const [name, values] of cspDirectives) {
      if (name === 'report-uri' || name === 'report-to') {
        add('csp.outer', 'csp.reporting', 'CSP reporting endpoints are forbidden in an offline artifact', name)
      }
      if (values.some((value) => /^(?:https?:|wss?:|\/\/|\*)/i.test(value))) {
        add('csp.outer', 'csp.externalSource', 'CSP permits an external source', `${name} ${values.join(' ')}`)
      }
    }
    const scriptSources = cspDirectives.get('script-src') ?? []
    if (scriptSources.length === 0 || scriptSources.some((value) => !/^'sha256-[A-Za-z0-9+/]+={0,2}'$/.test(value))) {
      add('csp.outer', 'csp.scriptSource', 'script-src must contain only SHA-256 hashes')
    }
  }

  const scripts = extractScripts(html)
  const executableScripts = scripts.filter((script) => script.executable)
  for (const script of scripts) {
    if (attribute(script.attributes, 'src').present) {
      add('html.selfContained', 'html.scriptSrc', 'Script elements may not load an external source')
    }
  }
  const allowedHashes = new Set(cspDirectives.get('script-src') ?? [])
  const actualHashes = new Set<string>()
  for (const script of executableScripts) {
    const hash = `'sha256-${createHash('sha256').update(script.body).digest('base64')}'`
    actualHashes.add(hash)
    if (!allowedHashes.has(hash)) {
      add('csp.scriptHashes', 'csp.scriptHash.mismatch', 'An executable script is not covered by its exact CSP hash')
    }
  }
  for (const hash of allowedHashes) {
    if (/^'sha256-/.test(hash) && !actualHashes.has(hash)) {
      add('csp.scriptHashes', 'csp.scriptHash.unused', 'CSP contains a hash that does not match an executable script')
    }
  }
  if (executableScripts.length !== 1) {
    add('csp.scriptHashes', 'csp.scriptCount', 'Artifact must contain exactly one trusted executable runtime script')
  }

  const iframeAttributes = extractTags(html, 'iframe')
  for (const [index, attributes] of iframeAttributes.entries()) {
    const sandbox = attribute(attributes, 'sandbox')
    if (!sandbox.present) {
      add('iframe.sandbox', 'iframe.sandbox.missing', 'Every iframe must be sandboxed', `iframe[${index}]`)
      continue
    }
    const tokens = sandbox.value.toLowerCase().split(/\s+/).filter(Boolean)
    for (const forbidden of ['allow-same-origin', 'allow-popups', 'allow-popups-to-escape-sandbox', 'allow-forms', 'allow-top-navigation']) {
      if (tokens.includes(forbidden)) {
        add('iframe.sandbox', 'iframe.sandbox.capability', `Iframe sandbox may not include ${forbidden}`, `iframe[${index}]`)
      }
    }
    if (attribute(attributes, 'src').present || attribute(attributes, 'srcdoc').present) {
      add('iframe.sandbox', 'iframe.staticSource', 'The slide iframe must receive validated srcdoc only from the pinned runtime', `iframe[${index}]`)
    }
  }
  if (iframeAttributes.length !== 1) {
    add('iframe.sandbox', 'iframe.count', 'Artifact must contain exactly one inert slide iframe')
  }

  const deckDataScripts = scripts.filter((script) => attribute(script.attributes, 'id').value === 'deck-data')
  let deckData: DeckDataV1 | null = null
  if (deckDataScripts.length !== 1 || attribute(deckDataScripts[0]?.attributes ?? '', 'type').value.toLowerCase() !== 'application/json') {
    add('deck.data', 'deck.data.element', 'Artifact must contain one non-executable application/json deck-data element')
  } else {
    try {
      const parsed: unknown = JSON.parse(deckDataScripts[0]!.body)
      if (isRecord(parsed)) deckData = parsed
      else add('deck.data', 'deck.data.shape', 'deck-data must be a JSON object')
    } catch {
      add('deck.data', 'deck.data.json', 'deck-data contains invalid JSON')
    }
  }

  const runtimeScript = executableScripts.map((script) => script.body).join('\n')
  validateRuntime(runtimeScript, html, add)

  if (deckData) {
    const manifest = isRecord(deckData.manifest) ? deckData.manifest : null
    const slides = Array.isArray(deckData.slides) ? deckData.slides as DeckSlideV1[] : null
    if (!manifest) add('deck.manifest', 'deck.manifest.shape', 'Deck manifest is missing or invalid')
    if (!slides) add('deck.structure', 'deck.slides.shape', 'Deck slides must be an array')
    if (manifest) {
      if (manifest.schemaVersion !== 'lecture_deck_manifest_v1') {
        add('deck.manifest', 'deck.manifest.version', 'Unknown lecture deck manifest version')
      }
      if (manifest.runtimeVersion !== PINNED_RUNTIME_VERSION) {
        add('deck.manifest', 'deck.manifest.runtime', 'Deck does not use the pinned interactive lecture runtime')
      }
      if (!nonEmptyString(manifest.rendererVersion) || !manifest.rendererVersion.startsWith('lingxiloop-deterministic-')) {
        add('deck.manifest', 'deck.manifest.renderer', 'Deck does not identify a deterministic LingxiLoop renderer')
      }
    }
    if (slides) {
      slideCount = slides.length
      const slideIds = new Set<string>()
      const kinds: Array<'opening' | 'content' | 'sources' | 'closing' | null> = []
      for (const [slideIndex, slide] of slides.entries()) {
        const location = `slides[${slideIndex}]`
        if (!isRecord(slide) || !nonEmptyString(slide.id) || !nonEmptyString(slide.title)
          || typeof slide.html !== 'string' || !Array.isArray(slide.anchors)) {
          add('deck.structure', 'deck.slide.shape', 'Slide id, title, html, and anchors are required', location)
          kinds.push(null)
          continue
        }
        if (slideIds.has(slide.id)) add('deck.structure', 'deck.slide.duplicateId', 'Slide IDs must be unique', location)
        slideIds.add(slide.id)
        const kind = classifySlide(slide.html)
        kinds.push(kind)
        if (!kind) add('deck.structure', 'deck.slide.kind', 'Slide must declare a supported opening/content/sources/closing class', location)
        if (kind === 'content') contentSlideCount += 1

        const slideExternal = externalResourceMatches(slide.html)
        for (const external of slideExternal) {
          add('slide.srcdoc', 'slide.externalResource', 'Slide srcdoc contains an external resource URL', `${location}:${external.slice(0, 100)}`)
        }
        if (/<script\b/i.test(slide.html) || hasInlineEventAttribute(slide.html) || /\bjavascript\s*:/i.test(slide.html)) {
          add('slide.srcdoc', 'slide.activeScript', 'Slide srcdoc must not contain script or executable attributes', location)
        }
        if (/<\s*(?:iframe|frame|form|object|embed|applet)\b/i.test(slide.html)) {
          add('slide.srcdoc', 'slide.activeElement', 'Slide srcdoc contains an active nested element', location)
        }
        const slideCsp = extractOuterCsp(slide.html)
        if (!slideCsp || !hasOnlyNone(parseCsp(slideCsp).directives, 'default-src')) {
          add('slide.srcdoc', 'slide.csp', "Slide srcdoc must use default-src 'none'", location)
        }
        if (!/<meta\b[^>]*content\s*=\s*["'][^"']*width=1280,height=720/i.test(slide.html)
          || !/html,body\{[^}]*width:1280px;height:720px/i.test(slide.html)
          || !/\.slide\{[^}]*width:1280px;height:720px;padding:64px/i.test(slide.html)) {
          add('slide.geometry', 'slide.canvas', 'Slide srcdoc must use a fixed 1280×720 canvas with a 64px safe margin', location)
        }

        const anchors = slide.anchors as DeckAnchorV1[]
        anchorCount += anchors.length
        const anchorIds = new Set<string>()
        for (const [anchorIndex, anchor] of anchors.entries()) {
          const anchorLocation = `${location}.anchors[${anchorIndex}]`
          if (!isRecord(anchor) || !nonEmptyString(anchor.id) || !nonEmptyString(anchor.label)
            || !isRecord(anchor.panel)
            || !nonEmptyString(anchor.panel.observation)
            || !nonEmptyString(anchor.panel.reason)
            || !nonEmptyString(anchor.panel.meaning)) {
            add('slide.zoom', 'slide.anchor.shape', 'Zoom anchor and observation/reason/meaning panel text are required', anchorLocation)
            continue
          }
          if (anchorIds.has(anchor.id)) add('slide.zoom', 'slide.anchor.duplicateId', 'Anchor IDs must be unique within a slide', anchorLocation)
          anchorIds.add(anchor.id)
          const rect = parseRect(anchor.rect)
          if (!rect || rect.width <= 0 || rect.height <= 0) {
            add('slide.geometry', 'slide.anchor.rect', 'Anchor rectangle must contain finite positive geometry', anchorLocation)
            continue
          }
          const safeArea = {
            x: SAFE_MARGIN,
            y: SAFE_MARGIN,
            width: DECK_WIDTH - SAFE_MARGIN * 2,
            height: DECK_HEIGHT - SAFE_MARGIN * 2,
          }
          if (!containedBy(rect, safeArea)) {
            add('slide.geometry', 'slide.anchor.safeArea', 'Anchor rectangle escapes the 64px slide safe area', anchorLocation)
          }
          const view = protectedView(rect)
          if (!containedBy(view.target, view.protectedRegion) || rectanglesOverlap(view.target, view.panel)) {
            add('runtime.protectedView', 'runtime.protected.geometry', 'Protected-view zoom can leave the safe region or overlap its panel', anchorLocation)
          }
        }
        const dataAnchorCount = slide.html.match(/\bdata-anchor-id\s*=/gi)?.length ?? 0
        if (kind === 'content') {
          if (anchors.length < 2 || anchors.length > 4) {
            add('slide.zoom', 'slide.anchor.count', 'Every content slide requires 2–4 explainable zoom anchors', location)
          }
          if (dataAnchorCount < anchors.length) {
            add('slide.zoom', 'slide.anchor.targets', 'Content slide has fewer visual anchor targets than zoom steps', location)
          }
        } else if (kind && anchors.length !== 0) {
          add('slide.zoom', 'slide.special.anchors', 'Opening, sources, and closing slides may not add zoom anchors', location)
        }
      }
      if (slides.length < 3 || slides.length > 40) {
        add('deck.structure', 'deck.slide.count', 'Deck must contain between 3 and 40 slides')
      }
      if (kinds[0] !== 'opening' || kinds.at(-2) !== 'sources' || kinds.at(-1) !== 'closing') {
        add('deck.structure', 'deck.slide.sequence', 'Deck must open with opening and end with sources followed by closing')
      }
      stepCount = slideCount + anchorCount
      if (manifest) {
        if (manifest.pageCount !== slideCount) add('deck.manifest', 'deck.manifest.pageCount', 'Manifest pageCount does not match deck-data')
        if (manifest.stepCount !== stepCount) add('deck.manifest', 'deck.manifest.stepCount', 'Manifest stepCount does not match overview and zoom steps')
        if (typeof manifest.sourceCount !== 'number' || manifest.sourceCount < 1 || manifest.sourceCount > 40) {
          add('deck.manifest', 'deck.manifest.sourceCount', 'Manifest sourceCount must be between 1 and 40')
        }
      }
    }
  }

  issues.sort((left, right) => {
    const checkDifference = (checkOrder.get(left.checkId) ?? 0) - (checkOrder.get(right.checkId) ?? 0)
    if (checkDifference !== 0) return checkDifference
    if (left.code !== right.code) return left.code < right.code ? -1 : 1
    const leftLocation = left.location ?? ''
    const rightLocation = right.location ?? ''
    if (leftLocation !== rightLocation) return leftLocation < rightLocation ? -1 : 1
    if (left.message === right.message) return 0
    return left.message < right.message ? -1 : 1
  })
  const checks = CHECK_IDS.map((id) => {
    const violationCount = issues.filter((issue) => issue.checkId === id).length
    return { id, passed: violationCount === 0, violationCount }
  })
  return {
    schemaVersion: PRESENTATION_STATIC_REPORT_SCHEMA_VERSION,
    validatorVersion: PRESENTATION_STATIC_VALIDATOR_VERSION,
    artifactSha256,
    sizeBytes,
    passed: issues.length === 0,
    metrics: {
      slideCount,
      contentSlideCount,
      stepCount,
      anchorCount,
      executableScriptCount: executableScripts.length,
      iframeCount: iframeAttributes.length,
    },
    checks,
    issues,
  }
}

import { artifactStyleSchema, type ArtifactDocument, type ArtifactPage, type ArtifactStyle, type ArtifactTheme } from './artifact-document.js'

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128)
function flatten(value: unknown, target: Record<string, string | number>, path = '') {
  if ((typeof value === 'string' || typeof value === 'number') && path && path.length <= 512) { target[path] = value; return }
  if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    if (!['__proto__', 'prototype', 'constructor'].includes(key)) flatten(item, target, path ? `${path}.${key}` : key)
  }
}

/** Projects published token data; native creation does not load a legacy parser or editor. */
export function projectArtifactThemes(namespace: string, title: string, raw: unknown, metadata: { version?: string; url?: string } = {}): ArtifactTheme[] {
  const data = object(raw), color = object(data.color)
  const variants = Array.isArray(color.themes) && color.themes.length ? color.themes.map(object) : [{ id: 'light', name: '' }]
  return variants.map(variant => {
    const tokens: Record<string, string | number> = {}
    flatten(data, tokens)
    const variantId = typeof variant.id === 'string' ? variant.id : 'light'
    if (Array.isArray(color.tokens)) for (const rawToken of color.tokens) {
      const token = object(rawToken), value = typeof token.value === 'string' ? token.value : object(token.value)[variantId]
      if (typeof token.name === 'string' && typeof value === 'string' && !['__proto__', 'prototype', 'constructor'].includes(token.name)) {
        tokens[token.name] = value; tokens[`color.${token.name}`] = value
      }
    }
    const families = object(object(data.type).families)
    for (const [name, family] of Object.entries(families)) if (typeof family === 'string') tokens[`font.${name}`] = family
    const id = safeId(`${namespace}_${variantId}`)
    return { id, name: `${title || String(data.name ?? namespace)}${variants.length > 1 ? ` · ${String(variant.name ?? variantId)}` : ''}`,
      tokens, source: { namespace, variant: variantId, ...metadata }, originalTokens: structuredClone(data) as ArtifactTheme['originalTokens'] }
  })
}

const semanticKeys: Record<string, readonly string[]> = {
  background: ['background', 'surface', 'ivory-warm', 'ivory'],
  text: ['text', 'ink', 'slate'],
  accent: ['accent', 'ember', 'clay'],
  'font.sans': ['font.sans', 'type.families.sans'],
}

function lookupToken(theme: ArtifactTheme, key: string): string | number | undefined {
  const direct = theme.tokens[key] ?? theme.tokens[key.replace(/^color\./, '')]
  if (direct !== undefined) return direct
  for (const name of semanticKeys[key] ?? []) {
    const value = theme.tokens[name] ?? theme.tokens[`color.${name}`]
    if (value !== undefined) return value
  }
  return undefined
}

export function artifactThemeToken(theme: ArtifactTheme | undefined, key: string): string | number | undefined {
  if (!theme) return undefined
  let value = lookupToken(theme, key), count = 0
  const seen = new Set<string>()
  while (typeof value === 'string' && /^\{[^{}]+\}$/.test(value) && count++ < 16) {
    const target = value.slice(1, -1)
    if (seen.has(target)) return undefined
    seen.add(target); value = lookupToken(theme, target)
  }
  if (typeof value === 'string' && /^\{[^{}]+\}$/.test(value)) return undefined
  return value
}

type ThemeSelection = Pick<ArtifactDocument, 'themeId' | 'themes'>
const selectedTheme = (document: ThemeSelection) => document.themeId ? document.themes[document.themeId] : undefined
function colorToken(theme: ArtifactTheme | undefined, key: string, fallback: string): string {
  const value = artifactThemeToken(theme, key)
  return typeof value === 'string' && artifactStyleSchema.shape.color.safeParse(value).success ? value : fallback
}
function fontToken(theme: ArtifactTheme | undefined, key: string, fallback: string): string {
  const value = artifactThemeToken(theme, key)
  return typeof value === 'string' && artifactStyleSchema.shape.fontFamily.safeParse(value).success ? value : fallback
}

/** Semantic roles bridge the preserved palette names without rewriting explicit authored colors. */
export function artifactThemeDefaults(theme: ArtifactTheme | undefined): { background: string; text: string; accent: string; fontFamily: string } {
  return { background: colorToken(theme, 'background', '#ffffff'), text: colorToken(theme, 'text', '#222222'),
    accent: colorToken(theme, 'accent', '#d6e6ff'), fontFamily: fontToken(theme, 'font.sans', 'sans-serif') }
}

export function artifactPageBackground(page: ArtifactPage, document: ThemeSelection): string {
  return page.themeBackground ? colorToken(selectedTheme(document), page.themeBackground, page.background) : page.background
}

/** Explicit style values remain authored overrides; UI custom edits also remove their semantic reference. */
export function artifactResolvedStyle(style: ArtifactStyle, document: ThemeSelection): ArtifactStyle {
  const theme = selectedTheme(document)
  return { ...style,
    ...(style.color === undefined && style.themeColor ? { color: colorToken(theme, style.themeColor, '#222222') } : {}),
    ...(style.fill === undefined && style.themeFill ? { fill: colorToken(theme, style.themeFill, '#d6e6ff') } : {}),
    ...(style.fontFamily === undefined && style.themeFont ? { fontFamily: fontToken(theme, style.themeFont, 'sans-serif') } : {}),
  }
}

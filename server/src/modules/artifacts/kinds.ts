import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

// Ported from JimLiu/baoyu-design@c15e76e skills/claude-{design,slides}/scripts/server.mjs:
// each kind's LAYOUT, comment location and editor page script policy. Limits that
// upstream leaves unbounded for a local folder are bounded for a shared host.
export const ARTIFACT_KINDS = ['design', 'slides'] as const
export type ArtifactKind = typeof ARTIFACT_KINDS[number]

export const BAOYU_DESIGN_ROOT = fileURLToPath(new URL('../../../../third_party/baoyu-design/upstream/', import.meta.url))

export interface ArtifactLayout {
  blobDir: string
  isFile(rel: string): boolean
  maxFiles: number
  maxPublishBytes: number
  maxFileBytes: number
  maxBlobBytes: number
  readOnlyMessage(path: string): string
}

export interface ArtifactKindDefinition {
  kind: ArtifactKind
  noun: string
  indexFile: string
  skillDirectory: string
  layout: ArtifactLayout
  pageScriptSrc(html: string): string
  commentLocation(input: { label: string; detail?: string }, index: unknown, exists: (file: string) => boolean): Record<string, unknown>
  initialIndex(title: string, at: string): Record<string, unknown>
}

export function projectFile(rel: string | undefined) {
  if (!rel) return undefined
  const body = rel.endsWith('/') ? rel.slice(0, -1) : rel
  const parts = body.split('/')
  if (!parts.every(part => part !== '' && part !== '..' && !part.startsWith('.') && !part.includes('\\'))) return undefined
  return `project/${rel}`
}

export function inlineScriptHashes(html: string) {
  const hashes: string[] = []
  for (const match of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    if (/\ssrc\s*=/i.test(match[1] ?? '')) continue
    hashes.push('sha256-' + createHash('sha256').update(match[2] ?? '', 'utf8').digest('base64'))
  }
  return hashes
}

const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/
const MB = 1024 * 1024

function isDesignFile(rel: string) {
  const parts = rel.split('/')
  if (parts[0] === 'assets') return false
  return parts.every(part => SEGMENT.test(part))
}

function isSlidesFile(rel: string) {
  const parts = rel.split('/')
  if (parts.some(part => part === '' || part === '.' || part === '..' || part.startsWith('.'))) return false
  if (rel === 'deck.json') return true
  if (parts[0] === 'slides') return parts.length === 2 && parts[1].endsWith('.html')
  return parts[0] === 'ds' && parts.length > 1
}

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null

export const ARTIFACT_KIND_DEFINITIONS: Record<ArtifactKind, ArtifactKindDefinition> = {
  design: {
    kind: 'design',
    noun: 'design',
    indexFile: 'canvas.json',
    skillDirectory: 'claude-design',
    layout: {
      blobDir: 'assets',
      isFile: isDesignFile,
      /** The format's limits: at most 512 files; one save writes at most 16 MB. */
      maxFiles: 512,
      maxPublishBytes: 16 * MB,
      maxFileBytes: 16 * MB,
      maxBlobBytes: 20 * MB,
      readOnlyMessage: p => `${p}: files under assets/, hidden paths and path segments outside [A-Za-z0-9_][A-Za-z0-9_.-]* can't be written`,
    },
    /** Boards run inline scripts, compile JSX with Babel (eval) and load from blob:. */
    pageScriptSrc: () => "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
    commentLocation(input, index) {
      const named = [...(input.detail ?? '').matchAll(/([^\s:;()]+\.dc\.html)\b/g)].flatMap(match => {
        try { return [decodeURIComponent(match[1])] } catch { return [] }
      })
      const boards = Object.keys(record(record(index)?.boards) ?? {})
      const board = named.find(name => boards.includes(name)) ?? named[0]
      const file = projectFile(board)
      return board && file ? { file, board } : { file: 'project/canvas.json' }
    },
    initialIndex: (title, at) => ({ v: 3, createdOnFiles: { v: 1, at }, title, launch: { view: 'canvas' },
      pages: [], boards: {}, order: [], notes: {}, designSystems: [] }),
  },
  slides: {
    kind: 'slides',
    noun: 'deck',
    indexFile: 'deck.json',
    skillDirectory: 'claude-slides',
    layout: {
      blobDir: 'assets',
      isFile: isSlidesFile,
      maxFiles: 512,
      maxPublishBytes: 16 * MB,
      maxFileBytes: 16 * MB,
      maxBlobBytes: 20 * MB,
      readOnlyMessage: p => `${p}: only deck.json, slides/*.html and ds/** can be written`,
    },
    /**
     * The editor page's own files, plus index.html's inline scripts by hash. 'unsafe-eval': the PPTX export's WOFF2
     * decoder (wawoff2, Emscripten) compiles WebAssembly and builds its embind glue with `new Function`.
     */
    pageScriptSrc: html => `script-src 'self' 'unsafe-eval' ${inlineScriptHashes(html).map(hash => `'${hash}'`).join(' ')}`.trim(),
    commentLocation(input, index, exists) {
      const match = /^(?:Area on slide|Slide) (\d+)(?: #([A-Za-z0-9_.-]+))?/.exec(input.detail ?? input.label)
      if (!match) return { file: 'project/deck.json' }
      const slide = Number(match[1])
      let slideId = match[2]
      if (!slideId) {
        const order = record(index)?.order
        if (Array.isArray(order) && typeof order[slide - 1] === 'string') slideId = order[slide - 1] as string
      }
      const file = slideId ? projectFile(`slides/${slideId}.html`) : undefined
      return slideId && file && exists(file) ? { file, slide, slideId } : { file: 'project/deck.json', slide }
    },
    initialIndex: (title, at) => ({ v: 4, createdOnFiles: { v: 1, at }, lists: 'css', title, order: [],
      sections: {}, faces: {}, designSystems: [] }),
  },
}

export function artifactKind(value: string): ArtifactKindDefinition {
  const definition = ARTIFACT_KIND_DEFINITIONS[value as ArtifactKind]
  if (!definition) throw Object.assign(new Error('unknown artifact kind'), { status: 404 })
  return definition
}

/**
 * Generic file tools — read / write / edit any file on disk.
 *
 * These are agent-side equivalents of Claude Code's tools — fast,
 * standard, general-purpose. They are NOT scoped to the agent's
 * persona directory: agents can use them on cloned repos, source
 * trees, /tmp, anything readable/writable from the process. The
 * "which paths persist back to the DB" policy is a separate concern
 * enforced at turn-commit time (see fs-namespace.ts:commit).
 *
 * Paths are resolved relative to the agent's current cwd (their
 * persona directory by default) if not absolute. Basic safety only —
 * NUL bytes rejected, sane length cap. Containers / OS permissions
 * provide the real boundary.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import type { FunctionTool } from 'openai/resources/responses/responses'
import type { ToolResult } from '../tools.js'
import type { FsNamespace } from './fs-namespace.js'

const MAX_READ_BYTES = 512 * 1024     // 512 KB
const MAX_WRITE_BYTES = 2 * 1024 * 1024  // 2 MB

export const NATIVE_TOOL_DEFS: FunctionTool[] = [
  {
    type: 'function',
    name: 'read_file',
    description: 'Read a file. Returns its full contents.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative path' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'write_file',
    description: 'Create or fully overwrite a file. Intermediate directories are created as needed.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative path' },
        content: { type: 'string', description: 'New file contents' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'edit_file',
    description: 'Replace exactly one occurrence of `old_string` with `new_string`. Fails if not found or appears more than once — include enough surrounding context to make the match unique.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative path' },
        old_string: { type: 'string', description: 'Exact text to find. Must appear exactly once.' },
        new_string: { type: 'string', description: 'Replacement text.' },
      },
      required: ['path', 'old_string', 'new_string'],
      additionalProperties: false,
    },
    strict: true,
  },
]

/** Resolve a path argument. Relative paths are anchored at the per-turn
 *  FS namespace root (the agent's persona-directory cwd). Absolute paths
 *  pass through. NUL bytes and silly lengths are rejected. */
function resolveArgPath(ns: FsNamespace | null, raw: string): string | null {
  if (!raw || raw.length === 0 || raw.length > 4096) return null
  if (raw.includes('\0')) return null
  if (isAbsolute(raw)) return raw
  const cwd = ns?.rootDir ?? process.cwd()
  return resolve(cwd, raw)
}

export async function tReadFile(args: Record<string, unknown>, ns: FsNamespace): Promise<ToolResult> {
  const t0 = Date.now()
  const path = String(args.path ?? '').trim()
  const abs = resolveArgPath(ns, path)
  if (!abs) return fail(t0, 'read_file', path, 'invalid path')

  try {
    const buf = await readFile(abs)
    if (buf.byteLength > MAX_READ_BYTES) {
      const head = buf.subarray(0, MAX_READ_BYTES).toString('utf8')
      return ok(t0, 'read_file', path, head + `\n\n[...truncated at ${MAX_READ_BYTES} bytes; original size ${buf.byteLength}]`)
    }
    return ok(t0, 'read_file', path, buf.toString('utf8'))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('ENOENT')) return fail(t0, 'read_file', path, `no such file: ${path}`)
    return fail(t0, 'read_file', path, msg)
  }
}

export async function tWriteFile(args: Record<string, unknown>, ns: FsNamespace): Promise<ToolResult> {
  const t0 = Date.now()
  const path = String(args.path ?? '').trim()
  const content = String(args.content ?? '')
  if (content.length > MAX_WRITE_BYTES) {
    return fail(t0, 'write_file', path, `content too large (${content.length} > ${MAX_WRITE_BYTES} bytes)`)
  }
  const abs = resolveArgPath(ns, path)
  if (!abs) return fail(t0, 'write_file', path, 'invalid path')

  try {
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, content, 'utf8')
    return ok(t0, 'write_file', path, `wrote ${path} (${content.length} chars)`)
  } catch (e) {
    return fail(t0, 'write_file', path, e instanceof Error ? e.message : String(e))
  }
}

export async function tEditFile(args: Record<string, unknown>, ns: FsNamespace): Promise<ToolResult> {
  const t0 = Date.now()
  const path = String(args.path ?? '').trim()
  const oldStr = String(args.old_string ?? '')
  const newStr = String(args.new_string ?? '')
  if (oldStr.length === 0) return fail(t0, 'edit_file', path, '`old_string` cannot be empty')

  const abs = resolveArgPath(ns, path)
  if (!abs) return fail(t0, 'edit_file', path, 'invalid path')

  let body: string
  try {
    body = await readFile(abs, 'utf8')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('ENOENT')) return fail(t0, 'edit_file', path, `no such file: ${path}`)
    return fail(t0, 'edit_file', path, msg)
  }

  const idx = body.indexOf(oldStr)
  if (idx === -1) return fail(t0, 'edit_file', path, '`old_string` not found in file — include enough surrounding context for an exact match')
  const idx2 = body.indexOf(oldStr, idx + oldStr.length)
  if (idx2 !== -1) return fail(t0, 'edit_file', path, '`old_string` appears multiple times — include more context so the match is unique')

  const next = body.slice(0, idx) + newStr + body.slice(idx + oldStr.length)
  try {
    await writeFile(abs, next, 'utf8')
    return ok(t0, 'edit_file', path, `edited ${path} (Δ ${newStr.length - oldStr.length} chars)`)
  } catch (e) {
    return fail(t0, 'edit_file', path, e instanceof Error ? e.message : String(e))
  }
}

function ok(t0: number, name: string, path: string, detail: string): ToolResult {
  return {
    ok: true,
    output: { path, detail },
    durationMs: Date.now() - t0,
    display: { name, arg: path, status: `ok · ${Date.now() - t0}ms`, detail: detail.length > 1400 ? detail.slice(0, 1400) + '\n…' : detail, icon: 'github' },
  }
}

function fail(t0: number, name: string, path: string, error: string): ToolResult {
  return {
    ok: false,
    output: null,
    error,
    durationMs: Date.now() - t0,
    display: { name, arg: path, status: 'error', detail: error, icon: 'github' },
  }
}

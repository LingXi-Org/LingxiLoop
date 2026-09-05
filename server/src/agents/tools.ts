/**
 * Internal capability helpers retained behind the Agent OS Host Bridge.
 * This module never defines model-visible tools; the model sees only IPython.
 */
import { randomUUID } from 'node:crypto'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { createChatCompletion } from '../llm.js'
import type { ToolResult } from './tools-shared.js'

export type { ToolResult } from './tools-shared.js'

/** Execute a non-model-visible product helper and record its audit row. */
export async function executeTool(args: {
  agentId: string
  name: string
  argsJson: string
  runId?: string | null
  companyId: string
  idempotencyKey?: string
}): Promise<ToolResult> {
  const startedAt = Date.now()
  const id = `t-${randomUUID()}`
  let parsed: Record<string, unknown> = {}
  try { parsed = JSON.parse(args.argsJson || '{}') }
  catch { parsed = {} }

  await pool.query(
    `INSERT INTO tool_calls (id, agent_id, name, args, status, run_id, company_id)
     VALUES ($1,$2,$3,$4::jsonb,'pending',$5,$6)`,
    [id, args.agentId, args.name, JSON.stringify(parsed), args.runId ?? null, args.companyId ?? null],
  )

  let result: ToolResult
  try {
    result = args.name === 'palette'
      ? await createPalette(parsed, args.companyId, args.agentId)
      : {
          ok: false,
          output: null,
          error: 'unknown internal helper',
          durationMs: Date.now() - startedAt,
          display: { name: args.name, arg: '', status: 'unknown helper', detail: `helper not implemented: ${args.name}` },
        }
  } catch (error) {
    result = {
      ok: false,
      output: null,
      error: String(error),
      durationMs: Date.now() - startedAt,
      display: { name: args.name, arg: JSON.stringify(parsed).slice(0, 80), status: 'error', detail: String(error) },
    }
  }

  await pool.query(
    `UPDATE tool_calls
        SET result = $2::jsonb, status = $3, error = $4, duration_ms = $5
      WHERE id = $1`,
    [id, JSON.stringify(result.output ?? null), result.ok ? 'ok' : 'error', result.error ?? null, result.durationMs],
  )
  return result
}

async function createPalette(args: Record<string, unknown>, companyId: string, agentId: string): Promise<ToolResult> {
  const startedAt = Date.now()
  const brief = String(args.brief ?? '').trim()
  const response = await createChatCompletion({ purpose: 'palette', companyId, agentId }, {
    model: env.OPENAI_MODEL,
    messages: [
      { role: 'system', content: 'You produce 5-color hex palettes. Reply ONLY with JSON: {"colors":["#RRGGBB", ...]}. No prose.' },
      { role: 'user', content: `Design brief: ${brief}\n\nReply with JSON only.` },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 800,
  })
  let colors: string[] = []
  try {
    const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}') as { colors?: string[] }
    colors = (parsed.colors ?? []).filter((color) => /^#[0-9A-Fa-f]{6}$/.test(color)).slice(0, 5)
  } catch { /* malformed provider output becomes an empty palette */ }
  return {
    ok: colors.length > 0,
    output: { colors, brief },
    durationMs: Date.now() - startedAt,
    display: {
      name: 'palette',
      arg: brief.slice(0, 60),
      status: `${colors.length} colors`,
      detail: colors.join('  '),
      icon: 'figma',
    },
  }
}

import { z } from 'zod'
import { UI_LIMITS } from './catalog.js'

const identity = z.string().min(1).max(200)
export const uiActionSchema = z.object({ id: identity, kind: z.enum(['explain', 'check-prediction', 'submit-answer']), label: z.string().min(1).max(160) }).strict()
export type UiAction = z.infer<typeof uiActionSchema>
export const uiFieldSchema = z.object({ key: z.string().regex(/^\$[a-zA-Z][a-zA-Z0-9_]{0,47}$/), type: z.enum(['number', 'string', 'boolean']),
  default: z.union([z.number().finite(), z.string().max(2_000), z.boolean()]), semantic: z.string().max(1_000), unit: z.string().max(32),
  min: z.number().finite().optional(), max: z.number().finite().optional(), step: z.number().finite().positive().optional(),
  options: z.array(z.string().max(160)).max(16).optional(), maxLength: z.number().int().min(0).max(2_000).optional() }).strict()
export type UiField = z.infer<typeof uiFieldSchema>
export const uiStateSchema = z.record(z.string().max(60), z.union([z.number().finite(), z.string().max(2_000), z.boolean()]))
  .refine(state => Object.keys(state).length <= UI_LIMITS.fields && new TextEncoder().encode(JSON.stringify(state)).length <= UI_LIMITS.stateBytes, 'state exceeds budget')
export type UiState = z.infer<typeof uiStateSchema>
export const openUiEnvelopeSchema = z.object({ schemaVersion: z.number().int().positive(), catalogVersion: identity, rendererVersion: identity,
  uiId: identity, messageId: identity, runId: identity, revision: z.number().int().positive(), baseRevision: z.number().int().nonnegative(),
  source: z.string().max(UI_LIMITS.sourceBytes), sourceHash: z.string().regex(/^[a-f0-9]{64}$/), fallback: z.string().min(1).max(4_000),
  phase: z.enum(['preview', 'ready']), fields: z.array(uiFieldSchema).max(UI_LIMITS.fields), actions: z.array(uiActionSchema).max(UI_LIMITS.actions),
}).strict()
export type OpenUiEnvelope = z.infer<typeof openUiEnvelopeSchema>
export const uiReferenceSchema = z.object({ messageId: identity, revision: z.number().int().positive(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
export const uiStateSaveSchema = uiReferenceSchema.extend({ expectedVersion: z.number().int().nonnegative(), state: uiStateSchema }).strict()
export const uiActionRequestSchema = uiReferenceSchema.extend({ actionId: identity, idempotencyKey: identity, state: uiStateSchema }).strict()
export const uiInteractionSchema = uiReferenceSchema.extend({ uiId: identity, actionId: identity, idempotencyKey: identity,
  state: uiStateSchema, kind: z.enum(['explain', 'check-prediction', 'submit-answer']) }).strict()
export type UiInteraction = z.infer<typeof uiInteractionSchema>
export interface UiStateResponse { state: UiState; version: number; readOnly: boolean; status: 'committed' | 'pending' | 'superseded'; resetKeys: string[] }

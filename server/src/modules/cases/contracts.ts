import { z } from 'zod'
import { matchesProjection, optionalContentDocument } from '../content-editor/contracts.js'
export const caseContentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(2000).default(''),
  editorDocument: optionalContentDocument, summaryDocument: optionalContentDocument,
  body: z.string().max(200_000).default(''),
  cover: z.string().max(2000).nullable().default(null),
  coverText: z.string().trim().max(24).optional(),
  coverColor: z.enum(['orange', 'green', 'blue', 'red', 'yellow', 'purple']).optional(),
  college: z.string().trim().max(80).optional(),
  category: z.string().trim().max(80).default(''),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
}).strict().refine(value => matchesProjection(value.editorDocument, value.body) && matchesProjection(value.summaryDocument, value.summary), 'native content and text must be saved together')
export const caseVersionSchema = z.object({ version: z.number().int().positive() }).strict()
export const caseSaveSchema = caseContentSchema.safeExtend({ version: z.number().int().positive() })
export const caseImageSchema = z.object({
  mime: z.enum(['image/png','image/jpeg','image/webp','image/gif']),
  data: z.string().min(1).max(12_000_000),
}).strict()
// Native file/audio/video blocks share the same case ownership and publication gates.
// Active browser documents (HTML/SVG) are stored as downloads, never served as active content.
export const caseFileSchema = z.object({
  mime: z.enum(['image/png','image/jpeg','image/webp','image/gif','audio/mpeg','audio/wav','audio/ogg','audio/mp4','video/mp4','video/webm','application/pdf','application/octet-stream']),
  data: z.string().min(1).max(12_000_000),
}).strict()
export type CaseContent = z.infer<typeof caseContentSchema>
export interface CaseScope { companyId: string; userId: string }
export const caseViewSchema = z.enum(['reader', 'manage']).default('reader')
export type CaseView = z.infer<typeof caseViewSchema>

export const caseOptionSchema = z.object({ kind: z.enum(['category', 'college']), name: z.string().trim().min(1).max(80) }).strict()

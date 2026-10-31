import { z } from 'zod'

export const slideEditorContextSchema = z.object({
  slideId: z.string().max(200).nullable(),
  selectedElementIds: z.array(z.string().max(200)).max(200),
  selectedText: z.string().max(16_000).default(''),
  selection: z.array(z.object({ id: z.string().max(200), kind: z.string().max(100).optional(), label: z.string().max(2000).optional() })).max(200).default([]),
  slideTitle: z.string().max(2000).default(''),
  slideIndex: z.number().int().min(0).max(10_000).default(0),
  slideCount: z.number().int().min(0).max(10_000).default(0),
  selectedSlides: z.array(z.string().max(200)).max(500).default([]),
  mode: z.enum(['edit', 'grid', 'present']),
  dirty: z.boolean(),
  version: z.string().max(200).nullable(),
}).strict()

export type SlideEditorContext = z.infer<typeof slideEditorContextSchema>

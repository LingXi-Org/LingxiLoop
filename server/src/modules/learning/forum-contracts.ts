import { z } from 'zod'

const id = z.string().trim().min(1).max(200)
export const learningLinkSchema = z.string().trim().url().max(2048)
  .refine(value => ['http:', 'https:'].includes(new URL(value).protocol), 'HTTP or HTTPS link required')
export const learningAttachmentSchema = z.object({
  key: z.string().min(1).max(1024), name: z.string().trim().min(1).max(255),
}).strict()
export const learningContentFields = {
  links: z.array(learningLinkSchema).max(20).default([]),
  attachments: z.array(learningAttachmentSchema).max(20).default([]),
}
export const forumTargetSchema = z.enum(['post', 'activity', 'source'])
export const forumQuerySchema = z.object({
  kind: z.enum(['all', 'assignment', 'resource', 'case']).default('all'),
  search: z.string().trim().max(200).default(''),
  tag: z.string().trim().max(40).default(''),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
}).strict()
export const forumPageSchema = z.object({ offset: z.coerce.number().int().min(0).max(100000).default(0) }).strict()
export const forumPostSchema = z.object({
  kind: z.enum(['share', 'resource', 'case']),
  title: z.string().trim().min(1).max(200), body: z.string().trim().max(20000).default(''),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  sourceId: id.optional(), ...learningContentFields,
}).strict()
export const forumCommentSchema = z.object({ body: z.string().trim().min(1).max(10000) }).strict()
export const forumFlagsSchema = z.object({ pinned: z.boolean().optional(), official: z.boolean().optional(), featured: z.boolean().optional() })
  .strict().refine(value => Object.keys(value).length > 0, 'a flag is required')

export type ForumTarget = z.infer<typeof forumTargetSchema>
export type LearningAttachment = z.infer<typeof learningAttachmentSchema>
export type ForumPostInput = z.infer<typeof forumPostSchema>
export type ForumQuery = Partial<z.infer<typeof forumQuerySchema>>
export type ForumFlags = z.infer<typeof forumFlagsSchema>

import { z } from 'zod'

export const avatarInputSchema = z.union([
  z.object({ seed: z.string().trim().min(1).max(128) }).strict(),
  z.object({ key: z.string().min(1).max(1024) }).strict(),
])
export type AvatarInput = z.infer<typeof avatarInputSchema>

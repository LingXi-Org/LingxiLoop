import { redis } from '../redis.js'

export type WorkTaskType = 'web-search' | 'web-read' | 'doc-create' | 'doc-edit' | 'calendar-create' | 'image-generate' | 'reply' | 'activity'
export interface WorklogEntry { agentId: string; taskType: WorkTaskType; subject: string; startedAt: number }

export function normalizeWorkSubject(subject: string): string { return subject.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80) }
function key(scopeKey: string): string { return `lingxiloop:work-claims:${scopeKey}` }
function field(taskType: WorkTaskType, subject: string): string { return `${taskType}::${normalizeWorkSubject(subject)}` }
function parse(raw: string | null): WorklogEntry | null {
  if (!raw) return null
  const value = JSON.parse(raw) as WorklogEntry
  if (typeof value.agentId !== 'string' || typeof value.startedAt !== 'number') {
    throw new Error('invalid work-claim state')
  }
  return value
}

export const workClaims = {
  async claimWork(args: { scopeKey: string; agentId: string; taskType: WorkTaskType; subject: string; ttlSec?: number }): Promise<{ accepted: true } | { accepted: false; existing: WorklogEntry }> {
    const ttl = args.ttlSec ?? 300
    const redisKey = key(args.scopeKey)
    const redisField = field(args.taskType, args.subject)
    const entry: WorklogEntry = { agentId: args.agentId, taskType: args.taskType, subject: args.subject, startedAt: Date.now() }
    if (await redis.hsetnx(redisKey, redisField, JSON.stringify(entry))) {
        await redis.expire(redisKey, ttl)
        return { accepted: true }
      }
      const existing = parse(await redis.hget(redisKey, redisField))
      if (!existing || Date.now() - existing.startedAt > ttl * 1000) {
        await redis.hdel(redisKey, redisField)
        if (await redis.hsetnx(redisKey, redisField, JSON.stringify(entry))) {
          await redis.expire(redisKey, ttl)
          return { accepted: true }
        }
      }
    return { accepted: false, existing: existing ?? { ...entry, agentId: '<unknown>' } }
  },
  async releaseWork(args: { scopeKey: string; agentId: string; taskType: WorkTaskType; subject: string }): Promise<void> {
    const redisKey = key(args.scopeKey)
    const redisField = field(args.taskType, args.subject)
    const existing = parse(await redis.hget(redisKey, redisField))
    if (existing?.agentId === args.agentId) await redis.hdel(redisKey, redisField)
  },
}

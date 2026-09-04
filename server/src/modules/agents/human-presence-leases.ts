import { randomUUID } from 'node:crypto'
import type IORedis from 'ioredis'

export type HumanPresenceStatus = 'avail' | 'resting'

export interface HumanPresenceClaim {
  userId: string
  status: HumanPresenceStatus
  generation: number
  token: string
}

export interface HumanPresenceLeaseStore {
  upsert(userId: string, connectionId: string): Promise<HumanPresenceClaim | null>
  remove(userId: string, connectionId: string): Promise<HumanPresenceClaim | null>
  sweepUser(userId: string): Promise<HumanPresenceClaim | null>
  scanTracked(cursor: string): Promise<{ cursor: string; userIds: string[] }>
  acknowledge(claim: HumanPresenceClaim): Promise<HumanPresenceClaim | null>
  release(claim: HumanPresenceClaim): Promise<void>
}

export const HUMAN_PRESENCE_LEASE_MS = 75_000
const TRANSITION_CLAIM_MS = 60_000
const TRACKED_USERS_KEY = 'lingxiloop:{human-presence}:tracked'

// One script owns lease expiry, global edge detection and transition claims.
// That keeps concurrent Web replicas from both publishing the same 0->1/1->0
// edge, while an unacknowledged claim remains recoverable after its deadline.
const PRESENCE_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local action = ARGV[2]

redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)

if action == 'upsert' then
  redis.call('ZADD', KEYS[1], now + tonumber(ARGV[4]), ARGV[3])
elseif action == 'remove' then
  redis.call('ZREM', KEYS[1], ARGV[3])
end

local claim_token = redis.call('HGET', KEYS[2], 'claim_token')
if action ~= 'ack' and action ~= 'release' and claim_token then
  local claim_until = tonumber(redis.call('HGET', KEYS[2], 'claim_until') or '0')
  if claim_until <= now then
    redis.call('HDEL', KEYS[2], 'claim_token', 'claim_generation', 'claim_status', 'claim_until')
    claim_token = false
  end
end

if action == 'ack'
  and claim_token == ARGV[6]
  and redis.call('HGET', KEYS[2], 'claim_generation') == ARGV[7]
  and redis.call('HGET', KEYS[2], 'claim_status') == ARGV[8] then
  redis.call('HSET', KEYS[2], 'applied', ARGV[8])
  redis.call('HDEL', KEYS[2], 'claim_token', 'claim_generation', 'claim_status', 'claim_until')
  claim_token = false
elseif action == 'release'
  and claim_token == ARGV[6]
  and redis.call('HGET', KEYS[2], 'claim_generation') == ARGV[7]
  and redis.call('HGET', KEYS[2], 'claim_status') == ARGV[8] then
  redis.call('HDEL', KEYS[2], 'claim_token', 'claim_generation', 'claim_status', 'claim_until')
  claim_token = false
end

local lease_count = redis.call('ZCARD', KEYS[1])
local desired = 'resting'
if lease_count > 0 then desired = 'avail' end
local applied = redis.call('HGET', KEYS[2], 'applied') or 'resting'
local previous_desired = redis.call('HGET', KEYS[2], 'desired') or applied
local generation = tonumber(redis.call('HGET', KEYS[2], 'generation') or '0')
if previous_desired ~= desired then generation = generation + 1 end
redis.call('HSET', KEYS[2], 'desired', desired, 'applied', applied, 'generation', generation)

local result = {}
claim_token = redis.call('HGET', KEYS[2], 'claim_token')
if action ~= 'release' and not claim_token and applied ~= desired then
  claim_token = ARGV[9]
  redis.call('HSET', KEYS[2],
    'claim_token', claim_token,
    'claim_generation', generation,
    'claim_status', desired,
    'claim_until', now + tonumber(ARGV[5]))
  result = { desired, tostring(generation), claim_token }
end

if lease_count > 0 or applied ~= desired or claim_token then
  redis.call('SADD', KEYS[3], ARGV[1])
else
  redis.call('DEL', KEYS[1], KEYS[2])
  redis.call('SREM', KEYS[3], ARGV[1])
end

return result
`

type PresenceRedis = Pick<IORedis, 'eval' | 'sscan'>
type PresenceAction = 'upsert' | 'remove' | 'sweep' | 'ack' | 'release'

export class RedisHumanPresenceLeaseStore implements HumanPresenceLeaseStore {
  constructor(
    private readonly redis: PresenceRedis,
    private readonly leaseMs = HUMAN_PRESENCE_LEASE_MS,
    private readonly claimMs = TRANSITION_CLAIM_MS,
  ) {}

  upsert(userId: string, connectionId: string): Promise<HumanPresenceClaim | null> {
    return this.run(userId, 'upsert', connectionId)
  }

  remove(userId: string, connectionId: string): Promise<HumanPresenceClaim | null> {
    return this.run(userId, 'remove', connectionId)
  }

  sweepUser(userId: string): Promise<HumanPresenceClaim | null> {
    return this.run(userId, 'sweep')
  }

  async scanTracked(cursor: string): Promise<{ cursor: string; userIds: string[] }> {
    const [next, userIds] = await this.redis.sscan(TRACKED_USERS_KEY, cursor, 'COUNT', 100)
    return { cursor: next, userIds }
  }

  acknowledge(claim: HumanPresenceClaim): Promise<HumanPresenceClaim | null> {
    return this.run(claim.userId, 'ack', '', claim)
  }

  async release(claim: HumanPresenceClaim): Promise<void> {
    await this.run(claim.userId, 'release', '', claim)
  }

  private async run(
    userId: string,
    action: PresenceAction,
    connectionId = '',
    claim?: HumanPresenceClaim,
  ): Promise<HumanPresenceClaim | null> {
    const suffix = encodeURIComponent(userId)
    const result = await this.redis.eval(
      PRESENCE_SCRIPT,
      3,
      `lingxiloop:{human-presence}:${suffix}:leases`,
      `lingxiloop:{human-presence}:${suffix}:state`,
      TRACKED_USERS_KEY,
      userId,
      action,
      connectionId,
      String(this.leaseMs),
      String(this.claimMs),
      claim?.token ?? '',
      String(claim?.generation ?? 0),
      claim?.status ?? '',
      randomUUID(),
    )
    if (!Array.isArray(result) || result.length === 0) return null
    const [status, generation, token] = result.map(String)
    if ((status !== 'avail' && status !== 'resting') || !token) {
      throw new Error('invalid human presence claim returned by Redis')
    }
    return { userId, status, generation: Number(generation), token }
  }
}

export class HumanPresenceLeaseCoordinator {
  constructor(
    private readonly store: HumanPresenceLeaseStore,
    private readonly apply: (userId: string, status: HumanPresenceStatus) => Promise<void>,
  ) {}

  async connect(userId: string, connectionId: string): Promise<void> {
    await this.applyClaim(await this.store.upsert(userId, connectionId))
  }

  async renew(userId: string, connectionId: string): Promise<void> {
    await this.applyClaim(await this.store.upsert(userId, connectionId))
  }

  async disconnect(userId: string, connectionId: string): Promise<void> {
    await this.applyClaim(await this.store.remove(userId, connectionId))
  }

  async sweep(): Promise<void> {
    // ponytail: scan the bounded online-user set; use a global expiry ZSET only if this becomes measurable.
    let cursor = '0'
    const failures: unknown[] = []
    do {
      const page = await this.store.scanTracked(cursor)
      cursor = page.cursor
      const results = await Promise.allSettled(page.userIds.map(async (userId) => {
        await this.applyClaim(await this.store.sweepUser(userId))
      }))
      failures.push(...results.filter((result) => result.status === 'rejected').map((result) => result.reason))
    } while (cursor !== '0')
    if (failures.length > 0) throw new AggregateError(failures, 'human presence sweep failed')
  }

  private async applyClaim(initial: HumanPresenceClaim | null): Promise<void> {
    let claim = initial
    while (claim) {
      try {
        await this.apply(claim.userId, claim.status)
      } catch (error) {
        try {
          await this.store.release(claim)
        } catch (releaseError) {
          throw new AggregateError([error, releaseError], 'human presence transition and claim release failed')
        }
        throw error
      }
      claim = await this.store.acknowledge(claim)
    }
  }
}

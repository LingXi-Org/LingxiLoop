import { createHmac } from 'node:crypto'

export interface ImSessionInfrastructure {
  userTokenSecret: string
  bootstrap(userId: string, token: string): Promise<unknown>
}

export class ImSessionApplication {
  constructor(private readonly infrastructure: ImSessionInfrastructure) {}

  bootstrap(userId: string): Promise<unknown> {
    const token = createHmac('sha256', this.infrastructure.userTokenSecret)
      .update(`wukong-user:${userId}`)
      .digest('base64url')
    return this.infrastructure.bootstrap(userId, token)
  }
}

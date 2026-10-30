import type { Queryable } from '../../db/queryable.js'
import type { ArtifactEvent } from '../../redis.js'
import type { agentView } from './comments.js'
import type { ArtifactExecution } from './execution.js'
import type { ArtifactRow } from './repository-types.js'

export interface ArtifactInfrastructure {
  db: Queryable
  execution: ArtifactExecution
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  withArtifactFence<T>(artifactId: string, work: (db: Queryable) => Promise<T>): Promise<T>
  missingChannelMessageIds(input: {
    companyId: string
    actorId: string
    channelId: string
    messageIds: string[]
  }): Promise<string[]>
  publishEvent(event: ArtifactEvent): Promise<void>
  /** A comment the person sent to the agent; upstream's `--agent-hook`. */
  deliverComment(input: { companyId: string; artifact: ArtifactRow; authorId: string; view: ReturnType<typeof agentView> }): Promise<void>
}

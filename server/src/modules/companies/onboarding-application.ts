import type { Queryable } from '../../db/queryable.js'
import { installStarterAgents } from './onboarding-repository.js'

export interface CompanyOnboardingInfrastructure {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  invalidatePersonas(): void
  reconcileChannels(): Promise<{ channels: number; failures: number }>
}

export class CompanyOnboardingApplication {
  constructor(private readonly infrastructure: CompanyOnboardingInfrastructure) {}

  install(db: Queryable, companyId: string): Promise<boolean> {
    return installStarterAgents(db, companyId)
  }

  async finalize(installed: boolean): Promise<void> {
    if (installed) this.infrastructure.invalidatePersonas()
    const reconciliation = await this.infrastructure.reconcileChannels()
    if (reconciliation.failures > 0) {
      throw new Error(
        `WuKongIM learning channel reconciliation failed (${reconciliation.failures}/${reconciliation.channels})`,
      )
    }
  }

  async onboard(companyId: string): Promise<void> {
    const installed = await this.infrastructure.transaction(
      (db) => installStarterAgents(db, companyId),
    )
    await this.finalize(installed)
  }
}

import type { Queryable } from '../../db/queryable.js'
import { companyApplication } from './facade.js'
import { companyOnboardingApplication } from './onboarding-facade.js'

export { STARTER_ROOMS, STARTER_TEAM } from './onboarding-repository.js'

export function installCompanyStarterWorkspace(db: Queryable, companyId: string): Promise<boolean> {
  return companyOnboardingApplication.install(db, companyId)
}

export function finalizeCompanyStarterWorkspace(installed: boolean): Promise<void> {
  return companyOnboardingApplication.finalize(installed)
}

export function onboardCompanyStarterWorkspace(companyId: string): Promise<void> {
  return companyOnboardingApplication.onboard(companyId)
}

export function provisionPersonalCompany(
  db: Queryable,
  input: { id: string; name: string; slug: string; userId: string; projectId: string },
): Promise<boolean> {
  return companyApplication.provisionPersonalCompany(db, input)
}

import { companyOnboardingApplication } from './onboarding-facade.js'
import type { Queryable } from '../../db/queryable.js'
import type { CompanyLifecycleCommand, CompanyStatus, CompanyType } from '../../domain/public.js'
export { provisionPersonalWorkspace } from './personal-workspace.js'
export type { PersonalWorkspaceProvisioningResult } from './personal-workspace.js'

export { STARTER_ROOMS, STARTER_TEAM } from './onboarding-repository.js'

export function onboardCompanyStarterWorkspace(companyId: string): Promise<void> {
  return companyOnboardingApplication.onboard(companyId)
}

export async function applySystemCompanyLifecycleInTransaction(db: Queryable, input: {
  companyId: string
  type: CompanyType
  status: CompanyStatus
  command: CompanyLifecycleCommand
}) {
  const { companyLifecycleApplication } = await import('./facade.js')
  return companyLifecycleApplication.executeSystemInTransaction(db, input)
}

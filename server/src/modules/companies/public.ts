import { companyOnboardingApplication } from './onboarding-facade.js'
export { provisionPersonalWorkspace } from './personal-workspace.js'
export type { PersonalWorkspaceProvisioningResult } from './personal-workspace.js'

export { STARTER_ROOMS, STARTER_TEAM } from './onboarding-repository.js'

export function onboardCompanyStarterWorkspace(companyId: string): Promise<void> {
  return companyOnboardingApplication.onboard(companyId)
}

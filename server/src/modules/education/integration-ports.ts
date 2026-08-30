import type { LearningActivityImportInput } from '../learning/contracts.js'

export type ExternalIntegrationConfigurationStatus = 'NOT_CONFIGURED' | 'CONFIGURED' | 'ERROR'

export interface ExternalIntegrationProbe<Capability extends string> {
  configurationStatus: ExternalIntegrationConfigurationStatus
  capabilities: readonly Capability[]
  checkedAt: string
}

export type LmsConnectorCapability = 'LEARNING_ACTIVITY_IMPORT'

/** Future LMS adapters implement this boundary and return the canonical Activity Import contract. */
export interface LmsConnectorPort {
  probe(): Promise<ExternalIntegrationProbe<LmsConnectorCapability>>
  readActivityImport(input: {
    companyId: string
    projectId: string
    externalCourseId: string
  }): Promise<LearningActivityImportInput>
}

export type EducationIdentityBrokerCapability = 'EXISTING_USER_MAPPING'

/** Future Education SSO brokers resolve an opaque subject to an already-existing LingxiIdentity user. */
export interface EducationIdentityBrokerPort {
  probe(): Promise<ExternalIntegrationProbe<EducationIdentityBrokerCapability>>
  mapExistingUser(input: {
    companyId: string
    issuer: string
    subject: string
  }): Promise<{ userId: string } | null>
}

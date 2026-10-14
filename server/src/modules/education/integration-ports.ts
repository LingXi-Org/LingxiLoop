
export type ExternalIntegrationConfigurationStatus = 'NOT_CONFIGURED' | 'CONFIGURED' | 'ERROR'

export interface ExternalIntegrationProbe<Capability extends string> {
  configurationStatus: ExternalIntegrationConfigurationStatus
  capabilities: readonly Capability[]
  checkedAt: string
}

export type EducationIdentityBrokerCapability = 'EXISTING_USER_MAPPING'

/** Future Education SSO brokers resolve an opaque subject to an already-existing business user. */
export interface EducationIdentityBrokerPort {
  probe(): Promise<ExternalIntegrationProbe<EducationIdentityBrokerCapability>>
  mapExistingUser(input: {
    companyId: string
    issuer: string
    subject: string
  }): Promise<{ userId: string } | null>
}

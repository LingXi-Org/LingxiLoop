import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { env } from '../../env.js'
import { mirrorTrustedIdentityAvatar } from './avatar-facade.js'
import {
  onboardCompanyStarterWorkspace,
  provisionPersonalWorkspace,
} from '../companies/public.js'
import {
  consumeIdentityState,
  createIdentityState,
  fetchIdentityProfile,
  identityAuthorizeUrl,
  identityProviderEnabled,
  identityReturnUrlAllowed,
} from './oidc-infrastructure.js'
import {
  identityDoneUrl,
  identityErrorUrl,
  identitySuspendedUrl,
} from './oauth-urls.js'
import { IdentityApplication } from './application.js'
import { OAuthApplication, oauthIds } from './oauth-application.js'
import {
  audit,
  auditInTransaction,
  createLoginSession,
  createWsTicket,
  deleteSession,
} from './session-facade.js'

const oauthApplication = new OAuthApplication({
  transaction: (work) => withTransaction(pool, work),
  fetchProfile: fetchIdentityProfile,
  mirrorAvatar: mirrorTrustedIdentityAvatar,
  provisionWorkspace: provisionPersonalWorkspace,
  finalizeWorkspace: async (companyId) => {
    await onboardCompanyStarterWorkspace(companyId).catch((error: unknown) => {
      console.warn(`[identity] Personal Workspace onboarding deferred: ${error instanceof Error ? error.message : String(error)}`)
    })
  },
  createLoginSession,
  audit,
  defaultDoneUrl: env.AUTH_DONE_URL,
  doneUrl: identityDoneUrl,
  suspendedUrl: identitySuspendedUrl,
  ...oauthIds,
})

export const identityApplication = new IdentityApplication(pool, {
  providerEnabled: identityProviderEnabled,
  returnUrlAllowed: identityReturnUrlAllowed,
  createState: createIdentityState,
  consumeState: consumeIdentityState,
  authorizeUrl: identityAuthorizeUrl,
  handleCallback: (args) => oauthApplication.handleCallback(args),
  errorUrl: (base, error) => identityErrorUrl(base, env.AUTH_DONE_URL, error),
  audit,
  auditInTransaction,
  deleteSession,
  createWsTicket,
  transaction: (work) => withTransaction(pool, work),
  invitationEmailEnabled: Boolean(env.EMAIL_DOMAIN),
})

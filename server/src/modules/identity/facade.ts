import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { env } from '../../env.js'
import { mirrorIdentityAvatar } from '../../avatar.js'
import {
  enqueueWaitlist,
  isAllowlistedAdmin,
  isWaitlistEnabled,
} from '../admin/facade.js'
import { provisionPersonalCompany } from '../companies/public.js'
import { finalizeStarterAgents } from '../../onboardCompany.js'
import { storage } from '../../storage.js'
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
  identityWaitlistUrl,
} from './oauth-urls.js'
import { IdentityApplication } from './application.js'
import { OAuthApplication, oauthIds } from './oauth-application.js'
import {
  audit,
  createLoginSession,
  createWsTicket,
  deleteSession,
} from './session-facade.js'

const oauthApplication = new OAuthApplication({
  transaction: (work) => withTransaction(pool, work),
  fetchProfile: fetchIdentityProfile,
  waitlistEnabled: isWaitlistEnabled,
  isAllowlistedAdmin,
  enqueueWaitlist,
  mirrorAvatar: (userId, providerUrl) => mirrorIdentityAvatar(storage, userId, providerUrl),
  provisionCompany: provisionPersonalCompany,
  finalizeCompany: finalizeStarterAgents,
  createLoginSession,
  audit,
  defaultDoneUrl: env.AUTH_DONE_URL,
  doneUrl: identityDoneUrl,
  waitlistUrl: identityWaitlistUrl,
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
  deleteSession,
  createWsTicket,
  transaction: (work) => withTransaction(pool, work),
  invitationEmailEnabled: Boolean(env.EMAIL_DOMAIN),
})

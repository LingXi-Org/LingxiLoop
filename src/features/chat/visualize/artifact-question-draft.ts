import type { ComposerDraftScope } from '../drafts'
import type { GenUiCardTarget } from './zcode/gen-ui/contract'

export function artifactQuestionScope(target: GenUiCardTarget, activeCompanyId: string | null, userId: string | null): ComposerDraftScope {
  return { kind: 'artifact-question', companyId: target.workspaceIdentity === activeCompanyId ? activeCompanyId : null,
    userId, projectId: target.workspacePath, conversationId: target.sessionId,
    threadRootId: JSON.stringify([target.sourceMessageId ?? null, target.path, target.instanceKey]) }
}

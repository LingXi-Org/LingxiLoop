import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const conversationRouter = source('../modules/conversations/router.ts')
const conversationApplication = source('../modules/conversations/application.ts')
const conversationRepository = source('../modules/conversations/repository.ts')
const contextRouter = source('../modules/context-threads/router.ts')
const contextApplication = source('../modules/context-threads/application.ts')
const contextContracts = source('../modules/context-threads/contracts.ts')
const frontendApi = source('../../../src/features/conversations/api.ts')
const contextApi = source('../../../src/features/context-threads/api.ts')
const commandPalette = source('../../../src/components/CommandPalette.tsx')
const participantProfile = source('../../../src/im/Profile.tsx')
const chatPane = source('../../../src/desktop/ChatPane.tsx')

test('M9 removes generic human DM, group creation, and arbitrary participant search entrypoints', () => {
  assert.doesNotMatch(conversationRouter, /post\(['"]\/conversations(?:\/direct)?['"]/)
  assert.doesNotMatch(conversationApplication, /\b(?:openDirect|createGroup)\b/)
  assert.doesNotMatch(frontendApi, /\b(?:openDirect|createGroup)\b|\/conversations\/direct/)
  assert.doesNotMatch(commandPalette, /new-group|新建群聊/)
  assert.doesNotMatch(chatPane, /新建群聊/)
  assert.doesNotMatch(participantProfile, /openDirect|createGroup/)
  assert.doesNotMatch(conversationRepository, /participantsPromise/)
})

test('M9 exposes only Agent learning and controlled Teacher ContextThread commands', () => {
  assert.match(contextRouter, /\/projects\/:projectId\/context-threads\/learning/)
  assert.match(contextRouter, /\/projects\/:projectId\/context-threads\/teacher/)
  assert.match(contextApplication, /contextType: 'LEARNING'/)
  assert.match(contextContracts, /'TEACHER_TAKEOVER'/)
  assert.match(contextContracts, /'INTERVENTION'/)
  assert.match(contextApplication, /isActiveProjectStudent/)
  assert.match(contextApplication, /learningCaseBelongsToStudent/)
  assert.match(contextApi, /openLearning/)
  assert.match(contextApi, /openTeacher/)
})

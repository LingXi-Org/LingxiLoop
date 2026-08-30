import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8')

test('agent identity has one Bloub rendering path and no portrait generation surface', async () => {
  const [router, cli, api, editor, avatar, notification, runtime, events, participantState, redis, message, chatStyles, schema, guard] = await Promise.all([
    read('../../server/src/modules/agents/router.ts'),
    read('../../server/src/agents/cli.ts'),
    read('../features/agents/api.ts'),
    read('../features/agents/components/AgentEditor.tsx'),
    read('../components/Avatar.tsx'),
    read('../components/NotificationWindow.tsx'),
    read('./runtime.ts'),
    read('../api/contracts.ts'),
    read('../features/agents/state.ts'),
    read('../../server/src/redis.ts'),
    read('../components/messages/LingxiImMessage.tsx'),
    read('../styles/chat.css'),
    read('../../server/src/db/schema.sql'),
    read('../../scripts/guard-architecture.mjs'),
  ])
  const production = [router, cli, api, editor].join('\n')

  assert.doesNotMatch(production, /avatar\/generate|generateAndPersistAvatar|agent-gender|agent-avatar|visualSignatureFor|cmdAvatar\b|AVATAR_PALETTE|defaultAvatarBg/)
  assert.match(editor, /<Field label="Bloub 头像"/)
  assert.match(editor, /<Avatar p=\{previewParticipant\}/)
  assert.match(avatar, /p\.kind === 'agent' \? null : resolveUserAvatarUrl\(p\.avatarUrl\)/)
  assert.match(notification, /toast\.authorKind === 'agent'/)
  assert.match(notification, /<BloubAvatar/)
  assert.doesNotMatch(`${notification}\n${runtime}`, /authorAvatarBg|stable color block/)
  assert.doesNotMatch(`${events}\n${participantState}\n${redis}`, /participants\.avatar/)
  assert.match(message, /`bloub-activity-\$\{avatarActivity\}`/)
  assert.doesNotMatch(`${message}\n${chatStyles}`, /agent-avatar/)
  assert.match(schema, /participants_agent_bloub_only CHECK/)
  assert.match(guard, /agent portraits are retired; agents use Bloub/)
  assert.match(guard, /authorAvatarBg/)
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8')

test('agent identity has one Bloub rendering path and no portrait generation surface', async () => {
  const [router, cli, api, editor, avatar, schema, guard] = await Promise.all([
    read('../../server/src/modules/agents/router.ts'),
    read('../../server/src/agents/cli.ts'),
    read('../api/agents.ts'),
    read('../components/AgentEditor.tsx'),
    read('../components/Avatar.tsx'),
    read('../../server/src/db/schema.sql'),
    read('../../scripts/guard-architecture.mjs'),
  ])
  const production = [router, cli, api, editor].join('\n')

  assert.doesNotMatch(production, /avatar\/generate|generateAndPersistAvatar|agent-gender|agent-avatar|visualSignatureFor|cmdAvatar\b|AVATAR_PALETTE|defaultAvatarBg/)
  assert.match(editor, /<Field label="Bloub 头像"/)
  assert.match(editor, /<Avatar p=\{previewParticipant\}/)
  assert.match(avatar, /p\.kind === 'agent' \? null : p\.avatarUrl/)
  assert.match(schema, /participants_agent_bloub_only CHECK/)
  assert.match(guard, /agent portraits are retired; agents use Bloub/)
})

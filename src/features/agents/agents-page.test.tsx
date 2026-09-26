import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Participant } from '@/types'

test('Agent page renders the supplied authorized roster, personal images and preview cards opening profile dialogs without management controls', async () => {
  let loaded = true
  let error: string | null = null
  let imageFailed = false
  const names = ['司南', '明理', '砺思', '溯源', '寻知', '成器']
  const keys = ['nova', 'sage', 'milo', 'trace', 'scout', 'forge']
  const byId: Record<string, Participant> = Object.fromEntries(names.map((name, index) => [keys[index], {
    id: keys[index], presetKey: keys[index], kind: 'agent', name, initial: name[0], avatarBg: 'transparent', status: 'avail',
    role: '学习辅导', bio: '基于已有证据提供指导', capabilities: ['knowledge'],
    ...(index === 0 ? { personalAvatar: { url: 'https://assets.test.invalid/personal.png' } } : {}),
  }]))
  mock.module('@/features/agents/state', { namedExports: { useParticipants: () => ({ byId, loaded, error, load: async () => {} }) } })
  mock.module('@/features/agents/api', { namedExports: { agentsApi: {} } })
  mock.module('@/features/platform/api', { namedExports: { uploadsApi: {} } })
  mock.module('@/features/knowledge/workspace', { namedExports: { useWorkspace: { getState: () => ({ selectedId: 'project' }) } } })
  mock.module('@/stores/auth', { namedExports: { useAuth: (selector: (state: { user: null }) => unknown) => selector({ user: null }) } })
  mock.module('@/lib/avatarCache', { namedExports: {
    AVATAR_IMG_LOADING: 'lazy', useCachedAvatarSrc: (_id: string, url: string | null) => url,
    useAvatarImg: (url: string | null) => ({ showImg: Boolean(url) && !imageFailed, imgKey: url ?? '', onError: () => {} }),
  } })
  try {
    const { AgentsPage } = await import('./components/AgentsPage')
    const desktop = renderToStaticMarkup(<AgentsPage />)
    for (const name of names) assert.ok(desktop.includes(name))
    assert.match(desktop, /6 位/)
    assert.match(desktop, /https:\/\/assets.test.invalid\/personal.png/)
    assert.doesNotMatch(desktop, /可用能力|自定义头像仅自己可见|更换头像/)
    assert.equal((desktop.match(/aria-haspopup="dialog"/g) ?? []).length, 6)
    for (const name of names) assert.ok(desktop.includes(`查看${name}的资料`))
    imageFailed = true
    const { AvatarMini } = await import('@/components/Avatar')
    const fallback = renderToStaticMarkup(<AvatarMini p={byId.nova} />)
    assert.doesNotMatch(fallback, /personal\.png/)
    assert.match(fallback, /<svg/)
    imageFailed = false
    assert.doesNotMatch(desktop, /行为提示词|新建智能|删除智能|Pulse/)
    byId.pulse = { id: 'pulse', kind: 'agent', name: '望远', initial: '望', avatarBg: 'transparent', status: 'thinking', managed: true }
    const teacher = renderToStaticMarkup(<AgentsPage />)
    assert.match(teacher, /7 位/)
    assert.match(teacher, /望远/)
    assert.doesNotMatch(teacher, /Pulse/)
    const compact = renderToStaticMarkup(<AgentsPage />)
    assert.match(compact, /智能体列表/)
    assert.match(compact, /aria-label="查看司南的资料"/)
    loaded = false
    assert.match(renderToStaticMarkup(<AgentsPage />), /正在加载智能体/)
    loaded = true; error = '加载失败'
    assert.match(renderToStaticMarkup(<AgentsPage />), /role="alert"/)
    assert.match(renderToStaticMarkup(<AgentsPage />), /重试/)
  } finally { mock.restoreAll() }
})

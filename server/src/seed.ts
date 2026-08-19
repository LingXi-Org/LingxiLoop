import { pool } from './db/pool.js'

/**
 * Ensure the placeholder 'yetone' user row exists so FK references from
 * seeded participants / conversations stay valid on a fresh DB. The row
 * has NO password and NO linked OAuth identity, so no one can log in as
 * it — it's purely a referential anchor for the demo data. On first
 * OAuth login, a separate `u-<uuid>` user is created with the real email.
 */
async function ensureDevUser(): Promise<void> {
  const DEV_USER_ID = 'yetone'
  const DEV_EMAIL = 'yetone@dev.local'
  const { rows } = await pool.query(`SELECT 1 FROM users WHERE id = $1 LIMIT 1`, [DEV_USER_ID])
  if (rows[0]) return
  await pool.query(
    `INSERT INTO users (id, email, display_name, password_hash) VALUES ($1, $2, $3, NULL)
     ON CONFLICT (id) DO NOTHING`,
    [DEV_USER_ID, DEV_EMAIL, 'Yetone'],
  )
  await pool.query(
    `INSERT INTO company_members (company_id, user_id, role) VALUES ('personal', $1, 'owner')
     ON CONFLICT DO NOTHING`,
    [DEV_USER_ID],
  )
  console.log(`[seed] placeholder 'yetone' user created (FK anchor for demo data; no login)`)
}

interface SeedParticipant {
  id: string
  kind: 'agent' | 'human'
  name: string
  role?: string
  initial: string
  avatarBg: string
  status: string
  bio?: string
  tools?: string[]
}

const SEED_PARTICIPANTS: SeedParticipant[] = [
  { id: 'yetone', kind: 'human', name: 'Yetone', initial: 'Y', avatarBg: 'linear-gradient(135deg, #FF7A6B, #F4B740)', status: 'avail' },
]

interface SeedProject {
  id: string
  name: string
  description: string
  color?: string
}

const SEED_PROJECTS: SeedProject[] = []

interface SeedConvo {
  id: string
  kind: string
  title: string
  subtitle?: string
  members: string[]
  pinned?: boolean
  tag?: string
  projectId?: string
  pulledBy?: { agentId: string; at: string; reason: string }
}

/**
 * Empty conversation containers — no canned messages.
 * Every message rendered is now produced live by the agent loop or the user.
 * The versioned learning-team onboarding runs immediately after this dev seed
 * and owns all starter agents, DMs, and built-in rooms.
 */
const SEED_CONVOS: SeedConvo[] = []

interface SeedMsg {
  id: string
  conversationId: string
  authorId: string
  kind: string
  body: string
  sequence: number
  reactions?: unknown
  tool?: unknown
  attachment?: unknown
}

/** No canned messages — every message that ever appears is produced live. */
const SEED_MESSAGES: SeedMsg[] = []

export async function seedIfEmpty(): Promise<void> {
  // Always make sure the dev account exists so login works on a fresh DB.
  // Email: yetone@dev.local  Password: cumora-dev (DEV ONLY).
  await ensureDevUser()

  const { rows } = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM conversations')
  const count = Number(rows[0]?.count ?? '0')
  if (count > 0) {
    console.log(`[seed] skipping — ${count} conversations already in DB`)
    return
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const p of SEED_PARTICIPANTS) {
      await client.query(
        `INSERT INTO participants (id, kind, name, role, initial, avatar_bg, status, bio, tools, company_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,'personal')
         ON CONFLICT (id, company_id) DO NOTHING`,
        [p.id, p.kind, p.name, p.role ?? null, p.initial, p.avatarBg, p.status, p.bio ?? null, JSON.stringify(p.tools ?? null)],
      )
    }

    for (const p of SEED_PROJECTS) {
      await client.query(
        `INSERT INTO projects (id, company_id, name, description, color)
         VALUES ($1, 'personal', $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [p.id, p.name, p.description, p.color ?? null],
      )
    }

    for (const c of SEED_CONVOS) {
      await client.query(
        `INSERT INTO conversations (id, kind, title, subtitle, members, pinned, tag, pulled_by, project_id)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,$9)`,
        [c.id, c.kind, c.title, c.subtitle ?? null, JSON.stringify(c.members), c.pinned ?? false, c.tag ?? null, c.pulledBy ? JSON.stringify(c.pulledBy) : null, c.projectId ?? null],
      )
      const maxSeq = SEED_MESSAGES.filter((m) => m.conversationId === c.id).reduce((a, b) => Math.max(a, b.sequence), 0)
      await client.query(
        `INSERT INTO conversation_counters (conversation_id, next_sequence) VALUES ($1, $2)`,
        [c.id, maxSeq + 1],
      )
    }

    for (const m of SEED_MESSAGES) {
      await client.query(
        `INSERT INTO messages (id, conversation_id, author_id, kind, body, sequence, reactions, tool, attachment)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb)`,
        [m.id, m.conversationId, m.authorId, m.kind, m.body, m.sequence,
          m.reactions ? JSON.stringify(m.reactions) : null,
          m.tool ? JSON.stringify(m.tool) : null,
          m.attachment ? JSON.stringify(m.attachment) : null,
        ],
      )
    }

    await client.query('COMMIT')
    console.log(`[seed] inserted ${SEED_PARTICIPANTS.length} participants, ${SEED_CONVOS.length} conversations, ${SEED_MESSAGES.length} messages`)
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

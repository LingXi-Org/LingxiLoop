import type { Queryable } from '../../db/queryable.js'

export interface ParticipantAddressRow {
  participantId: string
  email: string | null
  companySlug: string
  displayName: string
  kind: string
}

export async function findParticipantAddress(
  db: Queryable,
  companyId: string,
  participantId: string,
): Promise<ParticipantAddressRow | null> {
  const { rows } = await db.query<{
    participant_id: string
    email: string | null
    company_slug: string
    display_name: string
    kind: string
  }>(
    `SELECT participant.id AS participant_id,
            participant.email,
            participant.name AS display_name,
            participant.kind,
            company.slug AS company_slug
       FROM participants participant
       JOIN companies company ON company.id = participant.company_id
      WHERE participant.id = $1
        AND participant.company_id = $2
        AND participant.departed_at IS NULL
      LIMIT 1`,
    [participantId, companyId],
  )
  const row = rows[0]
  return row ? {
    participantId: row.participant_id,
    email: row.email,
    companySlug: row.company_slug,
    displayName: row.display_name,
    kind: row.kind,
  } : null
}

export async function assignParticipantAddress(
  db: Queryable,
  companyId: string,
  participantId: string,
  email: string,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE participants
        SET email = $3
      WHERE id = $1 AND company_id = $2 AND departed_at IS NULL AND email IS NULL`,
    [participantId, companyId, email],
  )
  return (result.rowCount ?? 0) > 0
}

export async function listAgentsMissingAddress(
  db: Queryable,
  companyId: string,
): Promise<Array<{ id: string; companySlug: string }>> {
  const { rows } = await db.query<{ id: string; company_slug: string }>(
    `SELECT participant.id, company.slug AS company_slug
       FROM participants participant
       JOIN companies company ON company.id = participant.company_id
      WHERE participant.company_id = $1
        AND participant.kind = 'agent'
        AND participant.departed_at IS NULL
        AND participant.email IS NULL`,
    [companyId],
  )
  return rows.map((row) => ({ id: row.id, companySlug: row.company_slug }))
}

export async function findParticipantByEmail(
  db: Queryable,
  companyId: string,
  email: string,
): Promise<{ id: string; name: string; kind: string } | null> {
  const { rows } = await db.query<{ id: string; name: string; kind: string }>(
    `SELECT id, name, kind
       FROM participants
      WHERE company_id = $1 AND LOWER(email) = $2 AND departed_at IS NULL
      LIMIT 1`,
    [companyId, email],
  )
  return rows[0] ?? null
}

export async function findCompanyUserByAuthEmail(
  db: Queryable,
  companyId: string,
  email: string,
): Promise<{ id: string; displayName: string } | null> {
  const { rows } = await db.query<{ id: string; display_name: string }>(
    `SELECT app_user.id, app_user.display_name
       FROM users app_user
       JOIN company_members member ON member.user_id = app_user.id
      WHERE LOWER(app_user.email) = $1 AND member.company_id = $2
      LIMIT 1`,
    [email, companyId],
  )
  return rows[0] ? { id: rows[0].id, displayName: rows[0].display_name } : null
}

export async function findCompanyUserEmail(
  db: Queryable,
  companyId: string,
  userId: string,
): Promise<string | null> {
  const { rows } = await db.query<{ email: string | null }>(
    `SELECT app_user.email
       FROM users app_user
       JOIN company_members member
         ON member.user_id = app_user.id AND member.company_id = $1
      WHERE app_user.id = $2
      LIMIT 1`,
    [companyId, userId],
  )
  return rows[0]?.email ?? null
}

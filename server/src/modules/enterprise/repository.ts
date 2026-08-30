import type { Queryable } from '../../db/queryable.js'
import type { GovernancePolicyKind } from './contracts.js'

interface OrganizationUnitRow {
  id: string
  company_id: string
  parent_unit_id: string | null
  name: string
  status: 'ACTIVE' | 'ARCHIVED'
  version: number
  created_at: string
  updated_at: string
}

interface GovernancePolicyRow {
  id: string
  company_id: string
  kind: GovernancePolicyKind
  policy_version: string
  config: Record<string, unknown>
  revision: number
  created_at: string
  updated_at: string
}

function mapUnit(row: OrganizationUnitRow) {
  return {
    id: row.id,
    companyId: row.company_id,
    parentUnitId: row.parent_unit_id,
    name: row.name,
    status: row.status,
    version: Number(row.version),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

function mapPolicy(row: GovernancePolicyRow) {
  return {
    id: row.id,
    companyId: row.company_id,
    kind: row.kind,
    policyVersion: row.policy_version,
    config: row.config,
    revision: Number(row.revision),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

export async function listOrganizationUnits(db: Queryable, companyId: string) {
  const { rows } = await db.query<OrganizationUnitRow>(
    `SELECT id,company_id,parent_unit_id,name,status,version,created_at,updated_at
       FROM organization_units WHERE company_id=$1
       ORDER BY parent_unit_id NULLS FIRST,name,id`,
    [companyId],
  )
  return rows.map(mapUnit)
}

export async function findOrganizationUnit(db: Queryable, companyId: string, id: string) {
  const { rows } = await db.query<OrganizationUnitRow>(
    `SELECT id,company_id,parent_unit_id,name,status,version,created_at,updated_at
       FROM organization_units WHERE company_id=$1 AND id=$2`,
    [companyId,id],
  )
  return rows[0] ? mapUnit(rows[0]) : null
}

export async function insertOrganizationUnit(db: Queryable, input: {
  id: string; companyId: string; parentUnitId: string | null; name: string; actorUserId: string
}) {
  const { rows } = await db.query<OrganizationUnitRow>(
    `INSERT INTO organization_units(id,company_id,parent_unit_id,name,created_by,updated_by)
     SELECT $1,$2,$3,$4,$5,$5 FROM companies company
      WHERE company.id=$2 AND company.type='EDUCATION'
        AND ($3::text IS NULL OR EXISTS(
          SELECT 1 FROM organization_units parent
           WHERE parent.company_id=$2 AND parent.id=$3 AND parent.status='ACTIVE'
        ))
     ON CONFLICT (id) DO NOTHING
     RETURNING id,company_id,parent_unit_id,name,status,version,created_at,updated_at`,
    [input.id,input.companyId,input.parentUnitId,input.name,input.actorUserId],
  )
  return rows[0] ? mapUnit(rows[0]) : null
}

export async function listGovernancePolicies(db: Queryable, companyId: string) {
  const { rows } = await db.query<GovernancePolicyRow>(
    `SELECT id,company_id,kind,policy_version,config,revision,created_at,updated_at
       FROM governance_policies WHERE company_id=$1 ORDER BY kind`,
    [companyId],
  )
  return rows.map(mapPolicy)
}

export async function upsertGovernancePolicy(db: Queryable, input: {
  id: string; companyId: string; kind: GovernancePolicyKind; policyVersion: string
  config: Record<string, unknown>; expectedRevision: number; actorUserId: string
}) {
  const { rows } = await db.query<GovernancePolicyRow>(
    `INSERT INTO governance_policies
       (id,company_id,kind,policy_version,config,created_by,updated_by)
     SELECT $1,$2,$3,$4,$5::jsonb,$6,$6 FROM companies company
      WHERE company.id=$2 AND company.type='EDUCATION'
        AND ($7::bigint=0 OR EXISTS(
          SELECT 1 FROM governance_policies policy
           WHERE policy.company_id=$2 AND policy.kind=$3
        ))
     ON CONFLICT (company_id,kind) DO UPDATE SET
       policy_version=EXCLUDED.policy_version,
       config=EXCLUDED.config,
       revision=governance_policies.revision+1,
       updated_by=EXCLUDED.updated_by,
       updated_at=NOW()
     WHERE governance_policies.revision=$7
     RETURNING id,company_id,kind,policy_version,config,revision,created_at,updated_at`,
    [input.id,input.companyId,input.kind,input.policyVersion,JSON.stringify(input.config),
      input.actorUserId,input.expectedRevision],
  )
  return rows[0] ? mapPolicy(rows[0]) : null
}

export async function findGovernancePolicyReplay(db: Queryable, input: {
  companyId: string; kind: GovernancePolicyKind; policyVersion: string
  config: Record<string, unknown>; expectedRevision: number
}) {
  const { rows } = await db.query<GovernancePolicyRow>(
    `SELECT id,company_id,kind,policy_version,config,revision,created_at,updated_at
       FROM governance_policies
      WHERE company_id=$1 AND kind=$2 AND policy_version=$3 AND config=$4::jsonb
        AND revision=$5::bigint+1`,
    [input.companyId,input.kind,input.policyVersion,JSON.stringify(input.config),input.expectedRevision],
  )
  return rows[0] ? mapPolicy(rows[0]) : null
}

INSERT INTO participants (
  id, kind, name, role, initial, avatar_bg, avatar_url, status, company_id
)
SELECT
  owner.id,
  'human',
  owner.display_name,
  NULL,
  upper(left(owner.display_name, 1)),
  '#FF8870',
  owner.avatar_url,
  'avail',
  company.id
FROM companies company
JOIN users owner
  ON owner.id = company.personal_owner_user_id
 AND owner.deleted_at IS NULL
JOIN company_memberships membership
  ON membership.company_id = company.id
 AND membership.user_id = owner.id
 AND membership.role = 'OWNER'
 AND membership.status = 'ACTIVE'
WHERE company.type = 'PERSONAL'
ON CONFLICT (id, company_id) DO UPDATE SET
  name = EXCLUDED.name,
  initial = EXCLUDED.initial,
  avatar_url = EXCLUDED.avatar_url,
  status = 'avail',
  departed_at = NULL;

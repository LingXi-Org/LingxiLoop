// Loopback-only owning-case fixture. Product router, permissions, validation and
// PostgreSQL writes are real; session identity and object storage are test ports.
import { writeFile } from 'node:fs/promises'
import express from 'express'
Object.assign(process.env, {
  NODE_ENV: 'test', LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:5198', DATABASE_URL: 'postgres://postgres:case604-local-test-only@127.0.0.1:55464/issue604_cases_test',
  REDIS_URL: 'redis://127.0.0.1:55465', OPENAI_API_KEY: 'fixture-not-a-model-key',
  OPENAI_BASE_URL: 'https://model.test.invalid/v1', WUKONG_USER_TOKEN_SECRET: 'fixture-not-a-production-secret',
})
const { pool } = await import('../../../server/src/db/pool')
const { ensureEducationPlan } = await import('../../../server/src/modules/entitlements/public')
const { installStorageProvider } = await import('../../../server/src/storage')
const objects = new Map<string, Buffer>()
installStorageProvider({ mode: 'r2', put: async (key, bytes) => { objects.set(key, Buffer.from(bytes)); return key }, publicUrl: async key => `https://storage.test.invalid/${key}`, presignPut: async () => { throw new Error('not exercised') } })
const company = 'case604-school', owner = 'case604-owner'
await ensureEducationPlan(pool)
await pool.query("INSERT INTO users(id,email,display_name,email_verified_at) VALUES($1,'case604@test.invalid','案例测试教师',NOW()) ON CONFLICT DO NOTHING", [owner])
await pool.query("INSERT INTO companies(id,name,slug,type,plan_id) VALUES($1,'案例测试学校',$1,'EDUCATION','plan-education') ON CONFLICT DO NOTHING", [company])
await pool.query("INSERT INTO company_memberships(company_id,user_id,role,is_admin) VALUES($1,$2,'TEACHER',TRUE) ON CONFLICT DO NOTHING", [company, owner])
await pool.query(`WITH period AS (INSERT INTO company_membership_periods(membership_id,role)
  SELECT id,role FROM company_memberships WHERE company_id=$1 AND user_id=$2 AND period_id IS NULL RETURNING id,membership_id)
  UPDATE company_memberships member SET period_id=period.id FROM period WHERE member.id=period.membership_id`, [company, owner])
await pool.query("INSERT INTO education_contracts(id,company_id,plan_id,status,starts_at,ends_at,seat_limit) VALUES($1,$1,'plan-education','ACTIVE',NOW()-interval '1 day',NOW()+interval '30 days',10) ON CONFLICT DO NOTHING", [company])
await pool.query("INSERT INTO organization_seats(id,company_id,contract_id,user_id,status) VALUES($1,$1,$1,$2,'ACTIVE') ON CONFLICT DO NOTHING", [company, owner])
const { casesRouter } = await import('../../../server/src/modules/cases/router')
const { errorHandler } = await import('../../../server/src/http/errors')
const app = express()
app.use(express.json({ limit: '2mb' }))
app.use((req, _res, next) => { Object.assign(req, { authUserId: owner }); next() })
app.use('/api', casesRouter)
app.use(errorHandler)
const server = app.listen(5196, '127.0.0.1')
const request = async (path: string, method = 'GET', body?: unknown) => {
  const response = await fetch(`http://127.0.0.1:5196/api${path}`, { method,
    headers: { 'content-type': 'application/json', 'x-company-id': company },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json = await response.json()
  if (!response.ok) throw new Error(JSON.stringify({ status: response.status, json }))
  return json
}
const parts = ['```\nimport x\nfrom x import y\nx = 2*3*4\ny = "<script>literal</script>"', '', 'if x:\n    print(y)', '', 'print(x)  ', '```']
const raw = parts.join('\n')
const ids: Record<string, string> = {}
for (const kind of ['plain', 'styled', 'escaped']) {
  const body = kind === 'escaped' ? raw.replaceAll('`', '\\`') : raw
  const blocks = parts.map((text, index) => ({ id: `${kind}-p${index}`, type: 'paragraph',
    props: { textAlignment: 'left', textColor: 'default', backgroundColor: 'default' }, children: [],
    content: [{ type: 'text', text, styles: kind === 'styled' && index === 2 ? { italic: true } : {} }],
  }))
  const created = await request('/cases', 'POST', { title: `六段案例-${kind}`, summary: '测试合成历史形态', body,
    editorDocument: { format: 'blocknote', version: 1, projection: body, sections: [body], blocks },
    cover: null, category: '程序设计', tags: [], coverText: '代码保真', coverColor: 'blue', college: '测试学院',
  })
  await request(`/cases/${created.id}/publish`, 'POST', { version: created.version })
  ids[kind] = created.id
}
await writeFile('/tmp/issue604-case-ids.json', JSON.stringify({ company, owner, ids, code: parts.join('\n').slice(4, -4) }))
console.log('CASE604_READY ' + JSON.stringify(ids))
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => { void pool.end().then(() => process.exit(0)) }))

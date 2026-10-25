import assert from 'node:assert/strict'
import express, { type Express } from 'express'
import { pool } from '../../server/src/db/pool'
import { withTransaction } from '../../server/src/db/transaction'
import { readHairlineResources } from '../../server/src/modules/case-covers/cover-upstream'

export const syntheticTitlePrefix = '合成案例验收449-'
export const coverFixtureStates = ['legacy', 'pending', 'generating', 'failed', 'cancelled', 'ready', 'asset-failed', 'vm-failed'] as const
export type CoverFixtureState = typeof coverFixtureStates[number]
const staticSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 320"><path d="M100 160 L300 160" fill="none" stroke="#64748b" stroke-width="2"/></svg>'
// Fixed synthetic program; never a recorded or claimed live-model generation.
const figure = `hairline({range:[0,1,2],mount:({svg,stage})=>{
 const path=HL.mk('path',{d:'M100 160 L300 160',class:'lo nf'},svg);
 const move=event=>path.setAttribute('d',event.clientX<200?'M100 160 L300 100':'M100 160 L300 220');
 stage.addEventListener('pointermove',move);
 return {destroy(){stage.removeEventListener('pointermove',move)}};
}});`

/** Opt-in, local-only synthetic fixture; all ordinary case traffic uses the real API. */
export async function installAuthoringCoverFixture(app: Express) {
  assert.equal(process.env.NODE_ENV, 'test')
  assert.equal(process.env.CASES_AUTHORING_COVER_FIXTURE, '1')
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/lingxiloop_cases_449_browser_test')
  const { kernel } = await readHairlineResources()
  const program = JSON.stringify({ version: 2, engine: 'quickjs-wasm', kernel, figure })
  const brokenProgram = JSON.stringify({ version: 2, engine: 'quickjs-wasm', kernel, figure: 'throw new Error("synthetic VM failure");' })
  const knownJobs = new Map<string, string>()
  const states = new Map<string, CoverFixtureState>()
  const mutations: { method: string; path: string; status: number }[] = []
  let failNext: 'save' | 'publish' | null = null
  app.use('/api/fixture-authoring-cover', express.json({ limit: '4kb' }), (req, res, next) => {
    if (/cases-role=(student|outsider)/.test(req.headers.cookie ?? '')) { res.sendStatus(403); return }
    next()
  })
  app.get('/api/fixture-authoring-cover/manual.svg', (_req, res) => res.type('image/svg+xml').send(staticSvg))
  app.post('/api/fixture-authoring-cover/fail-next/:kind', (req, res) => {
    if (req.params.kind !== 'save' && req.params.kind !== 'publish') { res.sendStatus(400); return }
    failNext = req.params.kind
    res.json({ failure: failNext, synthetic: true })
  })
  app.get('/api/fixture-authoring-cover/:id/persistence', async (req, res) => {
    const result = await pool.query(`SELECT id,version,status,draft,published,published_version FROM organization_cases
      WHERE id=$1 AND company_id='cases-school' AND draft->>'title' LIKE $2`, [req.params.id, syntheticTitlePrefix + '%'])
    if (!result.rows[0]) { res.sendStatus(404); return }
    res.json({ ...result.rows[0], mutations, fixtureState: states.get(req.params.id), synthetic: true })
  })
  app.post('/api/fixture-authoring-cover/:id/state/:state', async (req, res) => {
    const { id, state } = req.params
    if (!coverFixtureStates.includes(state as CoverFixtureState)) { res.sendStatus(400); return }
    const changed = await withTransaction(pool, async db => {
      const own = await db.query(`SELECT id FROM organization_cases WHERE id=$1 AND company_id='cases-school'
        AND draft->>'title' LIKE $2 FOR UPDATE`, [id, syntheticTitlePrefix + '%'])
      if (!own.rows.length) return false
      const target = await db.query<{ job_id: string }>("SELECT job_id FROM organization_case_cover_targets WHERE case_id=$1 AND snapshot_kind='draft'", [id])
      const jobId = target.rows[0]?.job_id ?? knownJobs.get(id)
      if (!jobId) return false
      knownJobs.set(id, jobId)
      await db.query("UPDATE organization_cases SET draft=jsonb_set(draft,'{cover}',to_jsonb('/api/fixture-authoring-cover/manual.svg'::text)) WHERE id=$1", [id])
      if (state === 'legacy') {
        await db.query("DELETE FROM organization_case_cover_targets WHERE case_id=$1 AND snapshot_kind='draft'", [id])
        return true
      }
      const status = ['ready', 'asset-failed', 'vm-failed'].includes(state) ? 'ready' : state
      const jobs = await db.query<{ generation: number }>(`UPDATE organization_case_cover_jobs SET status=$2,
        lease_token=CASE WHEN $2='generating' THEN 'synthetic-fixture-lease' ELSE NULL END,
        leased_until=CASE WHEN $2='generating' THEN NOW()+interval '10 minutes' ELSE NULL END,updated_at=NOW()
        WHERE id=$1 RETURNING generation`, [jobId, status])
      const generation = jobs.rows[0]!.generation
      if (status === 'ready') {
        await db.query(`INSERT INTO organization_case_cover_assets(job_id,generation,case_id,company_id,preview_svg,interactive_html,alt,object_name,rationale,source_version,metadata)
          VALUES($1,$2,$3,'cases-school',$4,$5,'合成线段封面，指针移入改变端点','合成线段','固定状态夹具；非模型生成','synthetic-449','{"synthetic":true}')
          ON CONFLICT(job_id,generation) DO UPDATE SET preview_svg=EXCLUDED.preview_svg,interactive_html=EXCLUDED.interactive_html`,
        [jobId, generation, id, staticSvg, state === 'vm-failed' ? brokenProgram : program])
      }
      await db.query(`INSERT INTO organization_case_cover_targets(case_id,company_id,snapshot_kind,job_id,asset_job_id,asset_generation)
        VALUES($1,'cases-school','draft',$2,CASE WHEN $4 THEN $2 ELSE NULL END,CASE WHEN $4 THEN $3::integer ELSE NULL END)
        ON CONFLICT(case_id,snapshot_kind) DO UPDATE SET job_id=EXCLUDED.job_id,asset_job_id=EXCLUDED.asset_job_id,asset_generation=EXCLUDED.asset_generation`,
      [id, jobId, generation, status === 'ready'])
      return true
    })
    if (!changed) { res.sendStatus(404); return }
    states.set(id, state as CoverFixtureState)
    res.json({ state, synthetic: true, modelCall: false })
  })
  app.use((req, res, next) => {
    const assetCase = /^\/api\/cases\/([^/]+)\/cover\/assets\/.+\/(preview|interactive)$/.exec(req.path)
    if (assetCase && states.get(assetCase[1]) === 'asset-failed') { res.sendStatus(503); return }
    const saving = (req.method === 'POST' && req.path === '/api/cases') || (req.method === 'PUT' && /^\/api\/cases\/[^/]+$/.test(req.path))
    const publishing = req.method === 'POST' && /^\/api\/cases\/[^/]+\/publish$/.test(req.path)
    if (saving || publishing) {
      res.once('finish', () => mutations.push({ method: req.method, path: req.path, status: res.statusCode }))
      if ((saving && failNext === 'save') || (publishing && failNext === 'publish')) {
        failNext = null
        res.status(503).json({ error: 'Synthetic fixture transport failure' }); return
      }
    }
    next()
  })
}

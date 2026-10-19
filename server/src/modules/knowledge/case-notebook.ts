import { pool } from '../../db/pool.js'
import { openNotebookClient } from './provider.js'

/** Organization cases share one notebook and the existing source ingestion worker. */
export async function ensureCaseNotebook(companyId: string): Promise<string> {
  const client = await pool.connect()
  const key = `lingxiloop:company-cases:${companyId}`
  try {
    await client.query(`SELECT pg_advisory_lock(hashtextextended($1,0))`, [key])
    const { rows } = await client.query<{ external_notebook_id: string }>(`SELECT external_notebook_id FROM organization_case_notebooks WHERE company_id=$1`, [companyId])
    if (rows[0]) return rows[0].external_notebook_id
    const notebook = await openNotebookClient.createNotebook({ name:'组织案例库', description:'教师发布的组织共享案例',externalKey:key })
    await client.query(`INSERT INTO organization_case_notebooks(company_id,external_notebook_id) VALUES($1,$2)`, [companyId,notebook.id])
    return notebook.id
  } finally {
    await client.query(`SELECT pg_advisory_unlock(hashtextextended($1,0))`, [key]).catch(() => undefined)
    client.release()
  }
}

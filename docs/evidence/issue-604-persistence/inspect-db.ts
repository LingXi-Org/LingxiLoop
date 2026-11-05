import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { Pool } from 'pg'
const fixture=JSON.parse(await readFile('/tmp/issue604-case-ids.json','utf8'))
const pool=new Pool({connectionString:'postgres://postgres:case604-local-test-only@127.0.0.1:55464/issue604_cases_test'})
const report=[]
for(const [kind,id] of Object.entries(fixture.ids)) {
 const row=(await pool.query('SELECT version,published_version,draft,published FROM organization_cases WHERE id=$1 AND company_id=$2',[id,fixture.company])).rows[0]
 assert.ok(row)
 assert.deepEqual(row.draft,row.published)
 assert.equal(row.draft.editorDocument.projection,row.draft.body)
 const blocks=row.draft.editorDocument.blocks
 if(kind==='plain')assert.equal(blocks[0].type,'codeBlock')
 else assert.equal(blocks.length,6)
 if(kind==='styled')assert.equal(blocks[2].content[0].styles.italic,true)
 const hash=(value:string)=>createHash('sha256').update(value).digest('hex')
 report.push({kind,version:row.version,publishedVersion:row.published_version,bodySha256:hash(row.draft.body),nativeSha256:hash(JSON.stringify(blocks)),blockTypes:blocks.map((b:{type:string})=>b.type),draftEqualsPublished:true})
}
await writeFile(new URL('./database-result.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
console.log('PostgreSQL direct read confirms three persisted/published fixtures')
await pool.end()

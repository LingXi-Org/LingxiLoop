// Offline only: read immutable Git objects, never import or call product code.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='/workspace/LingxiLoop-native14-host-maintenance';
const source='7fe5b16e08dbe6634feb701d64e26c28475b917e';
const reviewedTarget='f749849e767250979469a21529fa390cf6d66daa';
const driverCommit='19422466f8463a3a1099c6fbfdd3b92d0228e1b5';
const hash=b=>createHash('sha256').update(b).digest('hex');
const paths=['server/src/modules/entitlements/repository.ts','server/src/domain/access/public.ts','server/src/domain/access/permission.ts','server/src/domain/entitlement/public.ts','server/src/domain/entitlement/plan.ts','server/src/domain/entitlement/entitlement.ts','server/src/domain/entitlement/plan-entitlement.ts'];
const files=paths.map(path=>{
 const a=execFileSync('git',['show',source+':'+path],{cwd:root});
 const b=execFileSync('git',['show',reviewedTarget+':'+path],{cwd:root});
 assert.deepEqual(a,b,'Canonical definition source and reviewed target differ');
 return {path,sourceSha256:hash(a),targetSha256:hash(b),equal:true};
});
const read=path=>execFileSync('git',['show',reviewedTarget+':'+path],{cwd:root,encoding:'utf8'});
const repository=read(paths[0]),permission=read(paths[2]),planSource=read(paths[4]);
assert.match(repository,/const CAPABILITY_CODES = ENTITLEMENT_CODES\.filter\(\(code\) => !code\.startsWith\('teacher\.'\)\)/);
assert.match(repository,/\.\.\.CAPABILITY_CODES\.map\(\(code\) => \[code, true\] as const\)/);
assert.match(repository,/\['teacher\.expensive_compute', true\]/);
assert.match(repository,/\['teacher\.compute_tier', 'pro'\]/);
assert.match(repository,/`entitlement-\$\{code\.replaceAll\('\.', '-'\)\}`/);
assert.match(repository,/`Defines \$\{code\} in the current access context`/);
const block=permission.match(/export const ENTITLEMENT_CODES = \[([\s\S]*?)\] as const/)?.[1];
assert.ok(block);const codes=[...block.matchAll(/'([^']+)'/g)].map(x=>x[1]);
assert.equal(codes.length,10);assert.equal(new Set(codes).size,10);
assert.match(planSource,/id: 'plan-education',\s*code: 'EDUCATION',\s*name: 'Education',\s*status: 'ACTIVE'/);
const values=[...codes.filter(c=>!c.startsWith('teacher.')).map(c=>[c,true]),['teacher.expensive_compute',true],['teacher.compute_tier','pro']];
assert.equal(values.length,8);
const plan={id:'plan-education',code:'EDUCATION',name:'Education',status:'ACTIVE'};
const entitlements=values.map(([code])=>({id:'entitlement-'+code.replaceAll('.','-'),code,description:`Defines ${code} in the current access context`}));
const associations=values.map(([code,value])=>({plan_id:plan.id,entitlement_id:'entitlement-'+code.replaceAll('.','-'),value}));
const canonical={format:'education-plan-canonical/v1',plans:[plan],entitlements,planEntitlements:associations};
const canonicalRaw=JSON.stringify(canonical,null,2)+'\n',canonicalSha256=hash(canonicalRaw);
const q=x=>"'"+String(x).replaceAll("'","''")+"'";
const sql=`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='10s';
SET LOCAL lock_timeout='3s';
SET LOCAL idle_in_transaction_session_timeout='15s';
SET LOCAL row_security=off;
SET LOCAL search_path=pg_catalog;
WITH expected_plans(id,code,name,status) AS (VALUES
 (${Object.values(plan).map(q).join(',')})),
expected_entitlements(id,code,description) AS (VALUES
 ${entitlements.map(e=>'('+Object.values(e).map(q).join(',')+')').join(',\n ')}),
expected_associations(plan_id,entitlement_id,value) AS (VALUES
 ${associations.map(e=>'('+q(e.plan_id)+','+q(e.entitlement_id)+','+q(JSON.stringify(e.value))+'::jsonb)').join(',\n ')}),
p AS (
 SELECT count(a.id)::int AS found,
 count(*) FILTER (WHERE a.id IS NOT NULL AND ROW(a.code,a.name,a.status) IS DISTINCT FROM ROW(e.code,e.name,e.status))::int AS different
 FROM expected_plans e LEFT JOIN public.plans a ON a.id=e.id),
e AS (
 SELECT count(a.id)::int AS found,
 count(*) FILTER (WHERE a.id IS NOT NULL AND ROW(a.code,a.description) IS DISTINCT FROM ROW(e.code,e.description))::int AS different
 FROM expected_entitlements e LEFT JOIN public.entitlements a ON a.id=e.id),
v AS (
 SELECT count(a.plan_id)::int AS found,
 count(*) FILTER (WHERE a.plan_id IS NOT NULL AND a.value IS DISTINCT FROM e.value)::int AS different
 FROM expected_associations e LEFT JOIN public.plan_entitlements a ON a.plan_id=e.plan_id AND a.entitlement_id=e.entitlement_id),
totals AS (SELECT 17-p.found-e.found-v.found AS missing,p.different+e.different+v.different AS mismatched,
 p.found AS plans,e.found AS entitlements,v.found AS associations FROM p,e,v)
SELECT 'NATIVE14_SEED_CHECK='||jsonb_build_object(
 'readOnly',current_setting('transaction_read_only')='on',
 'fullVisibility',(SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user),
 'canonicalSha256',${q(canonicalSha256)},
 'counts',jsonb_build_object('missing',missing,'mismatched',mismatched,'plans',plans,'entitlements',entitlements,'planEntitlements',associations),
 'equal',missing=0 AND mismatched=0)::text FROM totals;
ROLLBACK;
`;
const provenance={format:'education-plan-source-provenance/v1',source,reviewedTarget,files,canonicalSha256,sqlSha256:hash(sql),scope:'Exact existing ensurePlan upsert values: one plan, eight entitlements, eight associations; no function invoked. Extra rows outside the upsert keys are not compared.',sameValuesDoNotMeanNoWrite:'ensureEducationPlan still performs existing ON CONFLICT DO UPDATE operations; equality establishes same logical values, not a physical write no-op.'};
const provenanceRaw=JSON.stringify(provenance,null,2)+'\n';
const bindings={source,reviewedTarget,driverCommit,canonicalSha256,sqlSha256:hash(sql),provenanceSha256:hash(provenanceRaw)};
for(const [name,data] of [['canonical.json',canonicalRaw],['provenance.json',provenanceRaw],['seed-check.sql',sql],['bindings.mjs','export const BINDINGS=Object.freeze('+JSON.stringify(bindings,null,2)+');\n']]){
 const url=new URL(name,import.meta.url);
 // Re-generation may only confirm byte-identical already sealed artifacts.
 try{assert.deepEqual(await readFile(url),Buffer.from(data),name+' differs from existing artifact')}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(url,data,{flag:'wx',mode:0o600});}
}
console.log(JSON.stringify({verified:true,source,reviewedTarget,files:files.length,counts:{plans:1,entitlements:8,planEntitlements:8},...bindings}));

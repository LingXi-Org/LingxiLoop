// Exact existing ensureEducationPlan definition; no product code is imported.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
export const SEED_DEFINITIONS={
  "server/src/modules/entitlements/repository.ts": "e9f3f37a8bae3cc960c0eb502954348e1aefd1edb86905c85f30a246d3a705b2",
  "server/src/domain/access/public.ts": "e48bd548b6fe46918d5bfe15968b70f8277ea458457c90c67f0e2f8085e046c2",
  "server/src/domain/access/permission.ts": "6228bbcc25386a9738e4ba5a3eb7bbc155f24aeb7092f1afef43bb05afca9910",
  "server/src/domain/entitlement/public.ts": "82500e9eaab2a0a95e8f89bb19e5a97f901121e22b4215c5af5b66ef07e0507a",
  "server/src/domain/entitlement/plan.ts": "da9d981896ff18013c26c79541f0befdf89832cd7746431ac475ab7f55885ef1",
  "server/src/domain/entitlement/entitlement.ts": "d274897d5afa9ddb4f263395796783c9c9026ee8ecb53bd37387f337195de96f",
  "server/src/domain/entitlement/plan-entitlement.ts": "aa6a61773679848367bd123ffd423c8aaad9d26ff7613b6b40b37271fc23de37"
};
export async function assertSeedDefinitions(source,target,git){
 for(const [path,expected]of Object.entries(SEED_DEFINITIONS))for(const commit of [source,target])if(hash(await git(['show',`${commit}:${path}`]))!==expected)throw Error('Canonical education upsert definition changed');
}
export async function seedCommand(){
 const sql=await readFile(new URL('./public-text-seed-check.sql',import.meta.url),'utf8');
 if(hash(sql)!=='c537de5fd0221f0976e9496571cfc1867a73383869f922c9bfcf835445ca8586')throw Error('Canonical seed query changed');
 const quote=s=>"'"+s.replaceAll("'", "'\"'\"'")+"'";
 return `set -eu; set +x; export PGPASSWORD="$POSTGRES_PASSWORD" PGCONNECT_TIMEOUT=10; exec timeout -k 5 30 psql -X -qAt -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c ${quote(sql)}`;
}

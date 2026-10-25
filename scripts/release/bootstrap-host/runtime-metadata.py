"""Read package and migration identities from already-running Web containers."""
import subprocess,json
CODE="""import {releaseVersions,packageResources} from '@lyyzka/lingxios';
import {readFileSync,readdirSync} from 'node:fs';import{createHash}from'node:crypto';
const h=b=>createHash('sha256').update(b).digest('hex');
const path='server/src/db/migrations';const names=readdirSync(path).filter(n=>/^\\d{4}_[a-z0-9_]+\\.sql$/.test(n)).sort();
console.log(JSON.stringify({sourceSha:process.env.LINGXILOOP_COMMIT_SHA,releaseVersions,nativeSchemaHash:h(readFileSync(packageResources().schema)),migrations:names.map(n=>({version:Number(n.slice(0,4)),name:n.slice(5,-4),checksum:h(readFileSync(path+'/'+n))}))}));"""
def docker(args):return subprocess.check_output(['/usr/bin/docker']+args,text=True,timeout=30)
def main():
    results=[]
    for project in ['lingxiloop-app-a','lingxiloop-app-b']:
        ids=docker(['ps','--quiet','--filter','label=com.docker.compose.project='+project,'--filter','label=com.docker.compose.service=lingxiloop']).split()
        if not ids:continue
        if len(ids)!=1:raise RuntimeError('RUNTIME_INVENTORY_UNCERTAIN')
        value=json.loads(docker(['exec',ids[0],'node','--input-type=module','-e',CODE]))
        results.append({'project':project,'container':ids[0],'metadata':value})
    print(json.dumps({'version':1,'runtimes':results}))
if __name__=='__main__':main()

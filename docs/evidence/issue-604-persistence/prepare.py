# Owning-case schema slice only. This does not install or qualify LingxiOS.
import hashlib, json, subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[3]
out=Path(__file__).parent
container='issue604-pg'
db='issue604_cases_test'
command=['docker','exec','-i',container,'psql','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At']
empty=subprocess.run(command,input="SELECT count(*) FROM pg_tables WHERE schemaname='public';",text=True,capture_output=True,check=True)
if empty.stdout.strip()!='0': raise SystemExit('Requires the fresh dedicated fixture container/database; never resets an existing database')
files=['0001_v1_baseline.sql','0002_remove_legacy_identity.sql','0011_closed_education.sql','0014_profile_avatars.sql','0045_organization_cases.sql','0057_case_soft_delete.sql','0062_case_options.sql']
records=[]
for file in files:
    raw=(root/'server/src/db/migrations'/file).read_bytes()
    sql=raw.decode() if file.startswith('0001') else 'BEGIN;\n'+raw.decode()+'\nCOMMIT;'
    subprocess.run(command,input=sql,text=True,capture_output=True,check=True)
    records.append({'file':file,'sha256':hashlib.sha256(raw).hexdigest()})
(out/'schema-slice.json').write_text(json.dumps({'scope':'Only owning-case SQL and access prerequisites, not a full bootstrapped application/runtime database','assets':records},indent=2)+'\n')
print('Prepared owning-case PostgreSQL fixture from unchanged SQL assets')

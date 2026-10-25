import json,re,hashlib,sys
from pathlib import Path
root=Path(sys.argv[1]);project=Path(__file__).resolve().parents[2];out=project/'third_party/retab-ui';items={};files={}
def visit(n):
 if n in items or not n.startswith('@retab/') or n in ['@retab/email-viewer','@retab/utils','@retab/skeleton']:return
 d=json.loads((root/'public/r'/(n.split('/')[1]+'.json')).read_text());items[n]=d
 for f in d.get('files',[]):
  p=f['target'].replace('@ui/','ui/').replace('@lib/','lib/').replace('@hooks/','hooks/').replace('@components/','components/')
  if p != 'ui/button.tsx':files[p]=f
 for r in d.get('registryDependencies',[]):visit(r)
visit('@retab/file-viewer')
# Email is not an accepted material upload format; leave it to the upstream unsupported card.
p='ui/file-viewer-route.tsx';s=files[p]['content'];s=re.sub(r'const EmailResourceContent = React.lazy\([\s\S]*?\n\);\n','',s);s=re.sub(r'  email: \(\{ resource,[\s\S]*?\n  \),\n','',s);files[p]=dict(files[p],content=s)
allfiles=[];manifest=[]
for p,f in sorted(files.items()):
 original=(root/f['path']).read_bytes()
 s=f['content']
 for prefix,target in [('@/components/ui/','ui/'),('@/lib/','lib/'),('@/hooks/','hooks/'),('@/components/','components/')]:
  def replace(m):
   q=target+m[1];stem=q.removesuffix('.js')
   if any(x in files for x in [q,stem+'.ts',stem+'.tsx',stem+'.css',stem+'.d.ts']):return '"@/components/retab/'+q+'"'
   return m[0]
  s=re.sub(r'"'+re.escape(prefix)+r'([^"\n]+)"',replace,s)
 target='src/components/retab/'+p
 allfiles.append(dict(f,content=s,target=target))
 manifest.append({'source':f['path'],'target':target,'sha256':hashlib.sha256(original).hexdigest()})
package=json.loads((project/'package.json').read_text());existing=set(package['dependencies'])|set(package['devDependencies']);dependencies={}
for d in items.values():
 for dep in d.get('dependencies',[]):
  n=dep.rsplit('@',1)[0] if '@' in dep[1:] else dep
  if n not in existing:dependencies[n]=dep
# Keep upstream exact documented versions, avoid older duplicates from dependency subitems.
for dep in ['dompurify@3.4.9','marked@18.0.5','docx-preview@0.3.7','utif@3.1.0','pptxviewjs@1.1.9']:
 n=dep.rsplit('@',1)[0]
 if n not in existing:dependencies[n]=dep
flat={'$schema':'https://ui.shadcn.com/schema/registry-item.json','name':'retab-material-file-viewer','type':'registry:ui','title':'Retab material file viewer','files':allfiles,'dependencies':sorted(dependencies.values()),'devDependencies':['@types/prismjs@^1.26.6']}
Path('/tmp/retab-material-file-viewer.json').write_text(json.dumps(flat))
(out/'provenance.json').write_text(json.dumps({'repository':'https://github.com/retab-dev/retab-ui','commit':'321b3eacce133228042265c499d399c960bc7f13','items':list(items),'files':manifest},indent=2)+'\n')
print(len(allfiles),'files',len(dependencies),'new dependencies')

"""Read-only, bounded host inventory; never emit container environments."""
import subprocess, json, pathlib, os

PROJECTS = {'lingxiloop-app-a','lingxiloop-app-b','lingxiloop-core-state','lingxiloop-knowledge-agent','server-b-ingress'}
def docker(args):
    return subprocess.check_output(['/usr/bin/docker']+args,text=True,timeout=30)
def file_info(path):
    p=pathlib.Path(path)
    if not p.is_file(): return {'path':str(p),'exists':False}
    s=p.stat()
    return {'path':str(p),'exists':True,'bytes':s.st_size,'mode':oct(s.st_mode&0o777),'uid':s.st_uid}
def main():
    engine=json.loads(docker(['info','--format','{{json .}}']))
    ids=docker(['ps','--all','--quiet']).split()
    containers=[];images={};files={}
    for container_id in ids:
        c=json.loads(docker(['container','inspect',container_id]))[0]
        labels=c.get('Config',{}).get('Labels') or {}
        if labels.get('com.docker.compose.project') not in PROJECTS: continue
        selected={k:labels.get(k) for k in ['com.docker.compose.project','com.docker.compose.service','com.docker.compose.project.working_dir','com.docker.compose.project.config_files','com.docker.compose.project.environment_file']}
        row={'id':c['Id'],'name':c['Name'].lstrip('/'),'imageId':c['Image'],'imageRef':c['Config']['Image'],'labels':selected,
             'state':{'running':c['State']['Running'],'health':(c['State'].get('Health') or {}).get('Status'),'restartCount':c['RestartCount']},
             'mounts':[{k:m.get(k) for k in ['Type','Name','Source','Destination','RW']} for m in c.get('Mounts',[])],
             'ports':c['HostConfig'].get('PortBindings'),'networks':list(c['NetworkSettings'].get('Networks',{}))}
        containers.append(row)
        if c['Image'] not in images:
            image=json.loads(docker(['image','inspect',c['Image']]))[0]
            images[c['Image']]={k:image.get(k) for k in ['Id','RepoTags','RepoDigests','Os','Architecture','RootFS','Descriptor']}
        paths=[p for p in (selected.get('com.docker.compose.project.config_files') or '').split(',') if p]
        working=selected.get('com.docker.compose.project.working_dir')
        if working: paths += [str(pathlib.Path(working)/n) for n in ['.env','.komodo.env','.release.env']]
        if selected.get('com.docker.compose.project.environment_file'): paths.append(selected['com.docker.compose.project.environment_file'])
        for path in paths: files[path]=file_info(path)
    print(json.dumps({'version':1,'root':os.geteuid()==0,'architecture':os.uname().machine,
        'docker':{'version':engine.get('ServerVersion'),'liveRestoreEnabled':engine.get('LiveRestoreEnabled'),'driver':engine.get('Driver')},
        'containers':containers,'images':images,'files':list(files.values())}))
if __name__=='__main__': main()

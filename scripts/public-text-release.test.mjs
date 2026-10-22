import test from 'node:test';import assert from 'node:assert/strict';
import {createHash}from'node:crypto';
import {READER_FORMAT,PRODUCER_FORMAT,CONVERSATION_FORMAT,MIGRATION52,MIGRATION53,MIGRATION51,SCHEMA14,assertPublicTextPlan,qualifyImageEnvironments,normalizeImageEnvironment,assertSeedEquality,assertAcceptedPublicTextSource,assertPublicTextMetadata}from'./public-text-release.mjs';
const digest=b=>'sha256:'+createHash('sha256').update(b).digest('hex'),sha='a'.repeat(40),next='b'.repeat(40),hex='c'.repeat(64);
export function fixture(producer=false){
 const m=Array.from({length:50},(_,i)=>({version:i+1,name:'m_'+i,checksum:hex}));
 const src={sha,runtime:producer?'3.7.0':'3.6.0',schema:14,protocol:11,schemaHash:SCHEMA14,productVersion:producer?51:50,migrations:producer?[...m,MIGRATION51]:m,integrity:'formal',tarball:'formal'};
 const dst={...src,sha:next,runtime:'3.7.0',productVersion:51,migrations:[...m,MIGRATION51]};
 const raw=(commit,node)=>JSON.stringify({config:{Env:['PATH=/usr/bin','NODE_VERSION='+node,'LINGXILOOP_COMMIT_SHA='+commit],Cmd:['node'],Entrypoint:['/usr/bin/tini','--']}});
 const imageConfigs={source:raw(sha,'22.23.4'),target:raw(next,'22.23.5')};src.image={configDigest:digest(imageConfigs.source)};dst.image={configDigest:digest(imageConfigs.target)};
 src.migrations=structuredClone(src.migrations);dst.migrations=structuredClone(dst.migrations);
 return structuredClone({format:producer?PRODUCER_FORMAT:READER_FORMAT,source:src,target:dst,publicText:{source:producer?{reader:2,producer:'disabled'}:null,target:{reader:2,producer:producer?'purpose-json-v1':'disabled'},sourceConfigurationSha256:producer?hex:null,targetConfigurationSha256:hex,sourceContainers:producer?['lingxiloop-app-a','lingxiloop-app-b'].flatMap((stack,i)=>['lingxiloop','worker'].map((service,j)=>({stack,service,id:String(i*2+j+1).repeat(64),imageId:'sha256:'+'c'.repeat(64)}))):null},imageConfigs});
}
test('explicit reader upgrade binds unchanged native/full50 plus reviewed51; legacy shape is not accepted',()=>{
 assert.doesNotThrow(()=>assertPublicTextPlan(fixture()));
 for(const change of [p=>p.source.runtime='3.6.1',p=>p.target.runtime='3.8.0',p=>p.target.schema=15,p=>p.target.protocol=12,p=>p.target.schemaHash='0'.repeat(64),p=>p.target.migrations[2].checksum='0'.repeat(64),p=>p.target.migrations[50].checksum='0'.repeat(64),p=>p.publicText.target.producer='purpose-json-v1',p=>p.format='same-schema-host-release/v1']){const p=fixture();change(p);assert.throws(()=>assertPublicTextPlan(p));}
});
test('producer phase retains full formal reader profile; no downgrade or legacy source',()=>{
 assert.doesNotThrow(()=>assertPublicTextPlan(fixture(true)));
 for(const change of [p=>p.source.runtime='3.6.0',p=>p.source.productVersion=50,p=>p.target.integrity='changed',p=>p.target.migrations[0].checksum='0'.repeat(64),p=>p.publicText.source.reader=1,p=>p.publicText.target.producer='unreviewed']){const p=fixture(true);change(p);assert.throws(()=>assertPublicTextPlan(p));}
});
test('only digest-qualified Node metadata is normalized; other env, source and startup cannot drift',()=>{
 const p=fixture(),contract=qualifyImageEnvironments(p),env=which=>JSON.parse(p.imageConfigs[which]).config.Env;
 assert.deepEqual(normalizeImageEnvironment([...env('source'),'SECRET=value'],p.source.sha,contract),normalizeImageEnvironment([...env('target'),'SECRET=value'],p.target.sha,contract));
 assert.notDeepEqual(normalizeImageEnvironment([...env('source'),'SECRET=one'],p.source.sha,contract),normalizeImageEnvironment([...env('target'),'SECRET=two'],p.target.sha,contract));
 for(const values of [env('target').map(x=>x.startsWith('NODE_VERSION=')?'NODE_VERSION=22.0.0':x),[...env('target'),'NODE_VERSION=22.23.5']])assert.throws(()=>normalizeImageEnvironment(values,p.target.sha,contract));
 for(const change of [c=>c.config.Env.push('OTHER=changed'),c=>c.config.Cmd=['other'],c=>c.config.Env[1]='NODE_VERSION=24.0.0']){const bad=fixture(),c=JSON.parse(bad.imageConfigs.target);change(c);bad.imageConfigs.target=JSON.stringify(c);bad.target.image.configDigest=digest(bad.imageConfigs.target);assert.throws(()=>qualifyImageEnvironments(bad));}
 const altered=fixture();altered.imageConfigs.target+=' ';assert.throws(()=>qualifyImageEnvironments(altered));
});
test('canonical seed read rejects missing, changed, invisible or incomplete aggregate',()=>{
 const good={readOnly:true,fullVisibility:true,canonicalSha256:'18182ceea150aec2db43a871e6100d6e7793ddcfec326cfd5031266cd84bb2e7',counts:{missing:0,mismatched:0,plans:1,entitlements:8,planEntitlements:8},equal:true};
 assert.doesNotThrow(()=>assertSeedEquality(good));
 for(const change of [r=>r.counts.missing=1,r=>r.counts.mismatched=1,r=>r.fullVisibility=false,r=>r.counts.entitlements=7,r=>r.canonicalSha256='0'.repeat(64),r=>r.extra=true]){const bad=structuredClone(good);change(bad);assert.throws(()=>assertSeedEquality(bad));}
});

test('producer phase rejects incomplete/foreign acceptance and active reader identity changes',()=>{
 const p=fixture(true),accepted={format:'public-text-host-acceptance/v1',passed:true,candidate:p.source.sha,checks:{actualReaders:true},publicText:p.publicText.source,configurationSha256:p.publicText.sourceConfigurationSha256,readerContainers:p.publicText.sourceContainers};
 assert.doesNotThrow(()=>assertAcceptedPublicTextSource(accepted,p));
 for(const change of [a=>a.format='web-same-schema-acceptance/v1',a=>a.checks.actualReaders=false,a=>a.readerContainers.pop(),a=>a.publicText.reader=1,a=>a.configurationSha256='0'.repeat(64),a=>a.candidate='e'.repeat(40)]){const bad=structuredClone(accepted);change(bad);assert.throws(()=>assertAcceptedPublicTextSource(bad,p));}
});
test('actual leaf options must match reader-only or explicit producer deployment; capability alone is insufficient',()=>{
 for(const producer of [false,true]){const p=fixture(producer),good={publicText:2,deployment:p.publicText.target,configurationSha256:p.publicText.targetConfigurationSha256,modelOptions:producer?{publicTextProtocol:'purpose-json-v1'}:{}};assert.doesNotThrow(()=>assertPublicTextMetadata(good,p));assert.throws(()=>assertPublicTextMetadata({...good,modelOptions:producer?{}:{publicTextProtocol:'purpose-json-v1'}},p));}
});

test('later fix-forward may keep or disable production only while retaining capable formal3.7 readers',()=>{for(const old of ['disabled','purpose-json-v1']){const p=fixture(true);p.publicText.source.producer=old;p.publicText.target.producer='disabled';assert.doesNotThrow(()=>assertPublicTextPlan(p));}});

test('trace source acceptance must be actual enabled reader identities; actual target advertises runTrace1',()=>{
 const p=fixture(true);p.format='run-trace-provenance-host-release/v1';p.publicText.source.producer='purpose-json-v1';p.target.runtime='3.8.0';p.target.productVersion=52;p.target.migrations.push({version:52,name:'run_trace_provenance',checksum:'2016fdcc9e095454f1a9fbd5fdffdaa4443c8918173dea8a324f88546123a886'});
 const accepted={format:'public-text-host-acceptance/v1',passed:true,candidate:p.source.sha,checks:{actualReaders:true},publicText:p.publicText.source,configurationSha256:p.publicText.sourceConfigurationSha256,readerContainers:p.publicText.sourceContainers};assert.doesNotThrow(()=>assertPublicTextPlan(p));assert.doesNotThrow(()=>assertAcceptedPublicTextSource(accepted,p));
 for(const change of [a=>a.publicText.producer='disabled',a=>a.readerContainers.pop(),a=>a.format='web-same-schema-acceptance/v1',a=>a.configurationSha256='0'.repeat(64)]){const bad=structuredClone(accepted);change(bad);assert.throws(()=>assertAcceptedPublicTextSource(bad,p));}
 const metadata={publicText:2,runTrace:1,deployment:p.publicText.target,configurationSha256:p.publicText.targetConfigurationSha256,modelOptions:{publicTextProtocol:'purpose-json-v1'}};assert.doesNotThrow(()=>assertPublicTextMetadata(metadata,p));
 for(const value of [undefined,0,2])assert.throws(()=>assertPublicTextMetadata({...metadata,runTrace:value},p));
});

function repairFixture(){
 const p=fixture(true);p.format=CONVERSATION_FORMAT;p.publicText.source.producer='purpose-json-v1';
 Object.assign(p.source,{runtime:'3.8.0',productVersion:52,migrations:[...p.source.migrations,MIGRATION52]});
 Object.assign(p.target,{runtime:'3.8.2',productVersion:53,migrations:[...p.target.migrations,MIGRATION52,MIGRATION53]});return p;
}
test('conversation repair exact profile binds full52 source and reviewed53 without relaxing trace capability',()=>{
 const p=repairFixture();assert.doesNotThrow(()=>assertPublicTextPlan(p));
 for(const change of [p=>p.source.runtime='3.7.0',p=>p.target.runtime='3.8.0',p=>p.target.migrations[52].checksum='0'.repeat(64),p=>p.target.migrations[51].checksum='0'.repeat(64),p=>p.target.migrations[0].checksum='0'.repeat(64),p=>p.publicText.sourceContainers.pop(),p=>p.format='run-trace-provenance-host-release/v1']){const bad=structuredClone(p);change(bad);assert.throws(()=>assertPublicTextPlan(bad));}
 const good={publicText:2,runTrace:1,deployment:p.publicText.target,configurationSha256:p.publicText.targetConfigurationSha256,modelOptions:{publicTextProtocol:'purpose-json-v1'}};
 assert.doesNotThrow(()=>assertPublicTextMetadata(good,p));assert.throws(()=>assertPublicTextMetadata({...good,runTrace:undefined},p));
});

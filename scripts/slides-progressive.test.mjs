import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import test from 'node:test'
const require=createRequire(import.meta.url)
const sha=text=>createHash('sha256').update(text).digest('hex')
const turn=()=>new Promise(resolve=>setImmediate(resolve))

export async function checkProgressiveFiles({write=true,narrowed=false,revoke=false,downgrade=false,concurrent=false,deleted=false,systems=false,changedTokens=false}={}) {
  const r=require('../server/assets/slides-editor/node/compiler.cjs').runtime
  const first='<section id="a"><h1>First original</h1></section>',later='<section id="b"><h1>Later original</h1></section>'
  const files=new Map([['project/deck.json',JSON.stringify({v:4,lists:'css',title:'Progressive',order:['a','b'],sections:{},faces:{},designSystems:[]})],['project/slides/a.html',first],['project/slides/b.html',later]])
  let releaseTokens;const tokenGate=new Promise(resolve=>{releaseTokens=resolve})
  const tokenPath='project/ds/fixture/tokens.json',tokens=JSON.stringify(require('../third_party/baoyu-design/slides-source/builtin-style.json').tokens).replace('#141413','#123456')
  if(systems){const index=JSON.parse(files.get('project/deck.json'));index.designSystems=[{namespace:'fixture',title:'Fixture system',artifact:'fixture',version:'1',copiedAt:''}];files.set('project/deck.json',JSON.stringify(index));files.set(tokenPath,tokens)}
  let release;const gate=new Promise(resolve=>{release=resolve}),published=[],notices=[]
  let fullReads=false,version='base'
  const port={canWrite:write,mayWrite:write,narrowed,
    list:async()=>[...files].map(([path,text])=>({path,sha256:sha(text),size:text.length})),
    readText:async path=>{if(path===tokenPath)await tokenGate;if(path==='project/slides/b.html'){await gate;fullReads=true;if(revoke)throw Object.assign(Error('revoked'),{status:403})}const text=files.get(path);if(text===undefined)throw Object.assign(Error('missing'),{status:404});return {text,sha256:sha(text)}},
    readBytes:async()=>null,version:()=>({version}),onRemoteChange:()=>()=>{},
    publish:async (batch,options)=>{assert.ok(fullReads,'published before other files were known');published.push({batch,options});const shas={};for(const[path,input]of Object.entries(batch)){assert.notEqual(input,null,'no file can be deleted during progressive edit');const text=typeof input==='string'?input:input.text;assert.equal(typeof text,'string');files.set(path,text);shas[path]=sha(text)}version='saved-'+published.length;return{ok:true,version,shas}},
  }
  const shape=r.createSlidesArtifactDocumentOptions(),doc=r.createSlidesFilesDocument({port,...shape,startEmpty:true,progressive:true,...(narrowed||revoke?{timers:{now:()=>Date.now(),setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,10)),clearTimeout:id=>clearTimeout(id)}}:{}),firstSlide:{landing:order=>order[0],parse:shape.parseContent,allowed:()=>true},onNotice:message=>notices.push(message)})
  try{
    if(systems){for(let i=0;i<15;i++)await turn();assert.equal(doc.shown(),false,'theme-dependent editing must await its real token file');releaseTokens()}
    for(let i=0;i<50&&!doc.shown();i++)await turn()
    if (!write || narrowed) {
      assert.equal(doc.shown(),false,'restricted documents must wait for complete read');release();await doc.ready();assert.equal(doc.progressive(),false);assert.equal(doc.readOnly(),true);assert.equal(published.length,0);return;
    }
    assert.ok(doc.shown(),'first slide must be editable while later read remains pending')
    assert.equal(fullReads,false);assert.equal(doc.readOnly(),false);assert.equal(doc.progressive(),true)
    assert.deepEqual(doc.content().order,['a'])
    const originalSystems=structuredClone(r.getDesignSystemsSnapshot())
    if(systems)assert.ok(JSON.stringify(originalSystems).includes('Fixture system'),'first editable model lost installed theme tokens')
    const edit=structuredClone(doc.content());for(const node of r.iterateDeckTextNodes(Object.values(edit.slides)))if(node.text==='First original')node.text='First typed before other pages'
    doc.setContent(edit);assert.equal(doc.dirty(),true)
    doc.setContent({...doc.content(),order:[],slides:{}});assert.deepEqual(doc.content().order,['a']);assert.ok(notices.length)
    await doc.save();assert.equal(published.length,0)
    if (downgrade) port.canWrite = false;
    if (concurrent) { files.set('project/slides/a.html','<section id="a"><h1>Their later edit</h1></section>');version='remote'; }
    if (deleted) { files.delete('project/slides/a.html');const metadata=JSON.parse(files.get('project/deck.json'));metadata.order=['b'];files.set('project/deck.json',JSON.stringify(metadata));version='remote'; }
    if(changedTokens){files.set(tokenPath,tokens.replace('#123456','#abcdef'));version='remote'}
    release();await doc.ready();
    if (concurrent || deleted || changedTokens) {assert.equal(doc.dirty(),true);assert.equal(doc.progressive(),true);assert.equal(published.length,0);if(concurrent)assert.match(files.get('project/slides/a.html'),/Their later edit/);if(deleted)assert.equal(files.has('project/slides/a.html'),false);if(changedTokens)assert.match(files.get(tokenPath),/#abcdef/);assert.ok([...r.iterateDeckTextNodes(Object.values(doc.content().slides))].some(node=>node.text==='First typed before other pages'));return}
    if (downgrade) {assert.equal(doc.dirty(),true);assert.equal(doc.progressive(),true);assert.equal(doc.readOnly(),true);assert.equal(published.length,0);assert.ok([...r.iterateDeckTextNodes(Object.values(doc.content().slides))].some(node=>node.text==='First typed before other pages'));return}
    if (revoke) {assert.equal(doc.progressive(),false);assert.deepEqual(doc.content().order,[]);assert.equal(doc.shown(),false);assert.equal(published.length,0);return}
    assert.equal(doc.progressive(),false);assert.deepEqual(doc.content().order,['a','b'])
    if(systems){assert.deepEqual(r.getDesignSystemsSnapshot(),originalSystems);assert.equal(files.get(tokenPath),tokens)}
    assert.ok([...r.iterateDeckTextNodes(Object.values(doc.content().slides))].some(node=>node.text==='First typed before other pages'))
    await doc.save();assert.ok(published.length);assert.match(files.get('project/slides/a.html'),/First typed before other pages/)
    assert.equal(files.get('project/slides/b.html'),later);assert.deepEqual(JSON.parse(files.get('project/deck.json')).order,['a','b'])
    for(const change of published){assert.ok(!('project/slides/b.html'in change.batch));if('project/slides/a.html'in change.batch)assert.equal(change.options.ifMatch['project/slides/a.html'],sha(first))}
    assert.equal(doc.dirty(),false)
  }finally{releaseTokens();release();await doc.ready();doc.dispose()}
}
// Imported from the owning editor suite after its native compiler build.
if(process.argv[1]?.endsWith('slides-progressive.test.mjs'))test('progressive first edit preserves unloaded files and native CAS',checkProgressiveFiles)

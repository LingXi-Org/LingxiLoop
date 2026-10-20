import assert from 'node:assert/strict';
export const EXPECTED = Object.freeze({
  passed:true,platform:'linux/x64/glibc',gnuSelected:true,muslAbsent:true,
  pngBytes:115,pngSha256:'37bb849c8331759b4b7b6ec3e959f1e60b4b5bfbf9dcd4a4b711ae0c406ca5c0',
  pdfBytes:201,pdfSha256:'30ee46cdb0878604ece1e00fab7a9807f3db64ff443a48e6dc2fe4a5646a5e04',
  publicFixtureSha256:'33aaa4a900cc81178a5c9c312bc0126b81805423e483e498a9c9b0d423c0a10e',
});
export function attachNativeProbe({ops,transport,source,probeCode,onProgress}) {
  const metadata=ops.metadata.bind(ops),seen=new Set();
  ops.metadata=async stack=>{
    assert.ok(['lingxiloop-app-a','lingxiloop-app-b'].includes(stack)&&!seen.has(stack),'Unexpected or duplicate probe');
    seen.add(stack);
    const result=await metadata(stack);
    await ops.assertIdle();await ops.verifyImages('target',stack);
    const before=await ops.inspect();
    assert.equal(before.length,4);
    assert.equal(new Set(before.map(r=>r.id)).size,4);
    assert.ok(before.every(r=>r.source===source&&r.running&&r.healthy&&!r.restarting&&r.restartCount===0&&r.pid>0),'Original healthy services required');
    let update=await transport.execute('RunStackService',{
      stack,service:'db-migrate',no_tty:true,no_deps:true,detach:false,service_ports:false,pull:false,
      command:['timeout','-k','5','30','env','-i','PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','NODE_ENV=production','node','--max-old-space-size=128','--input-type=module','-e',probeCode],
    });
    const updateId=update?._id?.$oid,target=update?.target;
    try {
      assert.ok(/^[a-f0-9]{24}$/.test(updateId??'')&&update.operation==='RunStackService'&&target?.type==='Stack'&&/^[a-f0-9]{24}$/.test(target.id??'')&&update.status==='Complete'&&update.success===true,'Invalid probe identity');
      update=await transport.read('GetUpdate',{id:updateId});
      assert.equal(update?._id?.$oid,updateId);
      assert.equal(update.operation,'RunStackService');
      assert.deepEqual(update.target,target);
      assert.ok(update.status==='Complete'&&update.success===true,'Native probe did not complete');
    }catch{throw Object.assign(Error('Probe terminal readback unresolved'),{uncertain:true})}
    const prefix='CANDIDATE_NATIVE_PROBE=';
    const lines=(update.logs??[]).flatMap(r=>typeof r.stdout==='string'?r.stdout.split(/\r?\n/):[]).filter(r=>r.startsWith(prefix));
    assert.ok(lines.length===1&&lines[0].length<4096,'Ambiguous probe receipt');
    const receipt=JSON.parse(lines[0].slice(prefix.length));
    assert.deepEqual(receipt,EXPECTED,'Native output differs');
    assert.deepEqual(await ops.inspect(),before,'Original services changed during probe');
    await onProgress({phase:'candidate-native-probe',status:'verified',stack,updateId,terminalReadback:true,...receipt,originalContainersUnchanged:true});
    return result;
  };
}

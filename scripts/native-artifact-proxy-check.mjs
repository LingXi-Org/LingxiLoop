#!/usr/bin/env node
/** Real TCP resets against the current HTTPS proxy fragment, without importing the product service. */
import assert from'node:assert/strict';
import{execFileSync,spawnSync}from'node:child_process';import{mkdtempSync,rmSync,readFileSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
const dir=mkdtempSync(join(tmpdir(),'review-07-proxy-'));execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-subj','/CN=localhost'],{stdio:'ignore'});
const source=readFileSync(new URL('./native-artifact-serve.mjs',import.meta.url),'utf8'),begin=source.indexOf('const rawFetch ='),end=source.indexOf('await new Promise(resolveReady',begin),fragment='\n'.repeat(source.slice(0,begin).split('\n').length-1)+source.slice(begin,end);
const py=String.raw`import socket,ssl,struct,time,sys,gzip
s=ssl._create_unverified_context().wrap_socket(socket.socket(),server_hostname='localhost');s.settimeout(2);s.connect(('127.0.0.1',int(sys.argv[1])));case=sys.argv[2]
if case=='upload-reset':
 s.sendall(b'POST /api/upload HTTP/1.1\r\nHost: localhost\r\nContent-Length: 1000000\r\n\r\n'+b'x'*16384);time.sleep(.1)
elif case=='websocket-client-reset':
 s.sendall(b'GET /ws HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');s.recv(4096)
else:
 s.sendall(b'GET /stream HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');first=s.recv(4096)
 if case=='encoded-gzip':
  data=first
  while True:
   block=s.recv(4096)
   if not block:break
   data+=block
  headers,body=data.split(b'\r\n\r\n',1);assert b'content-encoding: gzip' in headers.lower();assert gzip.decompress(body)=='中文'.encode()*1000;s.close();sys.exit(0)
 if case=='upstream-reset':
  try:
   while s.recv(4096):pass
  except (OSError,ssl.SSLError):pass
  s.close();sys.exit(0)
s.setsockopt(socket.SOL_SOCKET,socket.SO_LINGER,struct.pack('ii',1,0));s.close()
`;
const results=[];
try{for(const test of ['upload-reset','upstream-reset','websocket-client-reset','download-client-reset','encoded-gzip']){
 const child=`import{createServer as createHttpsServer}from'node:https';import{createServer,request as httpRequest}from'node:http';import{connect}from'node:net';import{Readable}from'node:stream';import{pipeline}from'node:stream/promises';import{gzipSync}from'node:zlib';import{spawn}from'node:child_process';import{readFile}from'node:fs/promises';import{resolve}from'node:path';
const reportTransport=(stage,error)=>console.log(JSON.stringify({stage,code:['ECONNRESET','EPIPE','ERR_STREAM_PREMATURE_CLOSE','ABORT_ERR'].includes(error.code)?error.code:'TRANSPORT_FAILED'}));const test=${JSON.stringify(test)};let upstreamSeen=0,upstreamClosed=false,bytesWritten=0;process.on('uncaughtExceptionMonitor',error=>{console.log(JSON.stringify({test,uncaught:true,errorClass:error.name,code:['ECONNRESET','EPIPE','ERR_STREAM_PREMATURE_CLOSE'].includes(error.code)?error.code:'other',scriptSources:[...String(error.stack).matchAll(/native-artifact-serve\\.mjs:(\\d+)/g)].map(m=>Number(m[1])),upstreamSeen,upstreamClosed,bytesWritten}))});
const origin=createServer((req,res)=>{upstreamSeen++;req.on('error',()=>{});req.on('data',()=>{});res.on('error',()=>{});res.on('close',()=>{upstreamClosed=true});if(test==='upload-reset')return;if(test==='encoded-gzip'){const encoded=gzipSync(Buffer.from('中文'.repeat(1000)));bytesWritten=encoded.length;res.writeHead(200,{'content-encoding':'gzip','content-length':encoded.length});res.end(encoded);return}res.writeHead(200,{'content-length':10000000,'content-type':'application/octet-stream'});res.write(Buffer.alloc(16384));bytesWritten+=16384;if(test==='upstream-reset')setTimeout(()=>res.socket?.resetAndDestroy(),20);else{const timer=setInterval(()=>{res.write(Buffer.alloc(16384));bytesWritten+=16384},10);res.once('close',()=>clearInterval(timer))}});origin.on('upgrade',(req,socket)=>{upstreamSeen++;socket.on('error',()=>{});socket.on('close',()=>upstreamClosed=true);socket.write('HTTP/1.1 101 Switching Protocols\\r\\nConnection: Upgrade\\r\\nUpgrade: websocket\\r\\n\\r\\n');const timer=setInterval(()=>{socket.write('x'.repeat(1000));bytesWritten+=1000},10);socket.once('close',()=>clearInterval(timer))});await new Promise(r=>origin.listen(0,'127.0.0.1',r));const apiPort=origin.address().port,backend='http://127.0.0.1:'+apiPort,gateway={url:backend},editorBase='https://artifact.localhost',images=new Map(),tls=${JSON.stringify(dir)},cert=await readFile(resolve(tls,'cert.pem')),isolatedEditor=async()=>null;
const {server}=await (new (Object.getPrototypeOf(async function(){}).constructor)('createHttpsServer','httpRequest','connect','Readable','resolve','readFile','tls','cert','editorBase','backend','gateway','images','isolatedEditor','apiPort','pipeline','reportTransport',${JSON.stringify(fragment+'\nreturn {server,rawFetch};\n//# sourceURL=/workspace/LingxiLoop/scripts/native-artifact-serve.mjs')})(createHttpsServer,httpRequest,connect,Readable,resolve,readFile,tls,cert,editorBase,backend,gateway,images,isolatedEditor,apiPort,pipeline,reportTransport));await new Promise(r=>server.listen(0,'127.0.0.1',r));const client=spawn('python',['-c',${JSON.stringify(py)},String(server.address().port),test],{stdio:'ignore'});client.on('exit',code=>console.log(JSON.stringify({test,clientExit:code})));setTimeout(()=>{console.log(JSON.stringify({test,survived:true,upstreamSeen,upstreamClosed,bytesWritten}));process.exit(0)},1000);
`;
 const r=spawnSync(process.execPath,['--input-type=module','-'],{input:child,encoding:'utf8',timeout:5000,maxBuffer:1000000});const result={test,exitCode:r.status,timedOut:r.error?.code==='ETIMEDOUT',observations:r.stdout.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)),unhandledStreamError:r.stderr.includes("Unhandled 'error' event")};results.push(result);console.log(JSON.stringify(result));assert.equal(result.exitCode,0);assert.equal(result.timedOut,false);assert.equal(result.unhandledStreamError,false);assert.ok(result.observations.some(row=>row.clientExit===0));const final=result.observations.find(row=>row.survived);assert.ok(final);assert.equal(final.upstreamSeen,1);assert.equal(final.upstreamClosed,true,'browser cancellation must close the upstream');assert.ok(final.bytesWritten<1000000,'cancelled streams must stop writing');
}}finally{rmSync(dir,{recursive:true,force:true})}
console.log(JSON.stringify({scope:'current proxy fragment; localhost HTTP/TLS/socket fixture, not actual SDK/API reproduction',nodeVersion:process.version,passed:results.length}));

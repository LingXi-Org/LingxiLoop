import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {extractDocumentText} from '@lyyzka/lingxios';
try {
 const hash=b=>createHash('sha256').update(b).digest('hex');
 assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.ok(process.report.getReport().header.glibcVersionRuntime);
 assert.equal(existsSync('node_modules/@napi-rs/canvas-linux-x64-musl/skia.linux-x64-musl.node'),false);
 const require=createRequire(resolve('package.json'));const {createCanvas}=require('@napi-rs/canvas');
 const canvas=createCanvas(17,13);canvas.getContext('2d').fillRect(1,2,8,6);const png=canvas.toBuffer('image/png');
 assert.ok(Object.keys(require.cache).some(x=>x.endsWith('/canvas-linux-x64-gnu/skia.linux-x64-gnu.node')));
 assert.equal(png.length,115);assert.equal(hash(png),'37bb849c8331759b4b7b6ec3e959f1e60b4b5bfbf9dcd4a4b711ae0c406ca5c0');
 const fixture=Buffer.from('JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA1OTUgODQyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA0IDAgUiA+PiA+PiAvQ29udGVudHMgNSAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggMTUzID4+CnN0cmVhbQpCVCAvRjEgMTIgVGYgNTAgNzYwIFRkIChUcmlhbmdsZSBhcmVhOiBiYXNlIHRpbWVzIHBlcnBlbmRpY3VsYXIgaGVpZ2h0IGRpdmlkZWQgYnkgdHdvLikgVGogMCAtMjAgVGQgKFR3byBjb25ncnVlbnQgdHJpYW5nbGVzIGNhbiBmb3JtIGEgcmVjdGFuZ2xlLikgVGogRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNDEgMDAwMDAgbiAKMDAwMDAwMDMxMSAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjUxNQolJUVPRgo=','base64');assert.equal(hash(fixture),'33aaa4a900cc81178a5c9c312bc0126b81805423e483e498a9c9b0d423c0a10e');
 const pdf=Buffer.from(await extractDocumentText(fixture,'pdf'));
 assert.equal(pdf.length,201);assert.equal(hash(pdf),'30ee46cdb0878604ece1e00fab7a9807f3db64ff443a48e6dc2fe4a5646a5e04');
 console.log('CANDIDATE_NATIVE_PROBE='+JSON.stringify({passed:true,platform:'linux/x64/glibc',gnuSelected:true,muslAbsent:true,pngBytes:png.length,pngSha256:hash(png),pdfBytes:pdf.length,pdfSha256:hash(pdf),publicFixtureSha256:hash(fixture)}));
} catch { console.error('CANDIDATE_NATIVE_PROBE_FAILED');process.exitCode=1; }

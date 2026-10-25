import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertHostComposeChange} from './host-release-compose.mjs';
const a='a'.repeat(40),b='b'.repeat(40),image='accel.way2api.fun/ghcr.io/lingxi-org/lingxiloop-server:';
const original=readFileSync('deploy/komodo/lingxiloop-app-a/compose.yml','utf8').replaceAll(/(?<=lingxiloop-server:)[a-f0-9]{40}/g,a);
const pin=original.replaceAll(image+a,image+b),target=pin.replace('    OPENAI_MODEL:', '    OPENAI_VISION_MODEL: Qwen/Qwen3-VL-32B-Instruct\n    OPENAI_MODEL:');
const activation={key:'OPENAI_VISION_MODEL',source:'absent',target:'Qwen/Qwen3-VL-32B-Instruct',providerProofSha256:'a'.repeat(64)};
test('vision optin permits fixed Web/Worker literal and preparation pull policy only',()=>{
 assert.equal(assertHostComposeChange(original,target,a,b,'never',activation),true);
 assert.equal(assertHostComposeChange(target,target.replace('  pull_policy: never','  pull_policy: always'),b,b,'always',activation),true);
 assert.throws(()=>assertHostComposeChange(original,target,a,b));
 for(const bad of [target.replace('Qwen/Qwen3-VL-32B-Instruct','other'),target.replace('OPENAI_BASE_URL:-https://api.siliconflow.cn/v1','OPENAI_BASE_URL:-https://other.example/v1'),target.replace('OPENAI_MODEL:-deepseek-ai/DeepSeek-V4.1-Flash','OPENAI_MODEL:-other'),target.replace('    DATABASE_POOL_MAX:', '    OTHER: changed\n    DATABASE_POOL_MAX:')])assert.throws(()=>assertHostComposeChange(original,bad,a,b,'never',activation));
});

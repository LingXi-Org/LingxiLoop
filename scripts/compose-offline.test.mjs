// Failure model: Windows plugin discovery needs ProgramFiles, while public
// Compose parsing must never inherit product secrets or Docker remote settings.
import test from 'node:test';
import assert from 'node:assert/strict';
import {offlineComposeEnvironment} from './compose-offline.mjs';
test('offline Compose forwards only PATH and the Windows system plugin directory',()=>{
 const env={PATH:'tools',ProgramFiles:'system-programs',KOMODO_API_SECRET:'never',DATABASE_URL:'never',DOCKER_HOST:'never',DOCKER_CONFIG:'never'};
 assert.deepEqual(offlineComposeEnvironment(env,'win32'),{PATH:'tools',ProgramFiles:'system-programs'});
 assert.deepEqual(offlineComposeEnvironment(env,'linux'),{PATH:'tools'});
 assert.deepEqual(offlineComposeEnvironment({PATH:'tools'},'win32'),{PATH:'tools'});
});

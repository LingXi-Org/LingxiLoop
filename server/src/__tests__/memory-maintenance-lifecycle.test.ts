import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const source = new URL('../', import.meta.url)

for (const failure of ['none', 'operation', 'arguments', 'control', 'subscriber', 'redis', 'database']) {
  test(`memory maintenance closes every resource and exits naturally: ${failure}`, () => {
    const script = `
      import { mock } from 'node:test';
      const events = [], failure = ${JSON.stringify(failure)};
      const subscriberHandle = setInterval(() => {}, 1000);
      const redisHandle = setInterval(() => {}, 1000);
      const dispose = name => { events.push(name); if (failure === name) throw Error('PRIVATE_CLEANUP_SENTINEL'); };
      mock.module('@lyyzka/lingxios', { namedExports: {
        readRunReference: async () => ({tenantId:'fixture-company',principalId:'fixture-principal',runId:'fixture-run'})
      }});
      mock.module(${JSON.stringify(new URL('db/pool.ts', source).href)}, { namedExports: {
        pool: {end: async () => events.push('primary-pool-only')}, closeDatabasePools: async () => dispose('database')
      }});
      mock.module(${JSON.stringify(new URL('redis.ts', source).href)}, { namedExports: {
        sub: {disconnect: () => {clearInterval(subscriberHandle);dispose('subscriber')}},
        redis: {disconnect: () => {clearInterval(redisHandle);dispose('redis')}}
      }});
      mock.module(${JSON.stringify(new URL('agent-runtime/runtime.ts', source).href)}, { namedExports: {
        prepareLingxiOSWorkerContext: () => {},
        lingxiOSControl: async () => ({memory:{migrateLegacy:async () => {
          if(failure === 'operation') throw Error('synthetic operation failure');
          return {items:[],nextCursor:null};
        }}}), stopLingxiOSControl: async () => dispose('control')
      }});
      process.argv = failure === 'arguments' ? ['node','memory-maintenance'] :
        ['node','memory-maintenance','fixture-company','fixture-principal','fixture-run','inspect'];
      let rejected = false;
      try { await import(${JSON.stringify(new URL('bin/memory-maintenance.ts', source).href)}); }
      catch (error) { rejected = true; process.exitCode = 1; if (['control','subscriber','redis','database'].includes(failure)) console.error(error); }
      console.log('CLI_LIFECYCLE=' + JSON.stringify({events,rejected}));
    `
    const child = spawnSync(process.execPath, ['--import', 'tsx', '--experimental-test-module-mocks', '--input-type=module', '-e', script], {
      cwd: new URL('../../../', import.meta.url), encoding: 'utf8', timeout: 5000,
    })
    assert.ifError(child.error)
    assert.equal(child.signal, null)
    assert.doesNotMatch(child.stdout + child.stderr, /PRIVATE_CLEANUP_SENTINEL/)
    assert.equal(child.status, failure === 'none' ? 0 : 1, child.stderr)
    const line = child.stdout.split('\n').find(value => value.startsWith('CLI_LIFECYCLE='))
    assert.ok(line, child.stdout)
    assert.deepEqual(JSON.parse(line.slice('CLI_LIFECYCLE='.length)), {
      events: ['control', 'subscriber', 'redis', 'database'], rejected: failure !== 'none',
    })
  })
}

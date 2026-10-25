import { fixture } from './fake-host.mjs'
const f = fixture(process.argv[2],{ afterSideEffect:name => { if (name === 'forward:up:worker') process.exit(23) } })
await f.executor.run('release-495:main-runtime-a:apply')
process.exit(24)

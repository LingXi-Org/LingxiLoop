import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, matchesGlob, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'
import { computeScope } from './ci-scope.mjs'
import { updateImageTags } from './update-deployment-images.mjs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function pdfPruneFixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'pdf-prune-office-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const put = (path, value) => {
    mkdirSync(resolve(directory, path, '..'), { recursive: true })
    writeFileSync(join(directory, path), value)
  }
  const pdf = 'node_modules/pdfjs-dist/', office = 'node_modules/officeparser/'
  put('node_modules/.package-lock.json', '{"pdfjs-dist":{}}')
  put('node_modules/@lyyzka/lingxios/package.json', '{"dependencies":{"pdfjs-dist":"6.3.289"}}')
  put('node_modules/@lyyzka/lingxios/dist/src/context/document-worker.js', "import('pdfjs-dist/legacy/build/pdf.mjs'); import.meta.resolve('pdfjs-dist/package.json')")
  put(pdf + 'package.json', '{"name":"pdfjs-dist","version":"6.3.289","main":"build/pdf.mjs"}')
  for (const path of ['LICENSE', 'types/src/pdf.d.ts', 'build/pdf.mjs', 'build/pdf.worker.min.mjs',
    'legacy/build/pdf.mjs', 'legacy/build/pdf.worker.mjs', 'legacy/build/pdf.mjs.map',
    'cmaps/LICENSE', 'standard_fonts/LICENSE_FOXIT', 'standard_fonts/LICENSE_LIBERATION',
    'wasm/LICENSE_PDFJS_JBIG2', 'wasm/LICENSE_PDFJS_OPENJPEG', 'iccs/profile.bin',
    'image_decoders/decoder.mjs', 'legacy/image_decoders/decoder.mjs']) put(pdf + path, 'retained')
  for (const path of ['web/viewer.mjs', 'legacy/web/viewer.mjs', 'build/pdf.mjs.map',
    'build/pdf.worker.mjs.map', 'build/pdf.sandbox.mjs.map']) put(pdf + path, 'trimmed')
  put(office + 'package.json', '{"name":"officeparser","version":"8.2.0","dependencies":{"pdfjs-dist":"6.2.108"}}')
  for (const path of ['dist/defaults.js', 'dist/officeparser.browser.d.ts', 'dist/officeparser.browser.iife.js',
    'dist/officeparser.browser.mjs', 'dist/officeparser.browser.native-pdf.mjs',
    'dist/officeparser.browser.slim.d.ts', 'dist/officeparser.browser.slim.iife.js',
    'dist/officeparser.browser.slim.mjs', 'dist/parsers/PdfParser.d.ts', 'dist/parsers/PdfParser.js',
    'dist/types.d.ts', 'dist/utils/envUtils.d.ts', 'dist/utils/envUtils.js',
    'dist/utils/moduleLoader.d.ts', 'dist/utils/moduleLoader.js']) put(office + path, '// pdfjs-dist')
  const nested = office + 'node_modules/pdfjs-dist/'
  put(nested + 'package.json', '{"name":"pdfjs-dist","version":"6.2.108","main":"build/pdf.mjs"}')
  for (const path of ['build/pdf.mjs', 'legacy/build/pdf.mjs', 'legacy/build/pdf.worker.mjs',
    'web/viewer.mjs', 'cmaps/map.bcmap', 'standard_fonts/font.pfb', 'wasm/decoder.wasm', 'LICENSE']) put(nested + path, 'nested retained')
  const run = () => spawnSync(process.execPath, [fileURLToPath(new URL('./prune-pdfjs-server-runtime.mjs', import.meta.url)), join(directory, pdf), '--apply'],
    { encoding: 'utf8', timeout: 10000, env: { PATH: process.env.PATH } })
  const inventory = (path) => readdirSync(join(directory, path), { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile()).map(entry => {
      const full = join(entry.parentPath, entry.name)
      return [relative(join(directory, path), full), readFileSync(full).toString('base64')]
    }).sort((a, b) => a[0].localeCompare(b[0]))
  return { directory, pdf, office, nested, put, run, inventory }
}

test('PDF.js prune accepts pinned officeparser consumers and preserves its separate PDF runtime byte-for-byte', t => {
  const f = pdfPruneFixture(t), nested = f.inventory(f.nested), result = f.run()
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.removedFiles, 5)
  assert.deepEqual(f.inventory(f.nested), nested)
  assert.ok(f.inventory(f.pdf).some(([path]) => path === 'legacy/build/pdf.worker.mjs'))
  assert.ok(f.inventory(f.pdf).some(([path]) => path === 'cmaps/LICENSE'))
  assert.ok(f.inventory(f.pdf).every(([path]) => !path.startsWith('web/') && !path.startsWith('legacy/web/')))
})
test('PDF.js prune rejects an unreviewed officeparser consumer before removing any file', t => {
  const f = pdfPruneFixture(t)
  f.put(f.office + 'dist/new-consumer.js', "import('pdfjs-dist/web/pdf_viewer.mjs')")
  const before = f.inventory(f.pdf), result = f.run()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Re-audit PDF.js consumers/)
  assert.deepEqual(f.inventory(f.pdf), before)
})
test('PDF.js prune rejects officeparser falling back to the top-level runtime before trimming', t => {
  const f = pdfPruneFixture(t), before = f.inventory(f.pdf)
  rmSync(join(f.directory, f.nested), { recursive: true })
  const result = f.run()
  assert.notEqual(result.status, 0)
  assert.deepEqual(f.inventory(f.pdf), before)
})

// Failures: sync deploys an application before the worker stop; an old worker acknowledges a new effect.
test('production stops both old workers before an application can enqueue new effect kinds', () => {
  const resources = read('deploy/komodo/resources.toml')
  const stages = [...resources.matchAll(/\[\[procedure\.config\.stage\]\]\s*name = "([^"]+)"([\s\S]*?)(?=\[\[procedure\.config\.stage\]\]|$)/g)]
  const stopIndex = stages.findIndex(([, name]) => name === 'Stop old workers')
  assert.ok(stopIndex >= 0)
  for (const stack of ['lingxiloop-app-a', 'lingxiloop-app-b']) {
    const definition = resources.match(new RegExp(`\\[\\[stack\\]\\]\\s*name = "${stack}"([\\s\\S]*?)(?=\\[\\[stack\\]\\]|\\[\\[procedure\\]\\]|$)`))?.[1]
    assert.match(definition ?? '', /^deploy = false$/m, `${stack} must not deploy during RunSync`)
    assert.match(stages[stopIndex][2], new RegExp(`execution\\.type = "StopStack", execution\\.params\\.stack = "${stack}", execution\\.params\\.services = \\["worker"\\]`))
  }
  for (const name of ['Application A', 'Application B']) {
    assert.ok(stopIndex < stages.findIndex(([, stage]) => stage === name))
  }
})

// Failure: development resolves shared imports that the production image never copies.
test('server image includes the complete shared runtime import graph', () => {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const copied = read('server/docker/lingxiloop-server.Dockerfile').split(/^FROM /m).at(-1).split(/\r?\n/)
    .filter(line => /^COPY (?:src|shared)[ /]/.test(line)).flatMap(line => line.trim().split(/\s+/).slice(1, -1))
  assert.deepEqual(copied.filter(path => path.startsWith('src/features/cases/cover-vm')), [
    'runtime', 'protocol', 'program', 'guest-source', 'svg',
  ].map(name => `src/features/cases/cover-vm/${name}.ts`), 'Server ships only the five shared VM sources')
  const pending = [
    ...ts.sys.readDirectory(resolve(root, 'server/src'), ['.ts'], ['**/*.test.ts', '**/__tests__/**', '**/__integration__/**']),
    ...copied.filter(path => path.endsWith('.ts')).map(path => resolve(root, path)),
  ]
  const visited = new Set(), missing = new Set()
  for (const file of pending) {
    if (visited.has(file)) continue
    visited.add(file)
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const visit = node => {
      let specifier
      if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly
        && (!node.importClause?.namedBindings || !ts.isNamedImports(node.importClause.namedBindings)
          || node.importClause.name || node.importClause.namedBindings.elements.some(item => !item.isTypeOnly))) specifier = node.moduleSpecifier
      if (ts.isExportDeclaration(node) && !node.isTypeOnly
        && (!node.exportClause || !ts.isNamedExports(node.exportClause) || node.exportClause.elements.some(item => !item.isTypeOnly))) specifier = node.moduleSpecifier
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) specifier = node.arguments[0]
      if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('.')) {
        const target = ts.resolveModuleName(specifier.text, file,
          { moduleResolution: ts.ModuleResolutionKind.Bundler }, ts.sys).resolvedModule?.resolvedFileName
        assert.ok(target, `Unresolved runtime import ${specifier.text} from ${relative(root, file)}`)
        const path = relative(root, target).replaceAll('\\', '/')
        if (path.startsWith('src/') || path.startsWith('shared/')) {
          if (!copied.some(item => path === item || path.startsWith(`${item}/`))) missing.add(path)
          pending.push(target)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  assert.deepEqual([...missing].sort(), [])
})

// Failures: the final image carries desktop/reference source, or slimming drops
// the immutable skill, the one served upstream script, or license/provenance.
test('server image ships only the required pinned ZCode runtime payload', () => {
  const finalStage = read('server/docker/lingxiloop-server.Dockerfile').split(/^FROM /m).at(-1)
  const root = fileURLToPath(new URL('../', import.meta.url))
  const copied = finalStage.split(/\r?\n/).filter(line => /^COPY third_party\/zcode[ /]/.test(line))
    .flatMap(line => {
      const [, ...args] = line.trim().split(/\s+/), destination = args.pop()
      return args.map(source => ({ source, destination: resolve(root, destination) }))
    })
  const packaged = path => copied.some(({ source, destination }) => {
    if (path !== source && !path.startsWith(`${source}/`)) return false
    const suffix = ts.sys.directoryExists(resolve(root, source)) ? path.slice(source.length + 1) : source.split('/').at(-1)
    // COPY of one file to an exact filename does not append that filename.
    const target = !ts.sys.directoryExists(resolve(root, source)) && destination === resolve(root, path)
      ? destination : resolve(destination, suffix)
    return target === resolve(root, path)
  })
  const manifest = JSON.parse(read('third_party/zcode/manifest.json'))
  const runtimeScript = 'upstream/packages/desktop/src/renderer/src/plugin-sandbox/genUiTweakRuntime.js'
  for (const file of manifest.files.filter(file => file.kind === 'skill')) {
    assert.ok(packaged(`third_party/zcode/${file.path}`), `Missing skill runtime file: ${file.path}`)
  }
  assert.ok(packaged(`third_party/zcode/${runtimeScript}`), 'Missing served tweak.js source')
  for (const path of ['LICENSE', 'README.md', 'manifest.json']) {
    assert.ok(packaged(`third_party/zcode/${path}`), `Missing license or provenance: ${path}`)
  }
  const shippedReferenceSource = manifest.files.filter(file => file.path.startsWith('upstream/')
    && file.path !== runtimeScript && file.path !== 'upstream/LICENSE'
    && packaged(`third_party/zcode/${file.path}`)).map(file => file.path)
  assert.deepEqual(shippedReferenceSource, [], 'Reference/build source must stay out of the final runtime image')
  const payloadBytes = ts.sys.readDirectory(resolve(root, 'third_party/zcode'), undefined)
    .filter(file => packaged(relative(root, file).replaceAll('\\', '/')))
    .reduce((bytes, file) => bytes + readFileSync(file).byteLength, 0)
  assert.ok(payloadBytes <= 1_250_000, `Pinned ZCode runtime payload exceeds 1.25 MB: ${payloadBytes}`)
  const spaStage = read('server/docker/lingxiloop-server.Dockerfile').split(/^FROM /m)
    .find(part => /^.* AS spa-build\r?\n/.test(part))
  assert.match(spaStage, /^COPY third_party\/zcode \.\/third_party\/zcode$/m,
    'SPA build still requires the complete pinned upstream inputs')
})

// Failure: checkout resolves frontend imports that COPY or the build context omits.
test('SPA image includes the transitive source graph and pinned vendor license', () => {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const stage = read('server/docker/lingxiloop-server.Dockerfile').split(/^FROM /m)
    .find(part => /^.* AS spa-build\r?\n/.test(part))
  assert.ok(stage, 'SPA build stage exists')
  const copied = stage.split(/\r?\n/).filter(line => /^COPY /.test(line)).flatMap(line => {
    const [, ...args] = line.trim().split(/\s+/), destination = args.pop()
    return args.map(source => ({ source, destination: resolve(root, destination) }))
  })
  const patterns = read('server/docker/lingxiloop-server.Dockerfile.dockerignore')
    .split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'))
  const inContext = path => {
    const ancestors = path.split('/').map((_, index, parts) => parts.slice(0, index + 1).join('/'))
    let included = true
    for (const rule of patterns) {
      const pattern = rule.startsWith('!') ? rule.slice(1) : rule
      if (ancestors.some(parent => matchesGlob(parent, pattern))) included = rule.startsWith('!')
    }
    return included
  }
  const packaged = path => inContext(path) && copied.some(({ source, destination }) => {
    if (path !== source && !path.startsWith(`${source}/`)) return false
    const suffix = ts.sys.directoryExists(resolve(root, source)) ? path.slice(source.length + 1) : source.split('/').at(-1)
    return resolve(destination, suffix) === resolve(root, path)
  })
  for (const name of ['runtime.ts', 'protocol.ts', 'program.ts', 'guest-source.ts', 'svg.ts', 'session.ts', 'worker.ts', 'CaseCoverPreview.tsx']) {
    assert.ok(inContext(`src/features/cases/cover-vm/${name}`), `Missing cover source in SPA context: ${name}`)
  }
  for (const name of ['verify-package.mjs', 'guest.ts', 'guest-entry.ts', 'build-guest.mjs', 'guest.test.ts', 'session.test.ts']) {
    assert.equal(inContext(`src/features/cases/cover-vm/${name}`), false, `Cover build/test input must stay out of image context: ${name}`)
  }
  const pathOf = file => relative(root, file).replaceAll('\\', '/')
  const options = { moduleResolution: ts.ModuleResolutionKind.Bundler, baseUrl: root, paths: { '@/*': ['src/*'] } }
  const pending = ts.sys.readDirectory(resolve(root, 'src'), ['.ts', '.tsx'])
    .filter(file => inContext(pathOf(file)))
  const visited = new Set(), missing = new Set()
  for (const file of pending) {
    if (visited.has(file)) continue
    visited.add(file)
    const path = pathOf(file)
    if (!packaged(path)) missing.add(path)
    for (const specifier of ts.preProcessFile(readFileSync(file, 'utf8'), true, true).importedFiles) {
      if (!specifier.fileName.startsWith('.') && !specifier.fileName.startsWith('@/')) continue
      const resolved = ts.resolveModuleName(specifier.fileName, file, options, ts.sys).resolvedModule?.resolvedFileName
      if (resolved && !resolved.includes('/node_modules/')) pending.push(resolved)
    }
  }
  assert.deepEqual([...missing].sort(), [], 'SPA COPY and context must include every transitive source input')
  for (const name of ['LICENSE', 'SHA256SUMS', 'README.md']) {
    const path = `third_party/assistant-ui/streaming-text/${name}`
    assert.ok(packaged(path), `Pinned vendor attribution missing from SPA stage: ${path}`)
    assert.ok(read(path).length > 0)
  }
  const finalStage = read('server/docker/lingxiloop-server.Dockerfile').split(/^FROM /m).at(-1)
  assert.match(finalStage, /^COPY third_party\/assistant-ui\/streaming-text\/LICENSE \.\/dist\/licenses\/assistant-ui-streaming-text\.txt$/m,
    'The shipped SPA must retain the upstream MIT notice')
  for (const [source, target] of [
    ['third_party/assistant-ui-elements/LICENSE', 'assistant-ui-elements.txt'],
    ['third_party/react-chat-elements/reply-message/LICENSE', 'react-chat-elements-reply-message.txt'],
  ]) {
    assert.ok(inContext(source), `Distributed component license missing from build context: ${source}`)
    assert.ok(finalStage.includes(`COPY ${source} ./dist/licenses/${target}`), `Distributed component license missing from final image: ${source}`)
    assert.match(read(source), /Permission is hereby granted/)
  }
})

test('production Open Notebook receives only the explicit RAG environment', () => {
  const compose = read('deploy/komodo/lingxiloop-knowledge-agent/compose.yml')
  const service = compose.slice(compose.indexOf('  open-notebook:'))

  assert.doesNotMatch(service, /env_file:/)
  for (const variable of [
    'OPEN_NOTEBOOK_PASSWORD',
    'OPEN_NOTEBOOK_SURREAL_PASSWORD',
    'R2_ENDPOINT',
    'R2_BUCKET',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'OPENAI_EMBEDDING_MODEL',
  ]) assert.match(service, new RegExp(`${variable}:`))
  assert.match(service, /OPENAI_API_KEY: \$\{OPEN_NOTEBOOK_PASSWORD:\?/)
  assert.match(service, /OPENAI_BASE_URL: "\$\{LINGXILOOP_PUBLIC_ORIGIN:\?[^}]+}\/internal\/open-notebook\/v1"/)
  assert.match(service, /OPENAI_EMBEDDING_MODEL: \$\{OPENAI_EMBEDDING_MODEL:-Pro\/BAAI\/bge-m3\}/)

  assert.match(service, /supervisorctl .* status rag-api/)
  assert.match(service, /supervisorctl .* status rag-worker/)
  assert.match(service, /http:\/\/localhost:5055\/readyz/)
  assert.doesNotMatch(compose, /SURREAL_EXPERIMENTAL_GRAPHQL/)
})

test('packaged and published stacks select the RAG-only image', () => {
  const packaged = read('docker-compose.mvp.yml')
  const workflow = read('.github/workflows/ci.yml')
  const scope = read('scripts/ci-scope.mjs')

  const packagedService = packaged.slice(packaged.indexOf('  open-notebook:'), packaged.indexOf('  wukongim:'))
  assert.match(packagedService, /image: .*lingxiloop-open-notebook/)
  assert.doesNotMatch(packagedService, /build:/)
  assert.match(scope, /'lingxiloop-open-notebook'[\s\S]*'lingxiloop-rag'/)
  assert.match(workflow, /needs: \[changes, checks, integration\]/)
  assert.match(workflow, /GITHUB_REPOSITORY_OWNER,,/)
  assert.match(workflow, /:\$\{\{ github\.sha \}\}/)
  assert.match(workflow, /platforms: linux\/amd64/)
  assert.match(workflow, /update-deployment-images\.mjs/)
  assert.match(workflow, /dorny\/paths-filter@v4[\s\S]*predicate-quantifier: some-with-excludes/)
  assert.doesNotMatch(workflow, /- 'third_party\/open-notebook\/\*\*'/)
  assert.doesNotMatch(workflow, /setup-qemu|:mvp/)
  assert.doesNotMatch(packaged, /8502/)
})

test('CI component matrix runs only checks enabled by the changed scope', () => {
  assert.deepEqual(computeScope({ web: true }).check_jobs, [{ component: 'web' }])
  assert.deepEqual(computeScope({ serverSource: true }).check_jobs, [{ component: 'server' }, { component: 'deploy-contract' }])
  assert.ok(computeScope({ deployment: true }).check_jobs.some(({ component }) => component === 'deploy-contract'))
  assert.ok(computeScope({}, 'release').check_jobs.some(({ component }) => component === 'release'))
})

test('the production image runs only the RAG API and worker', () => {
  const commands = read('third_party/open-notebook/rag_commands.py')
  const supervisor = read('third_party/open-notebook/supervisord.rag.conf')
  const dockerfile = read('third_party/open-notebook/Dockerfile')
  assert.equal((commands.match(/@command\(/g) ?? []).length, 1)
  assert.match(commands, /@command\(\s*"process_source"/)
  assert.deepEqual(
    [...supervisor.matchAll(/^\[program:([^\]]+)]/gm)].map((match) => match[1]),
    ['rag-api', 'rag-worker'],
  )
  assert.match(supervisor, /--import-modules rag_commands/)

  const ragStart = dockerfile.indexOf(' AS lingxiloop-rag')
  assert.ok(ragStart > 0, 'Dockerfile must contain the lingxiloop-rag target')
  const ragTarget = dockerfile.slice(ragStart)
  assert.doesNotMatch(ragTarget, /\nFROM /, 'RAG must be the default final target')
  assert.doesNotMatch(ragTarget, /node(?:js)?|8502|frontend/i)
  assert.match(dockerfile, /rag-backend-builder[\s\S]*uv sync --frozen --no-dev --no-default-groups/)
  assert.match(ragTarget, /supervisorctl -s unix:\/\/\/tmp\/supervisor\.sock status rag-api/)
  assert.match(ragTarget, /supervisorctl -s unix:\/\/\/tmp\/supervisor\.sock status rag-worker/)
})

test('removed Open Notebook capabilities cannot be re-enabled by deployment configuration', () => {
  const files = [
    '.env.example',
    'docker-compose.mvp.yml',
    'deploy/komodo/lingxiloop-knowledge-agent/compose.yml',
  ].map(read).join('\n')

  assert.doesNotMatch(files, /OPEN_NOTEBOOK_ENCRYPTION_KEY/)
  assert.doesNotMatch(files, /OPEN_NOTEBOOK_(?:CHAT|STRATEGY|ANSWER|FINAL_ANSWER)_MODEL/)
})

test('Komodo knowledge services receive writable storage and the control plane URL', () => {
  const compose = read('deploy/komodo/lingxiloop-knowledge-agent/compose.yml')

  assert.match(compose, /surrealdb:[\s\S]*?rocksdb:\/home\/nonroot\/open-notebook\.db/)
  assert.match(compose, /SURREAL_PASS: \$\{OPEN_NOTEBOOK_SURREAL_PASSWORD:\?OPEN_NOTEBOOK_SURREAL_PASSWORD is required}/)
  assert.doesNotMatch(compose, /--pass/)
  assert.match(compose, /10\.20\.0\.3:5056:5055/)
  assert.match(compose, /supervisorctl -s unix:\/\/\/tmp\/supervisor\.sock status rag-api/)
  assert.match(compose, /OPEN_NOTEBOOK_WORKER_MAX_TASKS: "1"/)
  assert.equal((compose.match(/\$\{LINGXILOOP_PUBLIC_ORIGIN:\?/g) ?? []).length, 1)
  assert.doesNotMatch(compose, /^ {2}agent-os:/m)
  assert.doesNotMatch(compose, /LINGXILOOP_INTERNAL_ORIGIN/)
})

test('Komodo runs isolated workers on both app nodes with bounded drain and readiness', () => {
  const appA = read('deploy/komodo/lingxiloop-app-a/compose.yml')
  const appB = read('deploy/komodo/lingxiloop-app-b/compose.yml')

  assert.match(appA, /10\.20\.0\.2:5183:5181/)
  assert.doesNotMatch(appA, /^ {2}gateway:/m)
  for (const app of [appA, appB]) {
    assert.match(app, /AGENT_OS_MAX_CONCURRENT_RUNS: \$\{AGENT_OS_MAX_CONCURRENT_RUNS:-2\}/)
    assert.match(app, /AGENT_OS_RESERVED_INTERACTIVE_RUNS: \$\{AGENT_OS_RESERVED_INTERACTIVE_RUNS:-1\}/)
    assert.match(app, /AGENT_OS_MODEL_CONCURRENCY: \$\{AGENT_OS_MODEL_CONCURRENCY:-2\}/)
    assert.match(app, /worker:\r?\n {4}<<: \*runtime/)
    assert.match(app, /NODE_OPTIONS: --max-old-space-size=640/)
    assert.match(app, /cpus: "1.0"/)
    assert.match(app, /mem_limit: 1g/)
    assert.match(app, /read_only: true/)
    assert.match(app, /stop_grace_period: 150s/)
    assert.match(app, /localhost:5190\/readyz/)
    assert.match(app, /LINGXIOS_R2_BUCKET:/)
    assert.match(app, /LINGXIOS_REALTIME_REDIS_URL: redis:\/\/10\.20\.0\.2:6381/)
  }
  assert.doesNotMatch(appA, /COMPOSE_PROFILES|profiles:/)
  assert.match(appB, /worker:\r?\n {4}<<: \*runtime/)
  assert.match(appB, /gateway:\r?\n {4}image: .*lingxiloop-gateway:[0-9a-f]{40}/)
  assert.match(appB, /127\.0\.0\.1:8081:8080/)
  assert.doesNotMatch(appB, /COMPOSE_PROFILES|profiles:/)
  assert.doesNotMatch(read('deploy/komodo/lingxiloop-app-b/gateway.Dockerfile'), /COPY website/)
  assert.doesNotMatch(`${appA}\n${appB}`, /AGENT_OS_URL/)
})

test('the gateway uses the备案 ingress and the Worker uses its admin domain', () => {
  const gateway = read('deploy/komodo/lingxiloop-app-b/gateway.conf')
  const core = read('deploy/komodo/lingxiloop-core-state/compose.yml')
  const worker = read('workers/control-plane/wrangler.jsonc')

  assert.match(gateway, /server 10\.20\.0\.2:5183/)
  assert.match(gateway, /server_name loop\.lingxilearn\.cn/)
  assert.match(gateway, /upstream control_plane \{[\s\S]*server admin\.lingxilearn\.cn:443 resolve;[\s\S]*keepalive 32;/)
  assert.match(gateway, /location \/api\/ \{[\s\S]*\$http_x_lingxiloop_gateway[\s\S]*return 418;[\s\S]*proxy_pass https:\/\/control_plane;[\s\S]*proxy_ssl_name admin\.lingxilearn\.cn;[\s\S]*proxy_set_header Connection "";/)
  assert.match(gateway, /location @origin_api \{[\s\S]*proxy_pass http:\/\/\$lingxiloop_api_upstream;/)
  assert.match(gateway, /server_name im\.lingxilearn\.cn/)
  assert.match(gateway, /proxy_pass http:\/\/10\.20\.0\.2:5201/)
  assert.match(core, /10\.20\.0\.2:5201:5200/)
  assert.doesNotMatch(core, /WUKONG_WS_BIND_IP/)
  assert.match(worker, /"routes": \[\{ "pattern": "admin\.lingxilearn\.cn", "custom_domain": true \}\]/)
  assert.match(worker, /"workers_dev": false/)
  assert.match(worker, /"ORIGIN_BASE_URL": "https:\/\/loop\.lingxilearn\.cn"/)
  assert.match(worker, /"AUTH_ALLOWED_HOSTS": "loop\.lingxilearn\.cn,admin\.lingxilearn\.cn"/)
})

test('live chat streams balance independently across both nodes through unbuffered proxy hops', () => {
  const gateway = read('deploy/komodo/lingxiloop-app-b/gateway.conf')
  const routing = gateway.match(/map \$uri \$lingxiloop_api_upstream \{([^}]+)\}/)?.[1]
  assert.ok(routing)
  assert.match(routing, /default lingxiloop_web;/)
  const route = new RegExp(routing.match(/~(\S+) lingxiloop_realtime;/)?.[1] ?? '(?!)')
  assert.ok(route.test('/api/im/companies/company/channels/room/agents/agent/runs/run/stream'))
  assert.ok(!route.test('/api/im/channels/room/agents/agent/runs/run'))
  const owner = gateway.match(/upstream lingxiloop_realtime \{([^}]+)\}/)?.[1]
  assert.ok(owner)
  assert.deepEqual(owner.match(/server [^;]+;/g), ['server lingxiloop:5181 resolve max_fails=2 fail_timeout=5s;', 'server 10.20.0.2:5183 max_fails=2 fail_timeout=5s;'])
  assert.match(owner, /least_conn;/)
  assert.match(owner, /keepalive 32;/)
  assert.match(gateway, /proxy_connect_timeout 3s;/)
  assert.doesNotMatch(gateway, /proxy_next_upstream[^;]*non_idempotent/)
  assert.match(read('deploy/komodo/lingxiloop-app-b/compose.yml'), /LINGXIOS_CONTROL_URL: http:\/\/lingxiloop:5182/)
  for (const location of ['location /api/', 'location @origin_api']) {
    const block = gateway.slice(gateway.indexOf(location), gateway.indexOf('\n    }', gateway.indexOf(location)))
    assert.match(block, /proxy_buffering off;/)
    assert.match(block, /proxy_read_timeout 3600s;/)
  }
})

test('Komodo control plane and ingress keep management sockets private', () => {
  const manager = read('deploy/komodo/core/compose.yml')
  const controlIngress = read('deploy/komodo/control-ingress/compose.yml')
  const alyIngress = read('deploy/komodo/aly-ingress/compose.yml')
  const appIngress = read('deploy/komodo/server-b-ingress/compose.yml')
  const appRoutes = read('deploy/komodo/server-b-ingress/dynamic.yml')

  assert.match(manager, /komodo-core:2\.3\.3/)
  assert.match(manager, /127\.0\.0\.1:9120:9120/)
  assert.doesNotMatch(manager, /docker\.sock/)
  assert.doesNotMatch(`${controlIngress}\n${alyIngress}\n${appIngress}`, /docker\.sock|providers\.docker/)
  assert.match(appIngress, /80:80[\s\S]*443:443/)
  for (const host of ['lingxilearn.cn', 'www.lingxilearn.cn', 'loop.lingxilearn.cn', 'im.lingxilearn.cn', 'openlit.lingxilearn.cn', 'uptime.lingxilearn.cn']) {
    assert.match(appRoutes, new RegExp(host.replaceAll('.', '\\.')))
  }
})

test('main publishes changed images and rolls out a complete immutable release', () => {
  const workflow = read('.github/workflows/ci.yml')
  const serverImage = read('server/docker/lingxiloop-server.Dockerfile')

  assert.match(workflow, /options: \[[^\]]*release, deep-integration\]/)
  assert.match(workflow, /update-manifests:[\s\S]*needs: \[changes, checks, integration, publish\]/)
  assert.match(workflow, /needs\.publish\.result == 'success'[\s\S]*needs\.changes\.outputs\.deployment == 'true'/)
  assert.match(workflow, /deploy:[\s\S]*needs: \[changes, checks(?:, [^\]]+)?\]/)
  assert.match(workflow, /rollout:[\s\S]*needs: \[changes, update-manifests, deploy\]/)
  assert.match(workflow, /deploy:[\s\S]*run: npm run admin:build[\s\S]*control:d1:remote[\s\S]*wrangler versions upload[\s\S]*wrangler versions deploy/)
  assert.match(workflow, /control_migrations == 'true'[\s\S]*control:d1:remote/)
  assert.match(workflow, /update-deployment-images\.mjs "\$GITHUB_SHA" \$\{\{ needs\.changes\.outputs\.packages \}\}/)
  assert.match(workflow, /rollout:[\s\S]*trigger-komodo-rollout\.mjs/)
  assert.match(workflow, /KOMODO_WEBHOOK_SECRET: \$\{\{ secrets\.KOMODO_WEBHOOK_SECRET \}\}/)
  assert.match(workflow, /VITE_TURNSTILE_SITE_KEY=0x4AAAAAAEsX5eyOl1nAe5i9/)
  assert.match(serverImage, /ARG VITE_TURNSTILE_SITE_KEY=""[\s\S]*ENV VITE_TURNSTILE_SITE_KEY=\$\{VITE_TURNSTILE_SITE_KEY\}/)
  assert.doesNotMatch(workflow, /RELEASE_HMAC_SECRET|api\/internal\/releases/)
  assert.doesNotMatch(workflow, /pages deploy|PRODUCTION_SSH|run: .*deploy-production\.sh/)
})

test('all deployable LingxiLoop images use CI-managed unique tags', () => {
  const manifests = [
    'deploy/komodo/lingxiloop-app-a/compose.yml',
    'deploy/komodo/lingxiloop-app-b/compose.yml',
    'deploy/komodo/lingxiloop-core-state/compose.yml',
    'deploy/komodo/lingxiloop-knowledge-agent/compose.yml',
  ].map(read).join('\n')
  const references = [...manifests.matchAll(/image:\s+\S*lingxiloop-[^:\s]+:([^\s]+)/g)]
  assert.equal(references.length, 7)
  assert.ok(references.every((match) => /^[0-9a-f]{40}$/.test(match[1])))
  assert.equal(
    updateImageTags(`image: registry/lingxiloop-server:${'a'.repeat(40)}`, 'b'.repeat(40), ['server']),
    `image: registry/lingxiloop-server:${'b'.repeat(40)}`,
  )
  assert.equal(
    updateImageTags(
      `image: registry/lingxiloop-server:${'a'.repeat(40)}\nimage: registry/lingxiloop-wukongim:${'a'.repeat(40)}`,
      'b'.repeat(40),
      ['server'],
    ),
    `image: registry/lingxiloop-server:${'b'.repeat(40)}\nimage: registry/lingxiloop-wukongim:${'a'.repeat(40)}`,
  )
  assert.equal(
    updateImageTags(`image: accel.way2api.fun/ghcr.io/lyyzka/lingxiloop-server:${'a'.repeat(40)}`, 'b'.repeat(40), ['server'], 'LingXi-Org'),
    `image: accel.way2api.fun/ghcr.io/lingxi-org/lingxiloop-server:${'b'.repeat(40)}`,
  )
  assert.throws(() => updateImageTags('', 'b'.repeat(40), [], '../invalid'), /invalid image owner/)
})

test('CI selects checks and image publishing by component', () => {
  const web = computeScope({ web: true })
  assert.deepEqual(web.images.map(({ manifest }) => manifest), ['server'])
  assert.equal(web.web, true)
  assert.equal(web.server, false)

  const server = computeScope({ server: true, serverSource: true })
  assert.deepEqual(server.images.map(({ manifest }) => manifest), ['server'])
  assert.equal(server.integration, true)

  assert.equal(computeScope({ serverDocker: true }).packages, 'server')

  const knowledge = computeScope({ openNotebook: true })
  assert.deepEqual(knowledge.images.map(({ manifest }) => manifest), ['open-notebook'])
  assert.equal(knowledge.deploy_contract, true)

  const control = computeScope({ control: true, controlMigrations: true })
  assert.deepEqual(control.images, [])
  assert.equal(control.control_deploy, true)
  assert.equal(control.control_migrations, true)

  const sharedFrontend = computeScope({ sharedFrontend: true })
  assert.deepEqual(sharedFrontend.images.map(({ manifest }) => manifest), ['server'])
  assert.equal(sharedFrontend.server, true)
  assert.equal(sharedFrontend.integration, true)

  const testRunner = computeScope({ testRunner: true })
  assert.deepEqual(testRunner.images, [])
  assert.equal(testRunner.server, true)

  const deployment = computeScope({ deployment: true })
  assert.deepEqual(deployment.images, [])
  assert.equal(deployment.web, false)
  assert.equal(deployment.deploy_contract, true)

  assert.equal(computeScope({}, 'gateway').packages, 'gateway')
  assert.deepEqual(computeScope({}, 'release').images.map(({ manifest }) => manifest), ['server', 'wukongim', 'open-notebook', 'gateway'])
  assert.deepEqual(computeScope({ release: true }).images.map(({ manifest }) => manifest), ['server', 'wukongim', 'open-notebook', 'gateway'])
})

test('test and CI changes select checks without publishing; heavy experiments require manual scope', () => {
  for (const [flag, check] of [
    ['webTests', 'web'], ['adminTests', 'admin'], ['controlTests', 'control'],
    ['serverTests', 'server'], ['openNotebookTests', 'open_notebook'], ['ci', 'deploy_contract'],
  ]) {
    const scope = computeScope({ [flag]: true })
    assert.equal(scope[check], true, flag)
    assert.equal(scope.publish, false, flag)
    assert.equal(scope.control_deploy, false, flag)
    assert.equal(scope.web_build, false, flag)
    assert.equal(scope.admin_build, false, flag)
  }
  const selected = computeScope({ integrationTests: true, integrationFiles: [
    'server/src/__integration__/migration.test.ts', 'server/src/__integration__/deleted.test.ts',
  ] })
  assert.equal(selected.integration, true)
  assert.equal(selected.publish, false)
  assert.deepEqual(selected.integration_files, ['migration.test.ts'])
  assert.equal(selected.integration_mode, 'selected')
  assert.equal(computeScope({ integrationRunner: true }).integration_mode, 'smoke')
  assert.deepEqual(computeScope({ integrationRunner: true }).integration_files, [])
  const deep = computeScope({ release: true, web: true }, 'deep-integration')
  assert.equal(deep.integration_mode, 'full')
  assert.equal(deep.deep_integration, true)
  assert.equal(deep.integration, true)
  assert.deepEqual(deep.integration_files, [])
  assert.equal(deep.publish, false)
  assert.equal(deep.control_deploy, false)
  assert.equal(deep.deployment, false)
  for (const scope of ['web', 'admin-control', 'server', 'deployment', 'release']) {
    assert.equal(computeScope({}, scope).deep_integration, false, scope)
  }
  assert.throws(() => computeScope({}, 'typo'), /unknown CI scope/)
})

test('workflow path filters route real changed paths to their owning checks', () => {
  const workflow = read('.github/workflows/ci.yml')
  const filters = [...workflow.matchAll(/^            (\w+):\r?\n((?:              - '[^']+'\r?\n)+)/gm)]
    .map(([, name, lines]) => [name, [...lines.matchAll(/- '([^']+)'/g)].map(([, pattern]) => pattern)])
  assert.ok(filters.length > 15)
  assert.match(workflow, /if: matrix\.component == 'web'\r?\n\s+run: node --test --test-name-pattern='SPA image' scripts\/production-rag-contract\.test\.mjs/)
  const select = (file) => {
    const flags = Object.fromEntries(filters.map(([name, patterns]) => [
      name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
      patterns.some(pattern => !pattern.startsWith('!') && matchesGlob(file, pattern)) &&
      !patterns.some(pattern => pattern.startsWith('!') && matchesGlob(file, pattern.slice(1))),
    ]))
    return computeScope({ ...flags, integrationFiles: flags.integrationTests ? [file] : [], serverSourceFiles: flags.serverSource ? [file] : [], integrationRunnerFiles: flags.integrationRunner ? [file] : [] })
  }
  for (const [file, check, packages] of [
    ['src/features/chat/runtime/store.test.ts', 'web', ''],
    ['admin/src/management-session.test.ts', 'admin', ''],
    ['workers/control-plane/src/index.test.ts', 'control', ''],
    ['server/src/__tests__/gateway-auth.test.ts', 'server', ''],
    ['server/src/__integration__/migration.test.ts', 'integration', ''],
    ['src/features/settings/SettingsDialog.tsx', 'web', 'server'],
    ['server/src/auth.ts', 'integration', 'server'],
    ['src/lib/canvasLayout.ts', 'integration', 'server'],
    // Server runtime imports must not silently receive only Web checks.
    ['src/lib/mentions.ts', 'integration', 'server'],
    ['src/lib/memoryActivity.ts', 'integration', 'server'],
    ...['runtime', 'protocol', 'program', 'guest-source', 'svg'].map(name => [`src/features/cases/cover-vm/${name}.ts`, 'integration', 'server']),
    ['src/features/chat/visualize/zcode/shared/gen-ui/contract.ts', 'integration', 'server'],
    ['third_party/assistant-ui/streaming-text/upstream/utils/range.ts', 'web', 'server'],
    ['third_party/assistant-ui/streaming-text/LICENSE', 'web', 'server'],
    ['third_party/assistant-ui/streaming-text/SHA256SUMS', 'web', 'server'],
    ['third_party/assistant-ui-elements/LICENSE', 'web', 'server'],
    ['third_party/react-chat-elements/reply-message/LICENSE', 'web', 'server'],
    ['package-lock.json', 'integration', 'server'],
    ['.github/workflows/ci.yml', 'deploy_contract', ''],
    ['scripts/release-smoke.mjs', 'deploy_contract', ''],
    ['scripts/release-smoke.test.mjs', 'deploy_contract', ''],
    ['deploy/komodo/lingxiloop-app-a/compose.yml', 'deploy_contract', ''],
    ['third_party/open-notebook/tests/test_rag_contract.py', 'open_notebook', ''],
  ]) {
    const scope = select(file)
    assert.equal(scope[check], true, file)
    assert.equal(scope.packages, packages, file)
    assert.equal(scope.deep_integration, false, file)
  }
  assert.equal(select('third_party/open-notebook/frontend/src/app/page.tsx').checks, false)
  assert.deepEqual(select('server/src/__integration__/migration.test.ts').integration_files, ['migration.test.ts'])
  // The image's shared runtime inputs also need owning server checks. Cover
  // future additions instead of relying only on the examples above.
  const sharedSources = read('server/docker/lingxiloop-server.Dockerfile').split(/^FROM /m).at(-1).split(/\r?\n/)
    .filter(line => /^COPY (?:src|shared)[ /]/.test(line)).flatMap(line => line.trim().split(/\s+/).slice(1, -1))
    .flatMap(path => path.endsWith('.ts') ? [path] : ts.sys.readDirectory(path, ['.ts'], ['**/*.test.ts']))
  assert.ok(sharedSources.length > 10)
  for (const file of sharedSources) {
    const scope = select(file)
    assert.equal(scope.server, true, `server check missing for ${file}`)
    assert.equal(scope.integration, true, `integration missing for ${file}`)
    assert.notEqual(scope.integration_mode, 'full', `shared source must use bounded owning checks: ${file}`)
    if (file.startsWith('src/features/cases/cover-vm/')) assert.ok(scope.integration_files.includes('case-covers.test.ts'), file)
  }
})

test('actual workflow conditions block publishing and deployment after a failed or cancelled gate', () => {
  const workflow = read('.github/workflows/ci.yml')
  const allows = (job, scope, results = {}, event = 'push', publishOnly = false, message = '', options = {}) => {
    const block = workflow.match(new RegExp(`^  ${job}:\\r?\\n([\\s\\S]*?)(?=^  [a-z]|$(?![\\s\\S]))`, 'm'))?.[1]
    const expression = block?.match(/if: >-\r?\n([\s\S]*?)\r?\n    needs:/)?.[1]
    assert.ok(expression, job)
    const needs = { changes: { outputs: Object.fromEntries(Object.entries(scope).map(([key, value]) => [key, String(value)])) } }
    for (const name of ['checks', 'integration', 'publish', 'update-manifests', 'deploy']) {
      needs[name] = { result: results[name] ?? 'success' }
    }
    return Function('github', 'needs', 'always', 'inputs', 'contains', `return (${expression.replaceAll('needs.update-manifests', "needs['update-manifests']")})`)(
      { ref: options.ref ?? 'refs/heads/main', event_name: event, event: { head_commit: { message } } }, needs, () => true, { publish_only: publishOnly, scope: options.scope, deploy_admin_control: options.deployAdminControl ?? false }, (value, marker) => String(value ?? '').toLowerCase().includes(marker.toLowerCase()),
    )
  }
  const release = computeScope({}, 'release')
  for (const job of ['update-manifests', 'deploy', 'rollout']) {
    assert.equal(allows(job, { ...release, control_deploy: true }, {}, 'push', false, 'Merge development [skip deploy]'), false, job)
  }
  assert.equal(allows('publish', release, {}, 'push', false, 'Merge development [skip deploy]'), true, 'immutable publication and checks remain allowed')
  assert.equal(allows('publish', release), true)
  assert.equal(allows('publish', computeScope({}, 'server'), {}, 'workflow_dispatch', true), true)
  assert.equal(allows('update-manifests', release, {}, 'workflow_dispatch', true), false)
  for (const gate of ['checks', 'integration']) {
    for (const result of ['failure', 'cancelled']) {
      assert.equal(allows('publish', release, { [gate]: result }), false, `${gate}: ${result}`)
      assert.equal(allows('update-manifests', release, { [gate]: result }), false)
      assert.equal(allows('deploy', computeScope({ admin: true }), { [gate]: result }), false)
    }
  }
  assert.equal(allows('publish', computeScope({ web: true }), { integration: 'skipped' }), true)
  assert.equal(allows('update-manifests', computeScope({ ci: true }), { publish: 'skipped' }), false)
  assert.equal(allows('update-manifests', computeScope({ deployment: true }), { publish: 'skipped', integration: 'skipped' }), true)
  for (const job of ['publish', 'update-manifests', 'deploy']) {
    assert.equal(allows(job, computeScope({}, 'deep-integration'), {}, 'workflow_dispatch'), false, job)
  }
  for (const result of ['failure', 'cancelled']) {
    assert.equal(allows('rollout', release, { 'update-manifests': result }), false)
    assert.equal(allows('rollout', release, { deploy: result }), false)
  }
  // A manual admin release must opt in, build its own production assets and
  // leave product images, migrations and Komodo rollout outside its scope.
  const admin = computeScope({ release: true, controlMigrations: true, serverSource: true }, 'admin-control')
  const manual = { scope: 'admin-control', deployAdminControl: true }
  assert.deepEqual(admin.check_jobs, [{ component: 'admin' }, { component: 'control' }])
  for (const flag of ['integration', 'publish', 'deployment', 'release', 'control_migrations']) assert.equal(admin[flag], false, flag)
  assert.equal(allows('deploy', admin, { integration: 'skipped' }, 'workflow_dispatch', false, '', manual), true)
  assert.equal(allows('deploy', admin, {}, 'workflow_dispatch'), false, 'verification remains the default')
  assert.equal(allows('deploy', admin, {}, 'workflow_dispatch', true, '', manual), false, 'publish-only never deploys')
  assert.equal(allows('deploy', admin, {}, 'workflow_dispatch', false, '', { ...manual, scope: 'server' }), false)
  assert.equal(allows('deploy', admin, {}, 'workflow_dispatch', false, '', { ...manual, ref: 'refs/heads/topic' }), false)
  for (const gate of ['checks', 'integration']) for (const result of ['failure', 'cancelled']) {
    assert.equal(allows('deploy', admin, { [gate]: result }, 'workflow_dispatch', false, '', manual), false)
  }
  for (const job of ['publish', 'update-manifests', 'rollout']) {
    assert.equal(allows(job, admin, {}, 'workflow_dispatch', false, '', manual), false, job)
  }
  assert.match(workflow, /deploy_admin_control:\r?\n[\s\S]*?type: boolean\r?\n\s+default: false/)
  const deploy = workflow.split('\n  deploy:')[1].split('\n  rollout:')[0]
  const buildIf = deploy.match(/name: Build Refine before production changes\r?\n\s+if: ([^\r\n]+)/)?.[1]
  const downloadIf = deploy.match(/- if: ([^\r\n]+)\r?\n\s+uses: actions\/download-artifact@v4/)?.[1]
  assert.ok(buildIf)
  assert.ok(downloadIf)
  const stepEnabled = (expression, event) => Function('needs', 'github', `return (${expression})`)(
    { changes: { outputs: { admin_build: 'true' } } }, { event_name: event },
  )
  assert.equal(stepEnabled(buildIf, 'workflow_dispatch'), true, 'manual release builds production assets')
  assert.equal(stepEnabled(downloadIf, 'workflow_dispatch'), false, 'manual checks did not upload an artifact')
  assert.equal(stepEnabled(buildIf, 'push'), false, 'push reuses its qualified build')
  assert.equal(stepEnabled(downloadIf, 'push'), true)
  assert.equal((workflow.match(/if: needs\.changes\.outputs\.deep_integration == 'true'/g) ?? []).length, 2)
})

// Failure model: ordinary source/empty changes expand to full history, or a
// migration/auth/native boundary loses its owning checks while reducing scope.
test('CI integration modes distinguish core smoke, explicit owners and manual full', () => {
  for (const flags of [{ serverSource: true }, { sharedFrontend: true }, { release: true }, { integrationRunner: true }]) {
    const scope = computeScope(flags)
    assert.equal(scope.integration, true)
    assert.equal(scope.integration_mode, 'smoke')
    assert.deepEqual(scope.integration_files, [])
  }
  assert.equal(computeScope().integration, false)
  assert.equal(computeScope({ web: true }).integration, false)
  const removed = computeScope({ integrationTests: true, integrationFiles: ['server/src/__integration__/deleted.test.ts'] })
  assert.equal(removed.integration_mode, 'smoke')
  assert.deepEqual(removed.integration_files, [])
  const migration = computeScope({ serverSource: true, serverSourceFiles: ['server/src/db/migrations/0055_example.sql'] })
  assert.equal(migration.integration_mode, 'selected')
  for (const file of ['identity-vertical-slice.test.ts', 'migration.test.ts', 'conversation-repair-provenance-migration.test.ts', 'public-purpose-reader-migration.test.ts', 'run-trace-provenance-migration.test.ts', 'run-presentation-contract.test.ts', 'runtime-patch-provenance.test.ts']) {
    assert.ok(migration.integration_files.includes(file), file)
  }
  for (const path of ['server/package-lock.json', 'server/package.json']) {
    assert.ok(computeScope({ serverSource: true, serverSourceFiles: [path] }).integration_files.includes('migration.test.ts'))
  }
  const fixture = computeScope({ integrationRunner: true, integrationRunnerFiles: ['server/fixtures/historical-runtime-3.8.2.json'] })
  assert.ok(fixture.integration_files.includes('run-presentation-contract.test.ts'))
  const owners = [
    ['server/src/auth.ts', 'trust-bff.test.ts'],
    ['server/src/agent-runtime/runtime.ts', 'runtime-chat-recovery.test.ts'],
    ['server/src/im/reconcile.ts', 'im-send-reconciliation.test.ts'],
    ['server/src/modules/learning/homework-application.ts', 'homework.test.ts'],
    ['server/src/agent-runtime/visualize-delivery.ts', 'visualize-delivery.test.ts'],
  ]
  for (const [path, file] of owners) {
    const selected = computeScope({ serverSource: true, serverSourceFiles: [path] })
    assert.equal(selected.integration_mode, 'selected', path)
    assert.ok(selected.integration_files.includes(file), `${path}: ${file}`)
    assert.equal(new Set(selected.integration_files).size, selected.integration_files.length)
    assert.ok(selected.integration_files.includes('basic-process-recovery.test.ts'))
  }
  for (const invalid of [null, {}, '../secret', ['../secret'], ['/absolute'], ['server\\src\\auth.ts']]) {
    assert.throws(() => computeScope({ serverSource: true, serverSourceFiles: invalid }), /paths/)
  }
  assert.throws(() => computeScope({ integrationTests: true, integrationFiles: ['../migration.test.ts'] }), /integration/)
  assert.equal(computeScope({ serverSource: true }, 'deep-integration').integration_mode, 'full')
})

test('workflow carries explicit integration mode and bounded ordinary budgets', () => {
  const workflow = read('.github/workflows/ci.yml')
  assert.match(workflow, /integration_mode: \$\{\{ steps.scope.outputs.integration_mode \}\}/)
  assert.match(workflow, /INTEGRATION_TEST_MODE: \$\{\{ needs.changes.outputs.integration_mode \}\}/)
  assert.match(workflow, /SERVER_SOURCE_FILES: \$\{\{ steps.paths.outputs.server_source_files \}\}/)
  assert.match(workflow, /INTEGRATION_RUNNER_FILES: \$\{\{ steps.paths.outputs.integration_runner_files \}\}/)
  const checks = workflow.match(/^  checks:\r?\n([\s\S]*?)(?=^  integration:)/m)?.[1]
  assert.match(checks, /timeout-minutes: 8/)
  const integration = workflow.match(/^  integration:\r?\n([\s\S]*?)(?=^  publish:)/m)?.[1]
  assert.match(integration, /timeout-minutes: \$\{\{ needs.changes.outputs.deep_integration == 'true' && 30 \|\| 8 \}\}/)
  assert.match(integration, /- if: always\(\)\r?\n\s+uses: actions\/upload-artifact@v4/)
  assert.match(integration, /path: artifacts\/ci-integration\/timings\.json/)
  assert.match(integration, /if-no-files-found: warn/)
})

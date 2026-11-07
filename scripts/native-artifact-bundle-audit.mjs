// Production dependency-graph evidence. This is not a browser transfer/timing test.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { build } from 'vite'
import {profileOpeningChunks,openingModuleRoles,assertNativeOpeningIsolation} from './native-artifact-bundle-profile.mjs'

const output = resolve(process.argv[2] ?? '/tmp/lingxi-native-bundle-audit.json')
const outDir = resolve(process.argv[3] ?? '/tmp/lingxi-native-production-dist')
function sourceFingerprint() {
  const inputs = ['src', 'shared', 'public', 'third_party/assistant-ui/streaming-text', 'third_party/baoyu-design/host',
    'package.json', 'package-lock.json', 'index.html', 'artifact-export.html', 'vite.config.ts',
    'tsconfig.json', 'tsconfig.node.json', 'postcss.config.js', 'tailwind.config.ts', 'scripts/native-artifact-shared-icons.ts']
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...inputs], { encoding: 'utf8' })
    .split('\0').filter(file => file && existsSync(file)).sort()
  const hash = createHash('sha256')
  for (const file of new Set(files)) hash.update(file).update('\0').update(readFileSync(file)).update('\0')
  return hash.digest('hex')
}
const inputSha256 = sourceFingerprint()
let report
const emitOpeningProfile=(value,openingIsolationPassed,sourceInputsUnchanged)=>writeSync(1,'NATIVE_ARTIFACT_BUNDLE_PROFILE '+JSON.stringify({commit:value.commit,sourceInputsSha256:value.sourceInputsSha256,uncommittedInputsPossible:value.uncommittedInputsPossible,openingIsolationPassed,buildCompleted:openingIsolationPassed,sourceInputsUnchanged,...(!openingIsolationPassed?{failureCode:'native_opening_isolation'}:{}),...value.openingProfile})+'\n')
await build({
  build: { outDir, emptyOutDir: true },
  plugins: [{
    name: 'native-artifact-dependency-audit',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter(value => value.type === 'chunk')
      const sharedIcons=chunks.find(chunk=>chunk.name==='artifact-shared-icons')
      if(sharedIcons){
        assert.equal(sharedIcons.moduleIds.length,6,'The measured shared icon chunk must own only six leaf modules')
        assert.ok(sharedIcons.moduleIds.every(id=>/\/node_modules\/lucide-react\/dist\/esm\/icons\/(bot|image|chevron-down|ellipsis|chevron-left|chevron-right)\.mjs$/.test(id.replaceAll('\\','/'))),'The shared icon chunk must not absorb React or other dependencies')
      }
      const owns = (chunk, suffix) => chunk.moduleIds.some(id => id.replaceAll('\\', '/').endsWith(suffix))
      const rootChunks = Object.fromEntries(Object.entries(openingModuleRoles).map(([role,modules])=>[role,modules.map(module=>{
        const chunk=chunks.find(value=>owns(value,module))
        assert.ok(chunk,`Missing production root: ${module}`)
        return chunk.fileName
      })]))
      const roots=Object.values(rootChunks).flat()
      const reached = new Set()
      const visit = name => {
        if (reached.has(name)) return
        reached.add(name)
        const chunk = bundle[name]
        assert.equal(chunk?.type, 'chunk', `Unresolved static chunk: ${name}`)
        chunk.imports.forEach(visit)
      }
      roots.forEach(visit)
      const modules = [...reached].flatMap(name => bundle[name].moduleIds).map(id => id.replaceAll('\\', '/'))
      const forbidden = modules.filter(id => /\/native\/(?:export\/|export-artifact\.|capture-embeds\.)|\/shared\/artifact-legacy\.|\/htmlparser2\/|\/baoyu-design\/(?:slides-source|.*\/scripts\/editor)\//.test(id))
      assert.deepEqual(forbidden, [], 'Native opening statically imports compatibility or export implementation')
      const realm = chunks.find(chunk => owns(chunk, '/src/features/artifacts/native/export/realm-entry.ts'))
      assert.ok(realm, 'Missing independent export entry')
      assert.ok(!reached.has(realm.fileName), 'Export realm is in the opening dependency graph')
      const exportHtml = bundle['artifact-export.html']
      assert.equal(exportHtml?.type, 'asset')
      const exportSource = String(exportHtml.source)
      for (const root of new Set(roots)) assert.ok(!exportSource.includes(root), `Export HTML preloads application root ${root}`)
      report = {
        kind: 'production-rollup-static-dependency-audit',
        commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        sourceInputsSha256: inputSha256,
        uncommittedInputsPossible: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
        qualification: 'Static production graph only; dynamic navigation, Worker/fetch code and actual network bytes require the authenticated browser benchmark.',
        roots: [...new Set(roots)].sort(),
        staticChunks: [...reached].sort(),
        staticModuleCount: modules.length,
        openingProfile:profileOpeningChunks(bundle,rootChunks.application,rootChunks.native,process.cwd()),
        forbiddenCompatibilityOrExportModules: forbidden,
        exportRealm: realm.fileName,
        exportHtmlPreloadsApplication: false,
      }
      try{assertNativeOpeningIsolation(report.openingProfile)}catch(error){emitOpeningProfile(report,false,sourceFingerprint()===inputSha256);throw error}
    },
  }],
})
assert.ok(report, 'Production graph audit did not run')
assert.equal(sourceFingerprint(), inputSha256, 'Build inputs changed during the production audit; rerun on frozen sources')
await mkdir(dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(`Native production graph audit: ${output}`)
emitOpeningProfile(report,true,true)

import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const generated=resolve('e2e/visualize/generated')
await mkdir(generated,{recursive:true})
const result=spawnSync('python3',['-B','third_party/zcode/skills/visualize/scripts/render.py',resolve('e2e/visualize/fixtures/export.html'),resolve(generated,'export.html'),'--force'],{encoding:'utf8'})
if(result.status!==0) throw new Error(`Original render.py export failed: ${result.stderr}`)
const files=['third_party/zcode/upstream/packages/ui/src/useTheme.ts','third_party/zcode/upstream/packages/web/index.html','e2e/visualize/presentation.e2e.ts','third_party/zcode/upstream/packages/ui/src/components/lib/utils.ts','src/features/chat/visualize/zcode/lib/utils.ts','e2e/visualize/fixtures/bridge.html','e2e/visualize/bridge.e2e.ts','e2e/visualize/fixture-api.ts','e2e/visualize/index.tsx','e2e/visualize/fixture.css','e2e/visualize/parity.e2e.ts','e2e/visualize/lifecycle.e2e.ts','e2e/visualize/fixtures/acceptance.html','e2e/visualize/fixtures/export.html','e2e/visualize/generated/export.html','third_party/zcode/skills/visualize/scripts/render.py','package-lock.json',...['GenUiCard.tsx','TweakPanel.tsx'].flatMap(file=>[`third_party/zcode/upstream/packages/ui/src/gen-ui/components/${file}`,`src/features/chat/visualize/zcode/gen-ui/components/${file}`]),...['button.tsx','dialog.tsx','textarea.tsx'].flatMap(file=>[`third_party/zcode/upstream/packages/ui/src/components/ui/${file}`,`src/features/chat/visualize/zcode/components/ui/${file}`]),'src/features/chat/visualize/web/host.ts','src/features/chat/visualize/web/document.ts','src/features/chat/visualize/zcode.css','third_party/zcode/upstream/packages/ui/src/styles.css','server/assets/visualize-runtime/gen-ui.js']
const hashes=Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])))
await writeFile(resolve(generated,'manifest.json'),JSON.stringify({upstream:'0a1fc56d279fd1001f78387bd81aec1c26767411',viewport:{width:1440,height:960},dpr:1,locale:'zh-CN',timezone:'UTC',sharedAdaptation:['Web sandbox host','useGenUi hook','i18n host locale adapter','font environment'],themeInput:'original upstream Web applyTheme(light/dark) normalizes to theme-zai-light/dark, Web body font/foreground, cold-start without snapshot; shared outer canvas is Zai #f8f8f8/#161616',styling:'upstream independently compiles original styles.css; product compiles globals.css + zcode.css; only outer test-shell geometry/fonts/motion conditions shared',sourceBoundary:'Upstream card, controls and primitives are imported from immutable third_party source; product imports src. No upstream source text is rewritten.',hashes},null,2))
process.env.E2E_VISUALIZE_READY='0'
const server=await createServer({configFile:resolve('e2e/visualize/vite.config.ts')})
await server.listen()
// Compile both independent style entries before readiness so shared CI CPU load
// cannot turn first CSS compilation into a product readiness failure.
await server.transformRequest('/third_party/zcode/upstream/packages/ui/src/styles.css')
await server.transformRequest('/src/styles/globals.css')
process.env.E2E_VISUALIZE_READY='1'
server.printUrls()
for(const signal of ['SIGTERM','SIGINT']) process.on(signal,async()=>{await server.close();process.exit(0)})

import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const root = resolve(process.argv[2] || fileURLToPath(new URL('../../../', import.meta.url)))
const require = createRequire(join(root, 'package.json'))
const ts = require('typescript')
const specs = ['group-mentions', 'runtime-reliability', 'runtime-provider-timeout']
const temp = await mkdtemp(join(tmpdir(), 'pr207-output-isolation-'))
const previous = process.cwd()
const evidence = []
try {
  for (const spec of specs) for (const explicit of [true, false]) {
    const sandbox = join(temp, `${spec}-${explicit}`); await mkdir(sandbox)
    process.chdir(sandbox)
    const text = await readFile(join(root, 'server/src/__integration__', `${spec}.test.ts`), 'utf8')
    const source = ts.createSourceFile(spec + '.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const statements = []
    const printer = ts.createPrinter()
    for (const statement of source.statements) {
      if (ts.isVariableStatement(statement) && statement.declarationList.declarations.some(d => d.name.getText(source) === 'acceptanceOutput')) statements.push(statement.getText(source))
    }
    const visit = node => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['mkdir', 'writeFile'].includes(node.expression.text)) {
        const args = [...node.arguments]
        // Exercise exact source paths/options without running business logic or opening a database.
        if (node.expression.text === 'writeFile') args[1] = ts.factory.createStringLiteral('{"synthetic":true}')
        const call = ts.factory.updateCallExpression(node, node.expression, node.typeArguments, args)
        statements.push('await ' + printer.printNode(ts.EmitHint.Expression, call, source))
      }
      ts.forEachChild(node, visit)
    }
    ts.forEachChild(source, visit)
    const destination = join(sandbox, 'exclusive-run')
    const writes = []
    const fakeProcess = { env: explicit ? { RUNTIME_ACCEPTANCE_OUTPUT_DIR: destination } : {}, pid: process.pid }
    const run = new (Object.getPrototypeOf(async function () {}).constructor)('process', 'mkdir', 'writeFile', 'Date', statements.join('\n'))
    await run(fakeProcess, mkdir, async (path, contents, options) => { writes.push({ path: resolve(path), options }); await writeFile(path, contents, options) }, { now: () => 1792450000000 })
    const violations = writes.filter(({path,options}) => !(explicit ? path.startsWith(destination + '/') : relative(sandbox, path).startsWith('.e2e/runtime-acceptance/')) || options?.flag !== 'wx')
    const record = { spec, explicitOutput: explicit, writes: writes.length, isolatedAndExclusive: violations.length === 0 }
    if (!violations.length) {
      await assert.rejects(() => run(fakeProcess, mkdir, writeFile, { now: () => 1792450000000 }), { code: 'EEXIST' })
      record.existingReceiptRejected = true
    }
    evidence.push(record)
  }
} finally { process.chdir(previous); await rm(temp, { recursive: true, force: true }) }
console.log(JSON.stringify({ synthetic: true, databaseUsed: false, sourceWriterSelection: 'TypeScript AST; exact destination and options; only payload replaced', cases: evidence }, null, 2))
if (evidence.some(x => !x.isolatedAndExclusive)) process.exitCode = 1

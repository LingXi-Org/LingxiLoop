#!/usr/bin/env node
// Parse the pinned release as text; never import or execute its editor bundles.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import ts from 'typescript'

const args = Object.fromEntries(process.argv.slice(2).map(value => value.replace(/^--/, '').split('=')))
assert.ok(args['reference-root'], 'An independent pinned reference checkout is required')
const inventory = JSON.parse(await readFile(new URL('../docs/evidence/issue-707/source-inventory.json', import.meta.url), 'utf8'))
const output = resolve(args.output ?? '/tmp/lingxi-source-census')
await mkdir(output, { recursive: true })
for (const kind of ['design', 'slides']) {
  const entry = inventory.sources.find(source => source.path.includes(`claude-${kind}/`) && source.path.endsWith('.js'))
  const bytes = await readFile(join(resolve(args['reference-root']), entry.path))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256)
  const source = ts.createSourceFile(entry.path, bytes.toString('utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const messages = []
  const text = node => ts.isStringLiteralLike(node) ? node.text : null
  function owner(node) {
    let current = node.parent
    while (current) {
      if (ts.isFunctionLike(current) && current.body) {
        const parent = current.parent
        const name = current.name?.getText(source) ?? (ts.isVariableDeclaration(parent) ? parent.name.getText(source) : ts.isPropertyAssignment(parent) ? parent.name.getText(source) : '(匿名函数)')
        return { name, start: current.getStart(source), end: current.end }
      }
      current = current.parent
    }
    return null
  }
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'defaultMessage' && text(node.initializer) !== null) {
      const message = text(node.initializer)
      const idProperty = ts.isObjectLiteralExpression(node.parent) ? node.parent.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(source) === 'id') : null
      messages.push({ key: `${kind}:${node.getStart(source)}`, id: idProperty ? text(idProperty.initializer) : null, referenceText: message, start: node.getStart(source), end: node.end, owner: owner(node), reachability: '待运行入口与状态遍历确认' })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  const result = { referenceCommit: inventory.referenceCommit, kind, path: entry.path, sha256: entry.sha256, offsetUnit: 'UTF-16 code units', note: '文案定义目录包括库及非编辑器代码。定义存在不证明可达，也不代表实现或验收通过。', messages }
  await writeFile(join(output, `${kind}-messages.json`), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify({ kind, messages: messages.length, sha256: entry.sha256 }))
}

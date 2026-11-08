import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { editorThemeLabel, editorError } from './editor-copy'

test('runtime and remote failures always produce Chinese editor feedback', () => {
  const fallback = '导出尚未完成，请重试。'
  for (const message of ['Failed to fetch', 'NetworkError', '<html>Bad Gateway</html>', '资源加载失败：TypeError', '']) {
    assert.equal(editorError(new Error(message), fallback), fallback)
  }
  assert.equal(editorError(new Error('资源加载失败（503），请重试。'), fallback), '资源加载失败（503），请重试。')
})

test('editor component prose and accessible labels contain no English UI copy', () => {
  const directory = fileURLToPath(new URL('.', import.meta.url))
  const violations: string[] = []
  for (const filename of readdirSync(directory).filter(name => name.endsWith('.tsx') && !name.includes('.test.'))) {
    const source = readFileSync(directory + filename, 'utf8')
    const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const check = (text: string, node: ts.Node) => {
      // Shortcut key legends and standard numeric paper/colour values are data.
      const prose = text.replace(/\([A-Z]\)/g, '').replace(/\bA4\b/g, '')
      if (/[A-Za-z]/.test(prose)) violations.push(`${filename}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}: ${text.trim()}`)
    }
    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node)) check(node.text, node)
      if (ts.isJsxAttribute(node) && ['label', 'title', 'placeholder', 'aria-label'].includes(node.name.getText(file)) && node.initializer && ts.isStringLiteral(node.initializer)) check(node.initializer.text, node)
      ts.forEachChild(node, visit)
    }
    visit(file)
  }
  assert.deepEqual(violations, [])
})

 test('内置主题名称和明暗标签全部中文，作者命名保持原样', () => {
  assert.equal(editorThemeLabel({name:'Claude · Light',source:{namespace:'slides-builtin',variant:'light'}}),'经典 · 浅色')
  assert.equal(editorThemeLabel({name:'Ember · Dark',source:{namespace:'baoyu-ember',variant:'dark'}}),'余烬 · 深色')
  assert.equal(editorThemeLabel({name:'Seazar',source:{namespace:'baoyu-seazar',variant:'light'}}),'塞扎尔 · 浅色')
  assert.equal(editorThemeLabel({name:'作者的主题'}),'作者的主题')
 })

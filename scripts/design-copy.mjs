import ts from 'typescript'

const copyProperties = new Set(['defaultMessage', 'label', 'title', 'placeholder', 'tooltip', 'tip', 'children', 'aria-label', 'description'])

// Translate literal UI copy only; document content, identifiers and protocol values stay untouched.
export function translateDesign(source, catalog) {
  const tree = ts.createSourceFile('design.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const edits = []
  const templates = new Map([
    ['`${s} replies`', '`${s} 条回复`'],
    ['`Comment ${w.n}`', '`评论 ${w.n}`'],
    ['`Agent replied on ${f.label}`', '`智能体回复了${f.label}`'],
    ['`Behind its source: ${x.changed} ${x.changed===1?"file":"files"} changed.`', '`落后于源文件：${x.changed} 个文件已更改。`'],
  ])
  function visit(node) {
    if (ts.isStringLiteral(node) && node.text === 'No results' && ts.isBinaryExpression(node.parent)
      && node.parent.left.getText(tree) === 'W' && node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      let scope = node.parent
      while (scope && !ts.isFunctionDeclaration(scope)) scope = scope.parent
      if (scope?.name?.text === 'sj' && scope.getText(tree).includes('data-cds-combobox-placeholder')) {
        edits.push([node.getStart(tree), node.end, JSON.stringify('无搜索结果')])
      }
    }
    if (ts.isStringLiteral(node) && node.text === 'Original look' && ts.isCallExpression(node.parent)
      && node.parent.expression.getText(tree) === '(0,e.lookPreviewFromColors)' && node.parent.arguments[1] === node) {
      edits.push([node.getStart(tree), node.end, JSON.stringify('原始外观')])
    }
    if (ts.isPropertyAccessExpression(node) && node.getText(tree) === 'e.defaultCanvasPage.name') {
      const parent = node.parent
      const headerFallback = ts.isBinaryExpression(parent) && parent.right === node && parent.left.getText(tree) === 'Ws.find(ae=>ae.id===Yr)?.name'
      const menuFallback = ts.isPropertyAssignment(parent) && parent.name.getText(tree) === 'name'
        && parent.parent.parent.parent.getText(tree).startsWith('Ws.length>0?Ho:')
      if (headerFallback || menuFallback) edits.push([node.getStart(tree), node.end, JSON.stringify('第 1 页')])
    }
    if (ts.isTemplateExpression(node) && templates.has(node.getText(tree))) edits.push([node.getStart(tree), node.end, templates.get(node.getText(tree))])
    if (ts.isStringLiteral(node) && Object.hasOwn(catalog, node.text)) {
      let child = node, owner = node.parent
      while ((ts.isConditionalExpression(owner) && owner.condition !== child)
        || (ts.isBinaryExpression(owner) && owner.operatorToken.kind === ts.SyntaxKind.PlusToken)
        || (ts.isCallExpression(owner) && owner.arguments.includes(child))
        || ts.isParenthesizedExpression(owner)) { child = owner; owner = owner.parent }
      let helperChild = node, helper = node.parent
      while (ts.isConditionalExpression(helper) && helper.condition !== helperChild) { helperChild = helper; helper = helper.parent }
      const helperCopy = ts.isCallExpression(helper) && ((helper.expression.getText(tree) === '(0,e.useLabel)' && helper.arguments[1] === helperChild)
        || (helper.expression.getText(tree) === '(0,e.resolveLabel)' && helper.arguments[2] === helperChild))
      const property = ts.isPropertyAssignment(owner) ? owner.name.getText(tree).replaceAll('"', '') : ''
      if (copyProperties.has(property) || helperCopy) edits.push([node.getStart(tree), node.end, JSON.stringify(catalog[node.text])])
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  for (const [start, end, replacement] of edits.reverse()) source = source.slice(0, start) + replacement + source.slice(end)
  return source
}

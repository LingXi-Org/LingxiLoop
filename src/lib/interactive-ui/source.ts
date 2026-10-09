import { autoClose, createParser, createStreamingParser, createStore, evaluateElementProps, isASTNode, isReactiveAssign, parseExpression,
  split, tokenize, type ASTNode, type ElementNode } from '@openuidev/lang-core'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { lessonComponentSchemas, lessonLibrary, OPENUI_LANGUAGE, UI_LIMITS, type LessonComponentName } from './catalog.js'
import { uiStateSchema, type UiAction, type UiField, type UiState } from './protocol.js'

export interface ParsedLesson { root: ElementNode; title: string; fallback: string; fields: UiField[]; actions: UiAction[]; defaults: UiState; revisionOf?: string; baseRevision?: number }
export interface LessonBlock { start: number; end: number; source: string; closed: boolean }
const parser = createParser(lessonLibrary.toJSONSchema(), 'Lesson')
const punctuation = (value: string) => tokenize(value)[0].t
const newline = punctuation('\n'), eof = tokenize('').at(-1)!.t
const opens = new Set(['(', '[', '{'].map(punctuation)), closes = new Set([')', ']', '}'].map(punctuation))
const own = (value: object, key: string) => Object.hasOwn(value, key)
const byteLength = (text: string) => new TextEncoder().encode(text).length
const fail = (code: string): never => { throw new Error(`interactive-ui:${code}`) }

export function extractLessonBlocks(body: string): LessonBlock[] {
  if (body.length > 1_000_000) return []
  const blocks: LessonBlock[] = []
  for (const node of fromMarkdown(body).children) {
    if (node.type !== 'code' || node.lang !== OPENUI_LANGUAGE || node.meta) continue
    const start = node.position?.start.offset, end = node.position?.end.offset
    if (start === undefined || end === undefined) continue
    const raw = body.slice(start, end), lines = raw.split(/\r?\n/), opener = /^ {0,3}(`{3,}|~{3,})/.exec(lines[0])?.[1]
    if (!opener) continue
    const last = lines.at(-1)!.trim()
    blocks.push({ start, end, source: node.value, closed: lines.length > 1 && last.length >= opener.length && [...last].every(char => char === opener[0]) })
  }
  return blocks
}

// Count the supported AST's tokens to detect input the upstream permissive parser silently discards.
function astSize(node: ASTNode, references: string[], stateRefs: Set<string>, depth = 0): number {
  if (depth > UI_LIMITS.depth) return fail('depth')
  const next = (value: ASTNode) => astSize(value, references, stateRefs, depth + 1)
  switch (node.k) {
    case 'Str': if (node.v.length > 4_000) return fail('string-budget'); return 1
    case 'Num': if (!Number.isFinite(node.v)) return fail('non-finite'); return 1
    case 'Bool': case 'Null': return 1
    case 'Ref': references.push(node.n); return 1
    case 'StateRef': stateRefs.add(node.n); return 1
    case 'UnaryOp': if (node.op !== '-' || node.operand.k !== 'Num') return fail('expression'); return 1 + next(node.operand)
    case 'Comp':
      if (!own(lessonComponentSchemas, node.name)) return fail('component')
      return 3 + Math.max(0, node.args.length - 1) + node.args.reduce((sum, arg) => sum + next(arg), 0)
    case 'Arr':
      if (node.els.length > 64) return fail('array-budget')
      return 2 + Math.max(0, node.els.length - 1) + node.els.reduce((sum, value) => sum + next(value), 0)
    case 'Obj':
      if (node.entries.length > 32 || new Set(node.entries.map(([key]) => key)).size !== node.entries.length) return fail('object-budget')
      return 2 + Math.max(0, node.entries.length - 1) + node.entries.reduce((sum, [key, value]) => {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) return fail('property')
        return sum + 2 + next(value)
      }, 0)
    default: return fail('expression')
  }
}

function preflight(source: string, preview: boolean): void {
  if (byteLength(source) > UI_LIMITS.sourceBytes) fail('source-budget')
  const completed = autoClose(source)
  if (!preview && completed.wasIncomplete) fail('incomplete')
  const input = preview ? completed.text : source
  // Strings may contain arbitrary text; outside strings only the supported upstream language tokens are admitted.
  if (input.replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/[\s\w$.,()[\]{}:=+\-"']/g, '')) fail('token')
  const tokens = tokenize(input), significant = tokens.filter(token => token.t !== newline && token.t !== eof)
  if (significant.length > 4_096) fail('token-budget')
  let depth = 0
  for (const token of tokens) {
    if (opens.has(token.t) && ++depth > UI_LIMITS.depth) fail('depth')
    if (closes.has(token.t) && --depth < 0) fail('unbalanced')
  }
  if (depth !== 0) fail('unbalanced')
  const statements = split(tokens)
  if (statements.length > UI_LIMITS.statements) fail('statement-budget')
  const ids = new Set(statements.map(statement => statement.id))
  if (ids.size !== statements.length) fail('duplicate-id')
  if (!preview && significant.length !== statements.reduce((sum, statement) => sum + 2 + statement.tokens.filter(t => t.t !== newline && t.t !== eof).length, 0)) fail('discarded-statement')
  const graph = new Map<string, { references: string[]; weight: number }>()
  for (const statement of statements) {
    const references: string[] = [], stateRefs = new Set<string>(), ast = parseExpression(statement.tokens)
    // A pending component may not have all required arguments yet, but it may never invoke a forbidden capability.
    const count = astSize(ast, references, stateRefs)
    if (!preview && count !== statement.tokens.filter(token => token.t !== newline && token.t !== eof).length) fail('discarded-expression')
    if (statement.id.startsWith('$') && !['Num', 'Str', 'Bool', 'UnaryOp'].includes(ast.k)) fail('state-default')
    if (!preview && [...stateRefs].some(ref => !ids.has(ref))) fail('unbound-state')
    graph.set(statement.id, { references, weight: count })
  }
  let expanded = 0
  function visit(id: string, path: string[]) {
    if (path.includes(id) || path.length > UI_LIMITS.depth) fail('reference-cycle')
    const entry = graph.get(id)
    if (!entry) { if (!preview) fail('unresolved'); return }
    expanded += entry.weight
    if (expanded > 4_096) fail('expansion-budget')
    for (const ref of entry.references) visit(ref, [...path, id])
  }
  for (const id of ids) visit(id, [])
}

function nodes(root: ElementNode): ElementNode[] {
  const result: ElementNode[] = [], queue: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }]
  let count = 0
  while (queue.length) {
    const { value, depth } = queue.pop()!
    if (++count > UI_LIMITS.nodes * 16 || depth > UI_LIMITS.depth * 3) return fail('tree-budget')
    if (!value || typeof value !== 'object') continue
    if (isASTNode(value)) continue
    if (!Array.isArray(value) && Reflect.get(value, 'type') === 'element') {
      result.push(value as ElementNode)
      if (result.length > UI_LIMITS.nodes) return fail('node-budget')
    }
    for (const child of Object.values(value)) queue.push({ value: child, depth: depth + 1 })
  }
  return result
}

function evaluatedNodes(root: ElementNode, state: UiState): ElementNode[] {
  const store = createStore()
  store.initialize(state, {})
  const errors: Parameters<typeof evaluateElementProps>[1]['errors'] = []
  try {
    const result = evaluateElementProps(root, { library: lessonLibrary, store, ctx: { getState: key => store.get(key), resolveRef: () => null }, errors })
    if (errors.length) return fail('evaluation')
    return nodes(result).map(node => ({ ...node, props: Object.fromEntries(Object.entries(node.props).map(([key, value]) =>
      [key, isReactiveAssign(value) ? state[value.target] : value])) }))
  } finally { store.dispose() }
}

function checkProps(root: ElementNode, state: UiState, preview: boolean): ElementNode[] {
  const result = evaluatedNodes(root, state)
  for (const node of result) {
    const schema = lessonComponentSchemas[node.typeName as LessonComponentName]
    if (!schema) return fail('component')
    if (preview && node.partial) continue
    if (!schema.safeParse(node.props).success) return fail('props')
    const p = node.props
    if (node.typeName === 'Parameter' && (Number(p.min) >= Number(p.max) || Number(p.value) < Number(p.min) || Number(p.value) > Number(p.max))) return fail('range')
    if (node.typeName === 'Choice' && !(p.options as string[]).includes(p.value as string)) return fail('choice')
    if (node.typeName === 'Steps' && (!Number.isInteger(p.value) || Number(p.value) < 0 || Number(p.value) >= (p.steps as unknown[]).length)) return fail('step')
    if (node.typeName === 'DctImage' && Number(p.keep) > Number(p.size) ** 2) return fail('coefficients')
    if (node.typeName === 'FunctionPlot' && Number((p.domain as number[])[0]) >= Number((p.domain as number[])[1])) return fail('domain')
    if (node.typeName === 'Table' && (p.rows as unknown[][]).some(row => row.length !== (p.headers as unknown[]).length)) return fail('table')
  }
  return result
}

export function parseLessonSource(source: string, options: { preview?: boolean } = {}): ParsedLesson {
  const preview = options.preview === true
  preflight(source, preview)
  const parsed = preview ? createStreamingParser(lessonLibrary.toJSONSchema(), 'Lesson').set(source) : parser.parse(source)
  if (!parsed.root || parsed.root.typeName !== 'Lesson' || parsed.queryStatements.length || parsed.mutationStatements.length) return fail('root')
  if (!preview && (parsed.meta.incomplete || parsed.meta.errors.length || parsed.meta.unresolved.length || parsed.meta.orphaned.length)) return fail('invalid-final')
  const defaults = uiStateSchema.parse(parsed.stateDeclarations)
  const rawNodes = nodes(parsed.root), evaluated = checkProps(parsed.root, defaults, preview)
  const root = evaluated.find(node => node.typeName === 'Lesson')!
  const title = typeof root.props.title === 'string' ? root.props.title : '交互讲解'
  const fallback = typeof root.props.fallback === 'string' && root.props.fallback ? root.props.fallback : '这段交互讲解暂时无法显示，请继续阅读文字说明。'
  const fields: UiField[] = [], actions: UiAction[] = []
  const controls = new Set(['Parameter', 'Choice', 'Toggle', 'Prediction', 'Steps'])
  for (let index = 0; index < evaluated.length; index++) {
    const node = evaluated[index], raw = rawNodes[index], p = node.props
    if (preview && node.partial) continue
    if (node.typeName === 'LearningAction') actions.push({ id: String(p.actionId), kind: p.kind as UiAction['kind'], label: String(p.label) })
    if (!controls.has(node.typeName)) continue
    const key = `$${p.name}`
    if (!isASTNode(raw.props.value) || raw.props.value.k !== 'StateRef' || raw.props.value.n !== key || !own(defaults, key)) {
      if (preview) continue
      return fail('control-binding')
    }
    const usages = rawNodes.filter(item => !controls.has(item.typeName)).flatMap(item => Object.entries(item.props).flatMap(([prop, value]) => {
      const paths: string[] = []
      const stack: { value: unknown; path: string }[] = [{ value, path: `${item.typeName}.${prop}` }]
      while (stack.length) {
        const { value, path } = stack.pop()!
        if (isASTNode(value) && value.k === 'StateRef') { if (value.n === key) paths.push(path) }
        else if (value && typeof value === 'object' && Reflect.get(value, 'type') !== 'element') {
          for (const [key, child] of Object.entries(value)) stack.push({ value: child, path: `${path}.${key}` })
        }
      }
      return paths
    })).sort()
    fields.push({ key, default: defaults[key], type: typeof defaults[key] as UiField['type'], unit: String(p.unit ?? ''),
      semantic: `${p.semantic || `${node.typeName}:${p.label ?? p.title ?? ''}`}:${[...new Set(usages)].join(',')}`,
      ...(node.typeName === 'Parameter' ? { min: Number(p.min), max: Number(p.max), step: Number(p.step) } : {}),
      ...(node.typeName === 'Steps' ? { min: 0, max: (p.steps as unknown[]).length - 1, step: 1 } : {}),
      ...(node.typeName === 'Choice' ? { options: p.options as string[] } : {}),
      ...(node.typeName === 'Prediction' ? { maxLength: 2_000 } : {}) })
  }
  if (fields.length > UI_LIMITS.fields || actions.length > UI_LIMITS.actions || new Set(fields.map(field => field.key)).size !== fields.length
    || new Set(actions.map(action => action.id)).size !== actions.length) return fail('contract')
  if (!preview && Object.keys(defaults).some(key => !fields.some(field => field.key === key))) return fail('uncontrolled-state')
  if ((root.props.revisionOf === undefined) !== (root.props.baseRevision === undefined)) return fail('revision')
  return { root: parsed.root, title, fallback, fields, actions, defaults,
    ...(typeof root.props.revisionOf === 'string' ? { revisionOf: root.props.revisionOf, baseRevision: Number(root.props.baseRevision) } : {}) }
}

function accepts(field: UiField, value: unknown): boolean {
  if (typeof value !== field.type) return false
  if (typeof value === 'number' && (!Number.isFinite(value) || value < (field.min ?? -Infinity) || value > (field.max ?? Infinity))) return false
  if (typeof value === 'string' && (value.length > (field.maxLength ?? 2_000) || field.options && !field.options.includes(value))) return false
  return true
}

export function validateLessonState(lesson: ParsedLesson, input: unknown): UiState {
  const state = uiStateSchema.parse(input)
  if (Object.keys(state).length !== lesson.fields.length || lesson.fields.some(field => !own(state, field.key) || !accepts(field, state[field.key]))) return fail('state')
  checkProps(lesson.root, state, false)
  return state
}

export function restoreLessonState(previous: UiField[], lesson: ParsedLesson, input: unknown): { state: UiState; resetKeys: string[] } {
  const saved = uiStateSchema.safeParse(input), state = { ...lesson.defaults }, resetKeys: string[] = []
  for (const field of lesson.fields) {
    const old = previous.find(item => item.key === field.key), value = saved.success ? saved.data[field.key] : undefined
    if (old && old.type === field.type && old.unit === field.unit && old.semantic === field.semantic && accepts(field, value)) state[field.key] = value as UiState[string]
    else if (old) resetKeys.push(field.key)
  }
  try { validateLessonState(lesson, state) }
  catch { return { state: { ...lesson.defaults }, resetKeys: lesson.fields.map(field => field.key) } }
  return { state, resetKeys }
}

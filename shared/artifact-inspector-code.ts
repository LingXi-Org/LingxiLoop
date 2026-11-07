/** Native declaration data. Parsing never executes templates, CSS or attributes. */
export interface InspectorCodeEntry { name: string; value: string }
export type InspectorCodeResult = { ok: true; entries: InspectorCodeEntry[] } |
  { ok: false; line: number; message: string }

const propertyName = /^-{0,2}[A-Za-z_][\w-]*$/
const attributeName = /^@[A-Za-z_][\w-]*(?::[A-Za-z_][\w-]*)*$/
const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' }

function normalizeProperty(name: string) {
  if (name.startsWith('--')) return name
  const normalized = name.replace(/([a-z\d])([A-Z])/g, '$1-$2').toLowerCase()
  return normalized.startsWith('ms-') ? `-${normalized}` : normalized
}

function declaration(line: string): InspectorCodeEntry | undefined {
  if (line.startsWith('@')) {
    // Namespace colons belong to the name; a colon followed by whitespace ends it.
    for (let index = 1; index < line.length; index++) {
      if (line[index] !== ':' || index + 1 < line.length && !/\s/.test(line[index + 1])) continue
      const name = line.slice(0, index).trim()
      if (attributeName.test(name)) return { name, value: line.slice(index + 1).trim() }
    }
    const index = line.indexOf(':')
    const name = line.slice(0, index).trim()
    if (index > 0 && /^@[A-Za-z_][\w-]*$/.test(name)) return { name, value: line.slice(index + 1).trim() }
    return
  }
  const index = line.indexOf(':')
  const name = line.slice(0, index).trim()
  if (index <= 0 || !propertyName.test(name)) return
  return { name: normalizeProperty(name), value: line.slice(index + 1).trim() }
}

function quotedEnd(value: string, start: number) {
  for (let index = start + 1; index < value.length; index++) {
    if (value[index] === '\\') index++
    else if (value[index] === value[start]) return index
  }
  return -1
}

function templateEnd(value: string, start: number): { end: number; error?: string } {
  const stack: string[] = []
  for (let index = start + 2; index < value.length; index++) {
    const char = value[index]
    if (char === '"' || char === "'") {
      const end = quotedEnd(value, index)
      if (end < 0) return { end, error: '括号或引号未闭合。' }
      index = end
    } else if (char === ';') return { end: -1, error: '模板表达式含有多余的分号。' }
    else if (!stack.length && char === '}' && value[index + 1] === '}') return { end: index + 1 }
    else if (pairs[char]) stack.push(pairs[char])
    else if (')]}'.includes(char) && stack.pop() !== char) return { end: -1, error: '括号或引号未闭合。' }
  }
  return { end: -1, error: '括号或引号未闭合。' }
}

function structureProblem(value: string): string | undefined {
  const stack: string[] = []
  for (let index = 0; index < value.length; index++) {
    const char = value[index]
    if (char === '"' || char === "'") {
      const end = quotedEnd(value, index)
      if (end < 0) return '括号或引号未闭合。'
      index = end
    } else if (char === '\\') {
      if (index + 1 === value.length || value[index + 1] === '(') return '转义符后缺少完整内容。'
      index++
    } else if (char === '/' && value[index + 1] === '*') {
      const end = value.indexOf('*/', index + 2)
      if (end < 0) return '注释未闭合。'
      index = end + 1
    } else if (char === '{' && value[index + 1] === '{') {
      const template = templateEnd(value, index)
      if (template.error) return template.error
      index = template.end
    } else if (char === ';' && !stack.includes(')')) return '属性值含有多余的分号。'
    else if (char === '{' && !stack.includes(')')) return '属性值含有多余的大括号。'
    else if (pairs[char]) stack.push(pairs[char])
    else if (')]}'.includes(char) && stack.pop() !== char) return '括号或引号未闭合。'
  }
  return stack.length ? '括号或引号未闭合。' : undefined
}

function completeValueProblem(value: string): string | undefined {
  if (/<\/?[A-Za-z!][^>]*>/.test(value)) return '样式值不能包含网页标签。'
  // Quoted addresses may contain spaces and punctuation. Bare addresses cannot.
  for (let index = 0; index < value.length; index++) {
    if (value[index] === '"' || value[index] === "'") { index = quotedEnd(value, index); continue }
    if (value[index] === '\\') { index++; continue }
    if (value[index] === '/' && value[index + 1] === '*') { index = value.indexOf('*/', index + 2) + 1; continue }
    if (value[index] === '{' && value[index + 1] === '{') { index = templateEnd(value, index).end; continue }
    if (value.slice(index, index + 4).toLowerCase() !== 'url(') continue
    const start = index + 4
    if (/^\s*["']/.test(value.slice(start))) continue
    const end = value.indexOf(')', start)
    if (end < 0) return '括号或引号未闭合。'
    const address = value.slice(start, end).replace(/\{\{[^{}()[\]"'\\/]*\}\}/g, '变量').trim()
    if (/[\s'"(\\[\]{}]|\/\*/.test(address)) return '包含空格或特殊符号的网址需要加引号。'
    index = end
  }
}

export function parseInspectorCode(source: string, previous?: ReadonlyMap<string, string>): InspectorCodeResult {
  const entries: InspectorCodeEntry[] = [], names = new Set<string>()
  for (const [index, raw] of source.split('\n').entries()) {
    let line = raw.trim()
    if (!line || line.startsWith('//')) continue
    if (line.startsWith('/*')) {
      if (line.endsWith('*/')) continue
      return { ok: false, line: index + 1, message: '注释未闭合。' }
    }
    if (line.endsWith(';')) line = line.slice(0, -1).trimEnd()
    const entry = declaration(line)
    if (!entry) return { ok: false, line: index + 1, message: '请按“属性: 值”格式输入。' }
    if (!entry.name.startsWith('@')) {
      if (!entry.value) return { ok: false, line: index + 1, message: '请填写属性值。' }
      const problem = structureProblem(entry.value) ?? (previous?.get(entry.name) === entry.value ? undefined : completeValueProblem(entry.value))
      if (problem) return { ok: false, line: index + 1, message: problem }
    }
    if (names.has(entry.name)) return { ok: false, line: index + 1, message: `属性「${entry.name}」重复。` }
    names.add(entry.name)
    entries.push(entry)
  }
  return { ok: true, entries }
}

export function serializeInspectorCode(entries: readonly InspectorCodeEntry[],mixed:readonly string[]=[]) {
  const styles: string[] = [], attributes: string[] = []
  for (const { name, value } of entries) {
    if (name.startsWith('@')) attributes.push(`${name}: ${value}`.trimEnd())
    else styles.push(`${name}: ${value};`)
  }
  for(const name of mixed)(name.startsWith('@')?attributes:styles).push(`// ${name}: （混合值）`)
  return [styles.join('\n'), attributes.join('\n')].filter(Boolean).join('\n\n')
}

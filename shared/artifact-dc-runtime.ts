import type { ComponentType, CSSProperties, ReactNode } from 'react'

interface Definition { Component: ComponentType<Record<string, unknown>>; template: string; props: Record<string, unknown>; baseUrl: string }
interface RuntimeGlobal {
  DCLogic?: unknown
  __lingxiDCMain?: ComponentType<Record<string, unknown>>
  __lingxiDCRegister?: (key: string, definition: Omit<Definition, 'baseUrl'>) => void
}

/** Small compatibility interpreter for the documented .dc.html template language.
 * Runs only in the opaque executable-content iframe. No editor, save API or host
 * credentials are installed here; classes arrive as syntax-transformed scripts.
 */
export function installDcRuntime(React: typeof import('react'), ReactDOM: typeof import('react-dom/client'), flush: (action: () => void) => void = action => action()) {
  const globals = globalThis as typeof globalThis & RuntimeGlobal
  const definitions = new Map<string, Definition>(), pending = new Map<string, Promise<Definition>>()
  const failures = new Map<string, Error>()
  const templateCache = new Map<string, HTMLTemplateElement>()
  const expression = (source: string, scope: Record<string, unknown>): unknown => {
    const key = source.trim()
    if (key === 'true') return true
    if (key === 'false') return false
    if (key === 'null') return null
    if (key === 'undefined') return undefined
    if (/^-?\d+(?:\.\d+)?$/.test(key)) return Number(key)
    if (/^(['"])[\s\S]*\1$/.test(key)) return key.slice(1, -1)
    if (!/^[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*|\.\d+)*$/.test(key)) return undefined
    return key.split('.').reduce<unknown>((value, part) => value !== null && (typeof value === 'object' || typeof value === 'function') && Object.hasOwn(value, part) ? (value as Record<string, unknown>)[part] : undefined, scope)
  }
  const value = (source: string, scope: Record<string, unknown>): unknown => {
    const whole = /^\s*\{\{([^{}]+)\}\}\s*$/.exec(source)
    if (whole) return expression(whole[1]!, scope)
    return source.replace(/\{\{([^{}]+)\}\}/g, (_, key: string) => {
      const result = expression(key, scope)
      return result === null || result === undefined || typeof result === 'function' || typeof result === 'object' ? '' : String(result)
    })
  }
  const css = (source: unknown): CSSProperties => {
    if (source && typeof source === 'object') return source as CSSProperties
    const element = document.createElement('span'); element.style.cssText = String(source ?? '')
    const styles: Record<string, string> = {}
    for (const property of element.style) styles[property.startsWith('--') ? property : property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] = element.style.getPropertyValue(property)
    return styles
  }
  const events: Record<string, string> = Object.fromEntries(['Click', 'DoubleClick', 'Change', 'Input', 'Submit', 'Focus', 'Blur', 'KeyDown', 'KeyUp', 'PointerDown', 'PointerUp', 'PointerMove', 'MouseEnter', 'MouseLeave', 'TouchStart', 'TouchEnd', 'Scroll'].map(name => [`on${name.toLowerCase()}`, `on${name}`]))
  globals.__lingxiDCRegister = (key, definition) => {
    const url = new URL(key, document.baseURI)
    definitions.set(url.pathname, { ...definition, baseUrl: new URL('.', url).href })
  }
  function loadComponent(name: string, baseUrl: string): Promise<Definition> {
    const url = new URL(name.endsWith('.dc.html') ? name : `${name}.dc.html`, baseUrl), key = url.pathname
    const known = definitions.get(key)
    if (known) return Promise.resolve(known)
    const current = pending.get(key)
    if (current) return current
    // Child components resolve only to the immutable, signed original-resource subtree.
    const base = new URL(baseUrl)
    if (url.origin !== base.origin || !url.pathname.includes('/native/original-resources/')) return Promise.reject(new Error('子组件必须来自当前稿件的原始文件'))
    const promise = new Promise<Definition>((resolve, reject) => {
      const script = document.createElement('script')
      url.searchParams.set('component', '1'); script.src = url.href
      const timeout = setTimeout(() => { script.remove(); reject(new Error('子组件载入超时')) }, 15_000)
      script.onload = () => { clearTimeout(timeout); script.remove(); const loaded = definitions.get(key); loaded ? resolve(loaded) : reject(new Error('子组件未注册')) }
      script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('子组件载入失败')) }
      document.head.append(script)
    }).catch(error => { failures.set(key, error instanceof Error ? error : new Error(String(error))); throw error }).finally(() => pending.delete(key))
    pending.set(key, promise)
    return promise
  }
  function Child({ name, baseUrl, values, hint }: { name: string; baseUrl: string; values: Record<string, unknown>; hint: string }) {
    const [definition, setDefinition] = React.useState<Definition | null>(null), [error, setError] = React.useState('')
    React.useEffect(() => { let active = true; loadComponent(name, baseUrl).then(next => { if (active) flush(() => setDefinition(next)) }, failure => { if (active) setError(String(failure.message)) }); return () => { active = false } }, [name, baseUrl])
    if (error) return React.createElement('span', { role: 'status' }, error)
    if (!definition) { const [width, height] = hint.split(','); return React.createElement('div', { style: { width: width || '100%', height: height || 120 }, 'aria-busy': true }) }
    return React.createElement(definition.Component, { ...definition.props, ...values, __dcDefinition: definition })
  }
  function template(html: string) {
    let result = templateCache.get(html)
    if (!result) { result = document.createElement('template'); result.innerHTML = html; templateCache.set(html, result) }
    return result
  }
  function renderNode(node: Node, scope: Record<string, unknown>, definition: Definition, key: string): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) { const result = value(node.textContent ?? '', scope); return typeof result === 'string' || typeof result === 'number' ? result : '' }
    if (!(node instanceof Element)) return null
    const tag = node.tagName.toLowerCase()
    if (tag === 'script') return null
    if (tag === 'sc-if') {
      const result = value(node.getAttribute('value') ?? '', scope)
      if (!(result === undefined ? value(node.getAttribute('hint-placeholder-val') ?? '', scope) : result)) return null
      return React.createElement(React.Fragment, { key }, [...node.childNodes].map((child, index) => renderNode(child, scope, definition, `${key}-${index}`)))
    }
    if (tag === 'sc-for') {
      const values = value(node.getAttribute('list') ?? '', scope)
      const items = Array.isArray(values) ? values : Array.from({ length: Math.max(0, Math.min(20, Number(node.getAttribute('hint-placeholder-count') ?? 0))) }, () => ({}))
      const alias = node.getAttribute('as') || 'item'
      return React.createElement(React.Fragment, { key }, items.slice(0, 10000).map((item, index) => React.createElement(React.Fragment, { key: index }, [...node.childNodes].map((child, childIndex) => renderNode(child, { ...scope, [alias]: item, $index: index }, definition, `${key}-${index}-${childIndex}`)))))
    }
    if (tag === 'helmet' || tag === 'x-dc') return React.createElement(React.Fragment, { key }, [...node.childNodes].map((child, index) => renderNode(child, scope, definition, `${key}-${index}`)))
    const props: Record<string, unknown> = { key }
    for (const attribute of node.attributes) {
      let name = attribute.name, result = value(attribute.value, scope)
      if (name === 'style') { props.style = css(result); continue }
      if (/^on/i.test(name)) {
        const event = events[name.toLowerCase().replace(/-/g, '')] ?? (tag === 'x-import' ? name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()) : undefined)
        if (event && typeof result === 'function') props[event] = result
        continue
      }
      if (name === 'class') name = 'className'
      if (name === 'for') name = 'htmlFor'
      if (name === 'tabindex') name = 'tabIndex'
      if (name === 'readonly') name = 'readOnly'
      if (name === 'autofocus') name = 'autoFocus'
      if (['disabled', 'checked', 'selected', 'multiple', 'required'].includes(name)) result = result !== false && result !== null && result !== undefined
      if ((name === 'src' || name === 'href') && typeof result === 'string' && result && !/^(?:[a-z][a-z\d+.-]*:|#)/i.test(result)) result = new URL(result, definition.baseUrl).href
      props[name] = result
    }
    if (tag === 'dc-import') {
      const name = String(props.name ?? ''), hint = String(props['hint-size'] ?? '')
      const values = Object.fromEntries(Object.entries(props).filter(([key]) => !['key', 'name', 'hint-size'].includes(key)).map(([key, val]) => [key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()), val]))
      return React.createElement(Child, { key, name, values, hint, baseUrl: definition.baseUrl })
    }
    const children = [...node.childNodes].map((child, index) => renderNode(child, scope, definition, `${key}-${index}`))
    if (tag === 'x-import') {
      const name = String(props['component-from-global-scope'] ?? '')
      const component = /^[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*$/.test(name)
        ? name.split('.').reduce<unknown>((current, part) => !['__proto__', 'prototype', 'constructor'].includes(part) && current !== null && (typeof current === 'object' || typeof current === 'function') && Object.hasOwn(current, part) ? (current as Record<string, unknown>)[part] : undefined, globalThis)
        : undefined
      if (typeof component !== 'function' && !(component && typeof component === 'object' && '$$typeof' in component)) return React.createElement('span', { key, role: 'status' }, `组件未载入：${name}`)
      const values = Object.fromEntries(Object.entries(props).filter(([name]) => !['key', 'style', 'component-from-global-scope'].includes(name)).map(([name, val]) => [/^(?:aria|data)-/.test(name) ? name : name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()), val]))
      const rendered = React.createElement(component as ComponentType<Record<string, unknown>>, { ...values, key }, children.length ? children : undefined)
      return props.style ? React.createElement('div', { key, style: props.style }, rendered) : rendered
    }
    return React.createElement(tag, props, children.length ? children : undefined)
  }
  class DCLogic extends React.Component<Record<string, unknown>, Record<string, unknown>> {
    state: Record<string, unknown> = {}
    renderVals(): Record<string, unknown> { return {} }
    render() {
      const definition = this.props.__dcDefinition as Definition | undefined
      if (!definition) return null
      const scope = this.renderVals()
      return React.createElement(React.Fragment, null, [...template(definition.template).content.childNodes].map((node, index) => renderNode(node, scope, definition, String(index))))
    }
  }
  globals.DCLogic = DCLogic
  const mount = () => {
    const root = document.querySelector('x-dc')
    if (!root) return
    const source = document.querySelector('script[data-dc-script]')
    if (!source && !root.querySelector('sc-for,sc-if,dc-import') && !root.innerHTML.includes('{{')) return
    let props: Record<string, unknown> = {}
    try {
      const descriptors = JSON.parse(source?.getAttribute('data-props') ?? '{}') as Record<string, { default?: unknown }>
      props = Object.fromEntries(Object.entries(descriptors).filter(([name]) => !name.startsWith('$')).map(([name, descriptor]) => [name, descriptor.default]))
    } catch { /* Missing optional defaults do not make the saved template executable in the host. */ }
    const definition: Definition = { Component: globals.__lingxiDCMain ?? DCLogic, template: root.innerHTML, props, baseUrl: document.baseURI }
    const reactRoot = ReactDOM.createRoot(root)
    flush(() => reactRoot.render(React.createElement(definition.Component, { ...props, __dcDefinition: definition })))
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true })
  else mount()
  return async () => {
    let timeout: ReturnType<typeof setTimeout> | undefined
    const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const ready = async () => {
      if (document.readyState === 'loading') await new Promise<void>(resolve => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }))
      // React effects can discover grandchildren only after their parent commit.
      // Require two empty frames, restarting whenever an immutable child is loading.
      let quiet = 0
      while (quiet < 2) {
        await frame()
        if (failures.size) throw failures.values().next().value
        if (pending.size) { quiet = 0; await Promise.all([...pending.values()]) }
        else quiet++
      }
    }
    try { await Promise.race([ready(), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('隔离子组件尚未就绪')), 18_000) })]) }
    finally { clearTimeout(timeout) }
  }
}

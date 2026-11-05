// Publish source locations and configuration *names*, never an error message,
// URL, credential, model prompt, request body or arbitrary stack trace.
const files=new Set(['web.ts','storage.ts','im/wukong.ts','agent-runtime/runtime.ts','agent-runtime/context.ts','agent-runtime/pricing.ts','agent-runtime/model-budget.ts'])
export function serviceFailure(error) {
  const sources=Array.from(String(error?.stack??'').matchAll(/\/server\/src\/([a-zA-Z0-9_/-]+\.ts):(\d+):\d+/g)).filter(match=>files.has(match[1])).slice(0,4).map(match=>`${match[1]}:${Number(match[2])}`)
  const settings=Array.from(new Set(String(error?.message??'').match(/\b(?:LINGXIOS|AGENT_OS|R2|WUKONG|SILICONFLOW)_[A-Z0-9_]{1,64}\b/g)??[])).slice(0,4)
  return {sources,settings}
}
export function checkedServiceFailure(value) {
  return {
    sources:(Array.isArray(value?.sources)?value.sources:[]).filter(source=>typeof source==='string'&&/^[a-zA-Z0-9_/-]+\.ts:[1-9][0-9]{0,6}$/.test(source)&&files.has(source.split(':')[0])).slice(0,4),
    settings:(Array.isArray(value?.settings)?value.settings:[]).filter(name=>typeof name==='string'&&/^(?:LINGXIOS|AGENT_OS|R2|WUKONG|SILICONFLOW)_[A-Z0-9_]{1,64}$/.test(name)).slice(0,4),
  }
}

/** A fatal runner error can precede its JSON receipt. Never publish its message
 * or raw traceback; only our fixed script filename/line and a known class. */
export function measurementFailure(log) {
  const sources=Array.from(new Set(Array.from(String(log).matchAll(/File "[^"\n]*\/scripts\/(native-artifact-benchmark\.py)", line ([1-9][0-9]{0,6})/g),match=>`${match[1]}:${match[2]}`))).slice(-4)
  const exceptions=new Set(['TypeError','NameError','KeyError','ValueError','RuntimeError','AttributeError','ImportError','ModuleNotFoundError','OSError','PermissionError','FileNotFoundError','TimeoutError'])
  const exception=Array.from(String(log).matchAll(/^([A-Za-z]+Error):/gm),match=>match[1]).filter(name=>exceptions.has(name)).at(-1)
  return {sources,...(exception?{exception}:{})}
}

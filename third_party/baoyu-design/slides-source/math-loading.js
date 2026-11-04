import { prepareEditorFeature } from './feature-resources.js'
import { hasSlideMathSource } from './math-source.js'
export { hasSlideMathSource, isCodeText } from './math-source.js'

/** One renderer per iframe, including simultaneous canvas/thumbnail requests.
 * Failure clears only the loading attempt. Original runs remain the model. */
export function createSlideMathLoader(importer = () => prepareEditorFeature('math').then(() => import('./math.js'))) {
  let current = null, pending = null
  const listeners = new Set()
  const accept = module => {
    module.installMathStyles()
    current = module
    for (const listener of listeners) listener()
    return module
  }
  return {
    current: () => current,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    accept,
    load() {
      if (current) return Promise.resolve(current)
      if (!pending) {
        pending = importer().then(accept).catch(error => { pending = null; throw error })
      }
      return pending
    },
  }
}
const math = createSlideMathLoader()

// The synchronous Node compiler keeps its public rendering contract.
export const registerSlideMath = module => math.accept(module)
export const loadSlideMath = () => math.load()

/** Use the editor's own React; no second React or independent document store. */
export function useSlideMath(React, runs, enabled) {
  const needed = enabled && hasSlideMathSource(runs)
  const renderer = React.useSyncExternalStore(math.subscribe, math.current, math.current)
  const [failed, setFailed] = React.useState(false)
  const [attempt, retry] = React.useReducer(value => value + 1, 0)
  React.useEffect(() => {
    if (!needed || renderer) return
    let active = true
    setFailed(false)
    math.load().then(() => {}, () => { if (active) setFailed(true) })
    return () => { active = false }
  }, [needed, renderer, attempt])
  return { runs: needed && renderer ? renderer.slideMathRuns(runs) : runs, failed: needed && !renderer && failed, retry }
}

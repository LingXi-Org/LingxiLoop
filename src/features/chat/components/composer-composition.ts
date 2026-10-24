/** Keep IME-owned keys out of submit, cancel and mention/slash navigation.
 * Do not preventDefault: the browser still has to commit the candidate text.
 */
export function installComposerCompositionGuard(root: EventTarget, isEditorComposing: () => boolean) {
  let composing = false
  let ending = false
  let settle: ReturnType<typeof setTimeout> | undefined
  const start = () => { clearTimeout(settle); composing = true; ending = false }
  const release = () => { clearTimeout(settle); ending = false }
  const blur = () => { composing = false; release() }
  const end = () => {
    composing = false
    ending = true
    clearTimeout(settle)
    // Some engines end composition before dispatching its confirming keydown.
    // Protect that event turn, with no human-scale delay on the next Enter.
    settle = setTimeout(() => { ending = false }, 0)
  }
  const keydown = (event: Event) => {
    const key = event as KeyboardEvent
    if (key.isComposing || key.keyCode === 229 || ((composing || ending || isEditorComposing())
      && ['Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(key.key))) {
      event.stopImmediatePropagation()
    }
  }
  root.addEventListener('compositionstart', start, { capture: true })
  root.addEventListener('compositionend', end, { capture: true })
  root.addEventListener('keyup', release, { capture: true })
  root.addEventListener('blur', blur, { capture: true })
  root.addEventListener('keydown', keydown, { capture: true })
  return () => {
    clearTimeout(settle)
    root.removeEventListener('compositionstart', start, { capture: true })
    root.removeEventListener('compositionend', end, { capture: true })
    root.removeEventListener('keyup', release, { capture: true })
    root.removeEventListener('blur', blur, { capture: true })
    root.removeEventListener('keydown', keydown, { capture: true })
  }
}

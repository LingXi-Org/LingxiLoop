/** The native editor can occupy a column inside the workspace. Keep top-layer
 * controls inside that column when it or the browser resizes. */
export function positionEditorPopover(
  popup: HTMLElement,
  anchor: HTMLElement,
  align: 'start' | 'end' = 'start',
  minimumWidth?: number,
  gap = 4,
  collisionHeight?: number,
) {
  const editor = anchor
    .closest<HTMLElement>('[data-native-artifact-editor]')
    ?.getBoundingClientRect()
  const left = Math.max(0, editor?.left ?? 0),
    right = Math.min(window.innerWidth, editor?.right ?? window.innerWidth),
    top = Math.max(0, editor?.top ?? 0),
    bottom = Math.min(window.innerHeight, editor?.bottom ?? window.innerHeight)
  popup.style.maxWidth = `${right - left - 16}px`
  popup.style.maxHeight = `${bottom - top - 16}px`
  if (minimumWidth !== undefined)
    popup.style.minWidth = `${Math.min(minimumWidth, right - left - 16)}px`
  const bounds = anchor.getBoundingClientRect(),
    width = popup.offsetWidth,
    height = popup.offsetHeight
  popup.style.left = `${Math.max(left + 8, Math.min(right - width - 8, align === 'end' ? bounds.right - width : bounds.left))}px`
  popup.style.top = `${bounds.bottom + gap + Math.max(height, collisionHeight ?? height) <= bottom - 8 ? bounds.bottom + gap : Math.max(top + 8, bounds.top - height - gap)}px`
}

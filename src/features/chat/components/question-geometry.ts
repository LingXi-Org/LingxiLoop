export type QuestionRect = { top: number; bottom: number }

/** Question blocks follow the existing thread's vertical DOM order. Geometry
 * lives for one frame only: earlier content reflow must remain observable. */
export function questionGeometry(count: number, rectAt: (index: number) => QuestionRect,
  bounds: QuestionRect, atBottom: boolean) {
  const measured = new Map<number, QuestionRect>()
  const rect = (index: number) => {
    let value = measured.get(index)
    if (!value) { value = rectAt(index); measured.set(index, value) }
    return value
  }
  const lowerBound = (before: (index: number) => boolean) => {
    let low = 0, high = count
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (before(middle)) low = middle + 1
      else high = middle
    }
    return low
  }
  const active = atBottom ? count - 1 : lowerBound(i => rect(i).top <= bounds.top + 24) - 1
  const visible: number[] = []
  for (let i = lowerBound(i => rect(i).bottom <= bounds.top); i < count && rect(i).top < bounds.bottom; i++) visible.push(i)
  return { active, visible }
}

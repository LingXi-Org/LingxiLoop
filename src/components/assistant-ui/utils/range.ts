/** Range normalization copied from the assistant-ui Elements registry. */
export function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function take<T>(items: readonly T[], count: number) {
  return items.slice(0, Math.floor(clamp(count, 0, items.length)))
}

export function pct(value: number, total: number) {
  if (!(total > 0)) return 0
  return clamp((value / total) * 100, 0, 100)
}

export function progressOf(index: number, total: number) {
  if (!(total > 0)) return 0
  return Math.floor(clamp(index, 0, total))
}

import type { ArtifactPage } from '../../../../shared/artifact-document'

/** 按固定参考版本的画板阅读顺序排列；来源见 THIRD_PARTY_NOTICES.md。 */
export function artboardsInReadingOrder<T extends Pick<ArtifactPage, 'x' | 'y' | 'height'>>(pages: readonly T[]): T[] {
  const rows: Array<{ bottom: number; mid: number; items: T[] }> = []
  for (const page of [...pages].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.at(-1)
    if (row && (page.y + page.height / 2 < row.bottom || page.y < row.mid)) {
      row.items.push(page)
      row.bottom = Math.max(row.bottom, page.y + page.height)
    } else rows.push({ bottom: page.y + page.height, mid: page.y + page.height / 2, items: [page] })
  }
  return rows.flatMap(row => row.items.sort((a, b) => a.x - b.x || a.y - b.y))
}

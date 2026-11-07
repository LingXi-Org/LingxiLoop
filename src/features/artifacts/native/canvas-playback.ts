import type { ArtifactPage } from '../../../../shared/artifact-document'

/** 播放菜单以每行首个画板的垂直中点分行；与导出的重叠分行规则不同。 */
export function designPlaybackGroups<T extends Pick<ArtifactPage, 'x' | 'y' | 'height' | 'interactive' | 'frameless'>>(pages: readonly T[]) {
  const eligible = pages.filter(page => !page.frameless).sort((a, b) => a.y - b.y || a.x - b.x)
  const rows: T[][] = []
  for (const page of eligible) {
    const row = rows.at(-1)
    if (!row || page.y >= row[0].y + row[0].height / 2) rows.push([page])
    else row.push(page)
  }
  const ordered = rows.flatMap(row => row.sort((a, b) => a.x - b.x))
  return { prototypes: ordered.filter(page => page.interactive === true), others: ordered.filter(page => page.interactive !== true) }
}

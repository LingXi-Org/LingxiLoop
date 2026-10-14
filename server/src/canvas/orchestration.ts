import { createHash } from 'node:crypto'


export const CANVAS_AGENT_COLORS = [
  '#E5533C', '#2D5FE0', '#1E7A4C', '#7A3FE0', '#D62A7E', '#C77800',
  '#0E8A8A', '#8E2E5C', '#497A14', '#B34616', '#156EAD', '#6A55C2',
] as const

export function canvasAgentColor(agentId: string, used: ReadonlySet<string>): string {
  const start = parseInt(createHash('sha256').update(agentId).digest('hex').slice(0, 8), 16) % CANVAS_AGENT_COLORS.length
  for (let offset = 0; offset < CANVAS_AGENT_COLORS.length; offset++) {
    const color = CANVAS_AGENT_COLORS[(start + offset) % CANVAS_AGENT_COLORS.length]
    if (!used.has(color)) return color
  }
  const hue = (start * 47 + used.size * 137.508) % 360
  return `hsl(${hue.toFixed(0)} 68% 48%)`
}

export function canvasWorkArea(index: number): { x: number; y: number; width: number; height: number } {
  const column = index % 3
  const row = Math.floor(index / 3)
  return { x: 100 + column * 760, y: 120 + row * 600, width: 680, height: 520 }
}

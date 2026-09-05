export function statusColor(status: string): string {
  switch (status) {
    case 'avail': return 'var(--avail)'
    case 'working': return 'var(--working)'
    case 'thinking': return 'var(--thinking)'
    case 'waiting': return 'var(--waiting)'
    case 'resting': return 'var(--resting)'
    default: return 'var(--resting)'
  }
}

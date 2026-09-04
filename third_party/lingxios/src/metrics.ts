/**
 * Minimal in-process metrics registry with Prometheus text exposition.
 * Counters, gauges, and fixed-bucket histograms — enough for operational
 * dashboards without pulling in a client library.
 */

type LabelValues = Record<string, string>

function labelKey(labels: LabelValues): string {
  const entries = Object.entries(labels).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return entries.map(([k, v]) => `${k}="${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`).join(',')
}

class Counter {
  private readonly series = new Map<string, number>()
  constructor(readonly name: string, readonly help: string) {}

  inc(labels: LabelValues = {}, delta = 1): void {
    const key = labelKey(labels)
    this.series.set(key, (this.series.get(key) ?? 0) + delta)
  }

  expose(): string[] {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`]
    for (const [key, value] of this.series) lines.push(`${this.name}${key ? `{${key}}` : ''} ${value}`)
    if (this.series.size === 0) lines.push(`${this.name} 0`)
    return lines
  }
}

class Gauge {
  private readonly series = new Map<string, number>()
  constructor(readonly name: string, readonly help: string) {}

  set(value: number, labels: LabelValues = {}): void {
    this.series.set(labelKey(labels), value)
  }

  expose(): string[] {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`]
    for (const [key, value] of this.series) lines.push(`${this.name}${key ? `{${key}}` : ''} ${value}`)
    if (this.series.size === 0) lines.push(`${this.name} 0`)
    return lines
  }
}

class Histogram {
  private readonly counts: Map<string, number[]> = new Map()
  private readonly sums = new Map<string, number>()
  private readonly totals = new Map<string, number>()

  constructor(readonly name: string, readonly help: string, readonly buckets: readonly number[]) {}

  observe(value: number, labels: LabelValues = {}): void {
    const key = labelKey(labels)
    let counts = this.counts.get(key)
    if (!counts) {
      counts = this.buckets.map(() => 0)
      this.counts.set(key, counts)
    }
    for (const [index, bound] of this.buckets.entries()) {
      if (value <= bound) counts[index] = (counts[index] ?? 0) + 1
    }
    this.sums.set(key, (this.sums.get(key) ?? 0) + value)
    this.totals.set(key, (this.totals.get(key) ?? 0) + 1)
  }

  expose(): string[] {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`]
    for (const [key, counts] of this.counts) {
      const prefix = key ? `${key},` : ''
      for (const [index, bound] of this.buckets.entries()) {
        lines.push(`${this.name}_bucket{${prefix}le="${bound}"} ${counts[index] ?? 0}`)
      }
      lines.push(`${this.name}_bucket{${prefix}le="+Inf"} ${this.totals.get(key) ?? 0}`)
      lines.push(`${this.name}_sum${key ? `{${key}}` : ''} ${this.sums.get(key) ?? 0}`)
      lines.push(`${this.name}_count${key ? `{${key}}` : ''} ${this.totals.get(key) ?? 0}`)
    }
    return lines
  }
}

export class MetricsRegistry {
  private readonly counters = new Map<string, Counter>()
  private readonly gauges = new Map<string, Gauge>()
  private readonly histograms = new Map<string, Histogram>()

  counter(name: string, help: string): Counter {
    let metric = this.counters.get(name)
    if (!metric) {
      metric = new Counter(name, help)
      this.counters.set(name, metric)
    }
    return metric
  }

  gauge(name: string, help: string): Gauge {
    let metric = this.gauges.get(name)
    if (!metric) {
      metric = new Gauge(name, help)
      this.gauges.set(name, metric)
    }
    return metric
  }

  histogram(name: string, help: string, buckets: readonly number[]): Histogram {
    let metric = this.histograms.get(name)
    if (!metric) {
      metric = new Histogram(name, help, buckets)
      this.histograms.set(name, metric)
    }
    return metric
  }

  expose(): string {
    const lines: string[] = []
    for (const metric of this.counters.values()) lines.push(...metric.expose())
    for (const metric of this.gauges.values()) lines.push(...metric.expose())
    for (const metric of this.histograms.values()) lines.push(...metric.expose())
    return `${lines.join('\n')}\n`
  }
}

export type { Counter, Gauge, Histogram }

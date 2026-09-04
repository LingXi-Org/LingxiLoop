/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Adapted from Kuma Mieru's StatusBlockIndicator and MonitoringChart:
 * https://github.com/Alice39s/kuma-mieru/tree/26a1ed33c1f5bfc77ba51fc61221a0c08dff2134/components/charts
 */
import { useMemo } from 'react'

export interface KumaHeartbeat {
  status: number
  time?: string
  ping?: number | null
  msg?: string
}

interface PingStats { p25: number; p50: number; p75: number; max: number }

function pingStats(heartbeats: KumaHeartbeat[]): PingStats | null {
  const values = heartbeats
    .filter((heartbeat) => heartbeat.status === 1 && Number.isFinite(heartbeat.ping))
    .map((heartbeat) => heartbeat.ping as number)
    .sort((a, b) => a - b)
  if (!values.length) return null
  return {
    p25: values[Math.floor(values.length * 0.25)],
    p50: values[Math.floor(values.length * 0.5)],
    p75: values[Math.floor(values.length * 0.75)],
    max: values.at(-1) ?? 0,
  }
}

function heartbeatColor(heartbeat: KumaHeartbeat, stats: PingStats | null): string {
  if (heartbeat.status === 0) return 'bg-destructive'
  if (heartbeat.status === 2) return 'bg-chart-1'
  if (heartbeat.status === 3) return 'bg-primary/35'
  if (!heartbeat.ping || !stats || heartbeat.ping <= stats.p50) return 'bg-primary'
  if (heartbeat.ping <= stats.p75) return 'bg-primary/80'
  return 'bg-primary/60'
}

function heartbeatLabel(status: number): string {
  if (status === 1) return '正常'
  if (status === 2) return '等待'
  if (status === 3) return '维护'
  return '异常'
}

export function StatusBlockIndicator({ heartbeats }: { heartbeats: KumaHeartbeat[] }) {
  const recent = useMemo(() => heartbeats.slice(-50), [heartbeats])
  const stats = useMemo(() => pingStats(recent), [recent])
  const up = recent.filter((heartbeat) => heartbeat.status === 1).length

  return <div
    className="flex h-3 min-w-0 gap-0.5 overflow-hidden rounded-sm"
    role="img"
    aria-label={`最近 ${recent.length} 次检查，${up} 次正常`}
  >
    {recent.map((heartbeat, index) => <span
      key={`${heartbeat.time ?? 'heartbeat'}-${index}`}
      className={`h-full min-w-0 flex-1 rounded-full ${heartbeatColor(heartbeat, stats)}`}
      title={`${heartbeatLabel(heartbeat.status)}${Number.isFinite(heartbeat.ping) ? ` · ${heartbeat.ping} ms` : ''}${heartbeat.time ? ` · ${heartbeat.time}` : ''}`}
      aria-hidden="true"
    />)}
  </div>
}

/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Adapted from Kuma Mieru's StatusBlockIndicator and MonitoringChart:
 * https://github.com/Alice39s/kuma-mieru/tree/26a1ed33c1f5bfc77ba51fc61221a0c08dff2134/components/charts
 */
import { useId, useMemo } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

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

function timestamp(value?: string): number | null {
  if (!value) return null
  const parsed = Date.parse(value.endsWith('Z') ? value : `${value}Z`)
  return Number.isFinite(parsed) ? parsed : null
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

export function MonitoringChart({ heartbeats }: { heartbeats: KumaHeartbeat[] }) {
  const gradientId = useId().replaceAll(':', '')
  const data = useMemo(() => heartbeats.slice(-50).flatMap((heartbeat) => {
    const time = timestamp(heartbeat.time)
    return time != null && Number.isFinite(heartbeat.ping)
      ? [{ time, ping: heartbeat.ping as number, status: heartbeat.status }]
      : []
  }), [heartbeats])
  const values = data.map(({ ping }) => ping).filter((ping) => ping > 0)
  const domain = values.length
    ? [Math.max(0, Math.min(...values) - 10), Math.max(...values) + 10]
    : [0, 100]
  const status = heartbeats.at(-1)?.status
  const color = status === 0 ? 'var(--destructive)' : status === 2 ? 'var(--chart-1)' : 'var(--primary)'

  if (!data.length) return <div className="grid h-16 place-items-center text-xs text-muted-foreground">暂无延迟数据</div>

  return <div className="h-16 min-w-0" role="img" aria-label="最近 50 次检查的延迟趋势">
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <AreaChart data={data} accessibilityLayer margin={{ top: 6, right: 1, bottom: 0, left: 1 }}>
        <defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="5%" stopColor={color} stopOpacity={0.28} />
          <stop offset="95%" stopColor={color} stopOpacity={0} />
        </linearGradient></defs>
        <XAxis dataKey="time" type="number" scale="time" domain={['dataMin', 'dataMax']} hide />
        <YAxis domain={domain} hide />
        <Tooltip
          labelFormatter={(value) => new Date(Number(value)).toLocaleString()}
          contentStyle={{ borderRadius: 10, borderColor: 'var(--border)', background: 'var(--popover)', color: 'var(--popover-foreground)', fontSize: 12 }}
        />
        <Area
          type="monotone"
          dataKey="ping"
          name="延迟"
          unit=" ms"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          connectNulls
          dot={false}
          activeDot={{ r: 3, fill: 'var(--background)', stroke: color, strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  </div>
}

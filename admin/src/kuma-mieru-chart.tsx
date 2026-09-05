/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Adapted from Kuma Mieru's MonitoringChart:
 * https://github.com/Alice39s/kuma-mieru/tree/26a1ed33c1f5bfc77ba51fc61221a0c08dff2134/components/charts
 */
import { useId, useMemo } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { KumaHeartbeat } from './kuma-mieru'

function timestamp(value?: string): number | null {
  if (!value) return null
  const parsed = Date.parse(value.endsWith('Z') ? value : `${value}Z`)
  return Number.isFinite(parsed) ? parsed : null
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

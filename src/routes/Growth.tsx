import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CategoryScale, Chart, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js'
import { Line } from 'react-chartjs-2'
import { db } from '../db/db'
import { METRICS } from '../lib/format'

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip)

const PERIODS = [
  { label: '1か月', days: 30 },
  { label: '3か月', days: 90 },
  { label: '全期間', days: Infinity },
]

export default function Growth() {
  const [metricKey, setMetricKey] = useState(METRICS[1]!.key)
  const [days, setDays] = useState(Infinity)
  const [now] = useState(() => Date.now())
  const sessions = useLiveQuery(() => db.sessions.orderBy('createdAt').toArray(), [])
  const def = METRICS.find((m) => m.key === metricKey)!
  const since = now - days * 86_400_000
  const shown = sessions?.filter((s) => s.createdAt >= since) ?? []
  const sent = sessions?.filter((s) => s.sent).length ?? 0
  const byGrade = new Map<string, number>()
  for (const s of sessions ?? []) if (s.sent) byGrade.set(s.grade, (byGrade.get(s.grade) ?? 0) + 1)

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold">成長</h1>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-800/70 p-3">
          <div className="text-xs text-slate-400">記録数</div>
          <div className="text-2xl font-bold">{sessions?.length ?? 0}</div>
        </div>
        <div className="rounded-lg bg-slate-800/70 p-3">
          <div className="text-xs text-slate-400">完登数</div>
          <div className="text-2xl font-bold">{sent}</div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold">指標の推移</h2>
        <div className="grid grid-cols-2 gap-2">
          <select
            aria-label="指標"
            className="rounded-lg bg-slate-800 p-2"
            value={metricKey}
            onChange={(e) => setMetricKey(e.target.value as typeof metricKey)}
          >
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <select aria-label="期間" className="rounded-lg bg-slate-800 p-2" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {PERIODS.map((p) => (
              <option key={p.label} value={p.days}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-slate-500">
          {def.hint}
          {def.higherIsBetter !== undefined && `（${def.higherIsBetter ? '高い' : '低い'}ほど良い）`}
        </p>
        {shown.length < 2 ? (
          <p className="rounded-lg bg-slate-800/50 p-4 text-sm text-slate-400">記録が 2 件以上になるとグラフが表示されます</p>
        ) : (
          <div className="rounded-lg bg-slate-800/50 p-2" data-testid="trend-chart">
            <Line
              aria-label={`${def.label}の推移グラフ`}
              data={{
                labels: shown.map((s) => new Date(s.createdAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })),
                datasets: [
                  {
                    data: shown.map((s) => s.metrics[def.key] as number),
                    borderColor: '#f97316',
                    backgroundColor: '#f97316',
                    tension: 0.3,
                  },
                ],
              }}
              options={{
                plugins: {
                  tooltip: {
                    callbacks: {
                      title: (items) => shown[items[0]!.dataIndex]?.problemName || '無題の課題',
                      label: (item) => def.format(item.parsed.y ?? 0),
                    },
                  },
                },
                scales: {
                  x: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
                  y: { ticks: { color: '#94a3b8', callback: (v) => def.format(Number(v)) }, grid: { color: '#1e293b' } },
                },
              }}
            />
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-2 font-semibold">グレード別完登数</h2>
        {byGrade.size === 0 ? (
          <p className="text-sm text-slate-400">まだ完登の記録がありません</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {[...byGrade].map(([g, n]) => (
              <li key={g} className="flex justify-between rounded bg-slate-800/50 px-3 py-2">
                <span>{g}</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

import type { Metrics } from '../analysis/types'
import { METRICS } from '../lib/format'

/** 指標カードの一覧。previous があれば前回比を表示 */
export default function MetricGrid({ metrics, previous }: { metrics: Metrics; previous?: Metrics }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {METRICS.map((d) => {
        const v = metrics[d.key] as number
        const p = previous?.[d.key] as number | undefined
        const diff = p === undefined ? 0 : v - p
        const better = d.higherIsBetter === undefined || diff === 0 ? undefined : diff > 0 === d.higherIsBetter
        return (
          <div key={d.key} className="rounded-lg bg-slate-800/70 p-3" title={d.hint}>
            <div className="text-xs text-slate-400">{d.label}</div>
            <div className="text-lg font-semibold">{d.format(v)}</div>
            {p !== undefined && diff !== 0 && (
              <div className={`text-xs ${better === undefined ? 'text-slate-400' : better ? 'text-lime-400' : 'text-rose-400'}`}>
                前回 {d.format(p)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

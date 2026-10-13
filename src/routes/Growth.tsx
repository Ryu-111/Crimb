import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'

/** 成長の振り返り（最小版）。推移グラフ等は docs/TASKS.md を参照 */
export default function Growth() {
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
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
      <p className="text-xs text-slate-500">指標の推移グラフは準備中です</p>
    </section>
  )
}

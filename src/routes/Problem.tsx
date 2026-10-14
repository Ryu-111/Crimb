import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useParams } from 'react-router-dom'
import { db } from '../db/db'
import { formatDate, METRICS } from '../lib/format'

/** 同じ課題のトライを指標ごとに横並びで比較 */
export default function Problem() {
  const name = useParams().name ?? ''
  const sessions = useLiveQuery(
    () => db.sessions.where('problemName').equals(name).sortBy('createdAt'),
    [name],
  )
  if (!sessions) return <p className="text-slate-400">読み込み中…</p>
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">{name}</h1>
        <p className="text-sm text-slate-400">
          {sessions.length} 回のトライ ・ 完登 {sessions.filter((s) => s.sent).length} 回
        </p>
      </header>
      <div className="overflow-x-auto rounded-lg bg-slate-800/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400">
              <th className="sticky left-0 bg-slate-900 p-2 text-left font-normal">指標</th>
              {sessions.map((s) => (
                <th key={s.id} className="p-2 text-right font-normal whitespace-nowrap">
                  <Link to={`/session/${s.id}`} className="underline">
                    {formatDate(s.createdAt)}
                  </Link>
                  <div className={s.sent ? 'text-lime-400' : ''}>{s.sent ? '完登' : 'トライ'}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map((d) => (
              <tr key={d.key} className="border-t border-slate-800">
                <th scope="row" className="sticky left-0 bg-slate-900 p-2 text-left font-normal whitespace-nowrap">
                  {d.label}
                </th>
                {sessions.map((s) => (
                  <td key={s.id} className="p-2 text-right whitespace-nowrap">
                    {d.format(s.metrics[d.key] as number)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { formatDate } from '../lib/format'
import Thumb from '../components/Thumb'

export default function Home() {
  const sessions = useLiveQuery(() => db.sessions.orderBy('createdAt').reverse().toArray(), [])
  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold">Crimb</h1>
      <Link to="/new" className="mb-6 block rounded-xl bg-accent py-4 text-center text-lg font-bold text-slate-950">
        ＋ 動画を解析する
      </Link>
      <h2 className="mb-2 text-sm text-slate-400">これまでの登り</h2>
      {sessions?.length === 0 && (
        <p className="rounded-lg bg-slate-800/50 p-4 text-sm text-slate-400">
          まだ記録がありません。登っている様子を撮影して解析してみましょう。
        </p>
      )}
      <ul className="space-y-2" data-testid="session-list">
        {sessions?.map((s) => (
          <li key={s.id}>
            <Link to={`/session/${s.id}`} className="flex items-center gap-3 rounded-lg bg-slate-800/70 p-2">
              <Thumb blob={s.thumbnail} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{s.problemName || '無題の課題'}</div>
                <div className="text-xs text-slate-400">
                  {s.grade} {s.wallAngle} ・ {formatDate(s.createdAt)}
                </div>
              </div>
              <span className={`text-xs font-bold ${s.sent ? 'text-lime-400' : 'text-slate-500'}`}>
                {s.sent ? '完登' : 'トライ'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { formatDate } from '../lib/format'
import Thumb from '../components/Thumb'
import { GRADES } from '../components/MetaFields'

export default function Home() {
  const sessions = useLiveQuery(() => db.sessions.orderBy('createdAt').reverse().toArray(), [])
  const [q, setQ] = useState('')
  const [grade, setGrade] = useState('')
  const [sent, setSent] = useState('')
  const shown = sessions?.filter(
    (s) =>
      s.problemName.toLowerCase().includes(q.trim().toLowerCase()) &&
      (!grade || s.grade === grade) &&
      (!sent || String(s.sent) === sent),
  )
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
      {!!sessions?.length && (
        <div className="mb-3 grid grid-cols-[1fr_auto_auto] gap-2 text-sm">
          <input
            type="search"
            aria-label="課題名で検索"
            placeholder="課題名で検索"
            className="min-w-0 rounded-lg bg-slate-800 p-2"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select aria-label="グレード" className="rounded-lg bg-slate-800 p-2" value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">全グレード</option>
            {GRADES.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <select aria-label="結果" className="rounded-lg bg-slate-800 p-2" value={sent} onChange={(e) => setSent(e.target.value)}>
            <option value="">すべて</option>
            <option value="true">完登</option>
            <option value="false">トライ</option>
          </select>
        </div>
      )}
      {sessions?.length !== 0 && shown?.length === 0 && <p className="text-sm text-slate-400">条件に合う記録がありません</p>}
      <ul className="space-y-2" data-testid="session-list">
        {shown?.map((s) => (
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

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDraft } from '../lib/draft'
import type { SessionMeta } from '../db/db'

const GRADES = ['10級', '9級', '8級', '7級', '6級', '5級', '4級', '3級', '2級', '1級', '初段', '二段', '三段']
const ANGLES = ['スラブ', '垂壁', '100°', '110°', '120°', '130°以上', 'ルーフ']

export default function NewSession() {
  const navigate = useNavigate()
  const { setDraft } = useDraft()
  const [file, setFile] = useState<File | null>(null)
  const [meta, setMeta] = useState<SessionMeta>({ problemName: '', grade: '5級', wallAngle: '垂壁', sent: true, notes: '' })
  const set = <K extends keyof SessionMeta>(k: K, v: SessionMeta[K]) => setMeta((m) => ({ ...m, [k]: v }))

  const start = () => {
    if (!file) return
    setDraft({ file, url: URL.createObjectURL(file), meta })
    navigate('/analyze')
  }

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold">動画を解析</h1>

      <div className="grid grid-cols-2 gap-2">
        <label className="cursor-pointer rounded-xl bg-slate-800 p-4 text-center">
          <div className="text-2xl">📹</div>
          <div className="text-sm">撮影する</div>
          <input
            type="file"
            accept="video/*"
            capture="environment"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="cursor-pointer rounded-xl bg-slate-800 p-4 text-center">
          <div className="text-2xl">🗂️</div>
          <div className="text-sm">動画を選ぶ</div>
          <input
            type="file"
            accept="video/*"
            className="hidden"
            data-testid="video-input"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      {file && <p className="truncate text-sm text-lime-400">✓ {file.name}</p>}

      <details className="rounded-lg bg-slate-800/50 p-3 text-sm text-slate-300">
        <summary className="cursor-pointer">上手に撮るコツ</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>スマホは三脚や床に置いて固定する</li>
          <li>壁の正面から、手足の先まで全身が常に入るように</li>
          <li>縦向きで、課題全体（スタートからゴール）を収める</li>
          <li>明るい場所で、他の人が映り込まないように</li>
        </ul>
      </details>

      <label className="block">
        <span className="text-sm text-slate-400">課題名</span>
        <input
          className="mt-1 w-full rounded-lg bg-slate-800 p-3"
          placeholder="例: 黄色テープ 3番"
          value={meta.problemName}
          onChange={(e) => set('problemName', e.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-sm text-slate-400">グレード</span>
          <select className="mt-1 w-full rounded-lg bg-slate-800 p-3" value={meta.grade} onChange={(e) => set('grade', e.target.value)}>
            {GRADES.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-slate-400">壁の角度</span>
          <select
            className="mt-1 w-full rounded-lg bg-slate-800 p-3"
            value={meta.wallAngle}
            onChange={(e) => set('wallAngle', e.target.value)}
          >
            {ANGLES.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[true, false].map((sent) => (
          <button
            key={String(sent)}
            className={`rounded-lg p-3 font-semibold ${meta.sent === sent ? 'bg-accent text-slate-950' : 'bg-slate-800'}`}
            onClick={() => set('sent', sent)}
          >
            {sent ? '完登' : 'トライ（落ち）'}
          </button>
        ))}
      </div>

      <button
        className="w-full rounded-xl bg-accent py-4 text-lg font-bold text-slate-950 disabled:opacity-40"
        disabled={!file}
        onClick={start}
      >
        解析スタート
      </button>
      <p className="text-center text-xs text-slate-500">動画は端末の中だけで解析され、外部には送信されません</p>
    </section>
  )
}

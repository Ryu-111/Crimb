import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDraft } from '../lib/draft'
import type { SessionMeta } from '../db/db'
import MetaFields from '../components/MetaFields'

export default function NewSession() {
  const navigate = useNavigate()
  const { setDraft } = useDraft()
  const [file, setFile] = useState<File | null>(null)
  const [meta, setMeta] = useState<SessionMeta>({ problemName: '', grade: '5級', wallAngle: '垂壁', sent: true, notes: '' })

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

      <MetaFields meta={meta} onChange={setMeta} />

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

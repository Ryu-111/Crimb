import type { Analysis, Limb } from '../analysis/types'

const ROWS: { label: string; limbs: Limb[]; color: string }[] = [
  { label: '手', limbs: ['leftHand', 'rightHand'], color: 'bg-sky-400' },
  { label: '足', limbs: ['leftFoot', 'rightFoot'], color: 'bg-lime-400' },
]

/** 静止/移動区間と手足の移動を時間軸に並べる。タップでその時刻へ */
export default function Timeline({
  analysis,
  duration,
  onSeek,
}: {
  analysis: Analysis
  duration: number
  onSeek?: (t: number) => void
}) {
  if (duration <= 0) return null
  const pos = (t: number) => `${(t / duration) * 100}%`
  const width = (a: number, b: number) => `${Math.max(0.5, ((b - a) / duration) * 100)}%`
  const fall = analysis.metrics.fallAt
  return (
    <div
      className="space-y-1 text-xs text-slate-400"
      // キーボード操作は動画プレーヤー側のシークで代替できるので、ここはタップ専用
      aria-hidden
      onClick={(e) => {
        if (!onSeek) return
        const r = e.currentTarget.getBoundingClientRect()
        // ラベル列 (2rem) を除いた幅で時刻に換算
        const x = (e.clientX - r.left - 32) / (r.width - 32)
        if (x >= 0) onSeek(Math.min(1, x) * duration)
      }}
    >
      <div className="flex items-center gap-1">
        <span className="w-7 shrink-0">動き</span>
        <div className="relative h-4 flex-1 rounded bg-slate-800">
          {analysis.moves.map((m, i) => (
            <div key={i} className="absolute h-full rounded bg-accent/80" style={{ left: pos(m.start), width: width(m.start, m.end) }} />
          ))}
          {fall !== null && <div className="absolute h-full w-0.5 bg-rose-500" style={{ left: pos(fall) }} title="落下" />}
        </div>
      </div>
      {ROWS.map((row) => (
        <div key={row.label} className="flex items-center gap-1">
          <span className="w-7 shrink-0">{row.label}</span>
          <div className="relative h-3 flex-1 rounded bg-slate-800">
            {analysis.limbMoves
              .filter((m) => row.limbs.includes(m.limb))
              .map((m, i) => (
                <div key={i} className={`absolute h-full rounded ${row.color}`} style={{ left: pos(m.start), width: width(m.start, m.end) }} />
              ))}
          </div>
        </div>
      ))}
      <div className="flex justify-between pl-8">
        <span>0秒</span>
        <span>{duration.toFixed(1)}秒</span>
      </div>
    </div>
  )
}

import type { Analysis } from '../analysis/types'

/** ムーブごとの所要時間と、その前に止まっていた時間。最も時間のかかったムーブを強調 */
export default function MoveList({ analysis, onSeek }: { analysis: Analysis; onSeek?: (t: number) => void }) {
  const { moves, stills } = analysis
  if (!moves.length) return null
  // moves[i] は stills[i] と stills[i+1] の間（segments.ts の detectStillsAndMoves）
  const rows = moves.map((m, i) => ({ ...m, sec: m.end - m.start, rest: stills[i]!.end - stills[i]!.start }))
  const hardest = rows.reduce((a, b) => (b.sec + b.rest > a.sec + a.rest ? b : a))
  return (
    <ol className="space-y-1 text-sm">
      {rows.map((r, i) => (
        <li key={i}>
          <button
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left ${
              r === hardest ? 'bg-amber-500/15 ring-1 ring-amber-500' : 'bg-slate-800/60'
            }`}
            disabled={!onSeek}
            onClick={() => onSeek?.(Math.max(0, r.start - r.rest))}
          >
            <span>
              {i + 1}手目 <span className="text-xs text-slate-400">{r.start.toFixed(1)}秒〜</span>
              {r === hardest && <span className="ml-2 text-xs text-amber-400">一番苦戦</span>}
            </span>
            <span className="text-xs text-slate-300">
              止まり {r.rest.toFixed(1)}秒 ・ 動き {r.sec.toFixed(1)}秒
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}

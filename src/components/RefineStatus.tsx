import type { RefineState } from '../pose/refine'

/** 結果画面の上に出す、精度を上げる解析の進み具合 */
export default function RefineStatus({ state }: { state: RefineState }) {
  if (state.status === 'failed') {
    return (
      <p role="status" className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-300">
        精度を上げる解析ができなかったため、速い解析の結果を表示しています。
      </p>
    )
  }
  if (state.status === 'done') {
    return (
      <p role="status" className="rounded-lg bg-emerald-900/40 px-3 py-2 text-sm text-emerald-300">
        精度を上げた結果に更新しました。
      </p>
    )
  }
  const pct = Math.round(state.progress * 100)
  return (
    <div role="status" className="space-y-1 rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-300">
      <p>速い解析の結果です。精度を上げる解析を続けていて、終わると自動で更新します（{pct}%）。</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-700" aria-hidden>
        <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

import type { Advice, Severity } from '../analysis/types'

const STYLE: Record<Severity, { label: string; cls: string }> = {
  high: { label: '重要', cls: 'border-rose-500 bg-rose-500/10' },
  medium: { label: '改善', cls: 'border-amber-500 bg-amber-500/10' },
  low: { label: 'ヒント', cls: 'border-sky-500 bg-sky-500/10' },
  good: { label: 'Good', cls: 'border-lime-500 bg-lime-500/10' },
}

export default function AdviceList({ advice, onJump }: { advice: Advice[]; onJump?: (t: number) => void }) {
  if (!advice.length) return <p className="text-sm text-slate-400">特に指摘はありません。いい登りです！</p>
  return (
    <ul className="space-y-2">
      {advice.map((a) => (
        <li key={a.id} className={`rounded-lg border-l-4 p-3 ${STYLE[a.severity].cls}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">{a.title}</span>
            <span className="shrink-0 text-xs text-slate-400">{STYLE[a.severity].label}</span>
          </div>
          <p className="mt-1 text-sm text-slate-300">{a.detail}</p>
          {a.t !== undefined && onJump && (
            <button className="-mx-2 mt-1 inline-flex min-h-11 items-center px-2 text-sm text-accent" onClick={() => onJump(a.t!)}>
              ▶ {a.t.toFixed(1)}秒の場面を見る
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

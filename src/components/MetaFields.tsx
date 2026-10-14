import type { SessionMeta } from '../db/db'

export const GRADES = ['10級', '9級', '8級', '7級', '6級', '5級', '4級', '3級', '2級', '1級', '初段', '二段', '三段']
export const ANGLES = ['スラブ', '垂壁', '100°', '110°', '120°', '130°以上', 'ルーフ']

/** 課題名・グレード・壁角度・完登・メモの入力欄（新規解析と記録の編集で共通） */
export default function MetaFields({ meta, onChange }: { meta: SessionMeta; onChange: (m: SessionMeta) => void }) {
  const set = <K extends keyof SessionMeta>(k: K, v: SessionMeta[K]) => onChange({ ...meta, [k]: v })
  return (
    <div className="space-y-4">
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
            type="button"
            aria-pressed={meta.sent === sent}
            className={`rounded-lg p-3 font-semibold ${meta.sent === sent ? 'bg-accent text-slate-950' : 'bg-slate-800'}`}
            onClick={() => set('sent', sent)}
          >
            {sent ? '完登' : 'トライ（落ち）'}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="text-sm text-slate-400">メモ</span>
        <textarea
          className="mt-1 w-full rounded-lg bg-slate-800 p-3"
          rows={2}
          placeholder="例: 3手目のヒールが決まらない"
          value={meta.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </label>
    </div>
  )
}

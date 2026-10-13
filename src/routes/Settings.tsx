/** 設定（最小版）。エクスポート/インポート等は docs/TASKS.md を参照 */
export default function Settings() {
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold">設定</h1>
      <div className="rounded-lg bg-slate-800/50 p-4 text-sm text-slate-300">
        <p>記録はこの端末のブラウザ（アプリ）内にだけ保存されます。</p>
        <p className="mt-2 text-slate-500">バックアップ（エクスポート/インポート）は準備中です。</p>
      </div>
      <p className="text-center text-xs text-slate-500">Crimb v{__APP_VERSION__}</p>
    </section>
  )
}

import { useEffect, useState } from 'react'
import { deleteAll, exportBackup, importBackup, isBackup } from '../db/backup'

const mb = (bytes = 0) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

export default function Settings() {
  const [message, setMessage] = useState<string>()
  const [usage, setUsage] = useState<StorageEstimate>()
  useEffect(() => {
    navigator.storage?.estimate().then(setUsage, () => {})
  }, [message])

  const download = async () => {
    const backup = await exportBackup()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }))
    a.download = `crimb-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setMessage(`${backup.sessions.length} 件を書き出しました`)
  }

  const upload = async (file?: File) => {
    if (!file) return
    try {
      const data: unknown = JSON.parse(await file.text())
      if (!isBackup(data)) throw new Error('Crimb のバックアップファイルではありません')
      const added = await importBackup(data)
      setMessage(`${added} 件を読み込みました（重複 ${data.sessions.length - added} 件はスキップ）`)
    } catch (e) {
      setMessage(`読み込みに失敗しました: ${(e as Error).message}`)
    }
  }

  const clear = async () => {
    if (!confirm('すべての記録と動画を削除します。元に戻せません。よろしいですか？')) return
    await deleteAll()
    setMessage('すべての記録を削除しました')
  }

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold">設定</h1>
      <div className="rounded-lg bg-slate-800/50 p-4 text-sm text-slate-300">
        <p>記録はこの端末のブラウザ（アプリ）内にだけ保存されます。機種変更や削除に備えて時々バックアップしてください。</p>
        {usage?.usage !== undefined && (
          <p className="mt-2 text-slate-400">
            使用容量: {mb(usage.usage)}
            {usage.quota ? ` / ${mb(usage.quota)}` : ''}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold">バックアップ</h2>
        <button className="w-full rounded-lg bg-slate-800 p-3" onClick={download}>
          ⬇️ 書き出す（JSON・動画は含みません）
        </button>
        <label className="block w-full cursor-pointer rounded-lg bg-slate-800 p-3 text-center">
          ⬆️ 読み込む
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            data-testid="import-input"
            onChange={(e) => {
              upload(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        {message && (
          <p role="status" className="text-sm text-lime-400">
            {message}
          </p>
        )}
      </div>

      <button className="w-full rounded-lg border border-rose-500/50 p-3 text-sm text-rose-400" onClick={clear}>
        すべての記録を削除
      </button>
      <p className="text-center text-xs text-slate-500">Crimb v{__APP_VERSION__}</p>
    </section>
  )
}

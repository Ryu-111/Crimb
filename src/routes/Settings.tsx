import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { deleteAll, exportBackup, importBackup, isBackup, MAX_BACKUP_BYTES } from '../db/backup'

const mb = (bytes = 0) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

export default function Settings() {
  const [message, setMessageState] = useState<{ text: string; error: boolean }>()
  const setMessage = (text: string, error = false) => setMessageState({ text, error })
  const [usage, setUsage] = useState<StorageEstimate>()
  useEffect(() => {
    navigator.storage?.estimate().then(setUsage, () => {})
  }, [message])

  const download = async () => {
    const backup = await exportBackup()
    const name = `crimb-backup-${new Date().toISOString().slice(0, 10)}.json`
    const file = new File([JSON.stringify(backup)], name, { type: 'application/json' })
    // iOS の PWA などダウンロードが不安定な環境では共有シート（「ファイルに保存」）を使う
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
        setMessage(`${backup.sessions.length} 件を書き出しました`)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setMessage(`書き出しに失敗しました: ${(e as Error).message}`, true)
      }
      return
    }
    // shortcut: Android アプリ（WebView）は <a download> を保存できない。@capacitor/filesystem 等を入れるまでは案内だけ出す
    if (Capacitor.isNativePlatform()) {
      setMessage('アプリ版ではまだ書き出しに対応していません', true)
      return
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(file)
    a.download = name
    a.click()
    // すぐに revoke すると Safari でダウンロードが失われることがあるので少し待つ
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    setMessage(`${backup.sessions.length} 件を書き出しました`)
  }

  const upload = async (file?: File) => {
    if (!file) return
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('ファイルが大きすぎます')
      const data: unknown = JSON.parse(await file.text())
      if (!isBackup(data)) throw new Error('Crimb のバックアップファイルではありません')
      const added = await importBackup(data)
      setMessage(`${added} 件を読み込みました（重複 ${data.sessions.length - added} 件はスキップ）`)
    } catch (e) {
      setMessage(`読み込みに失敗しました: ${(e as Error).message}`, true)
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
        <label className="block w-full cursor-pointer rounded-lg bg-slate-800 p-3 text-center focus-within:ring-2 focus-within:ring-accent">
          ⬆️ 読み込む
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            data-testid="import-input"
            onChange={(e) => {
              upload(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        {message && (
          <p role={message.error ? 'alert' : 'status'} className={`text-sm ${message.error ? 'text-rose-400' : 'text-lime-400'}`}>
            {message.text}
          </p>
        )}
      </div>

      <button className="w-full rounded-lg border border-rose-500/50 p-3 text-sm text-rose-400" onClick={clear}>
        すべての記録を削除
      </button>
      <p className="text-center text-xs text-slate-400">Crimb v{__APP_VERSION__}</p>
    </section>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { analyze } from '../analysis/metrics'
import { MAX_DURATION_SEC, captureThumbnail, checkFullBody, extractPoseTrack, loadVideo } from '../pose/extractFrames'
import { useDraft } from '../lib/draft'

export default function Analyze() {
  const { draft, setDraft } = useDraft()
  const navigate = useNavigate()
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('モデルを準備中…')
  const [error, setError] = useState<string>()
  const [truncated, setTruncated] = useState(false)
  const backRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (error) backRef.current?.focus()
  }, [error])

  /** 全身が映っていないときの「このまま解析」 */
  const [proceed, setProceed] = useState<() => void>()

  useEffect(() => {
    if (!draft) return
    const ctrl = new AbortController()
    // 解析中に画面が消えると端末によっては処理が止まるので、スリープを防ぐ（未対応なら何もしない）
    let lock: WakeLockSentinel | undefined
    let disposed = false
    navigator.wakeLock?.request('screen').then(
      (l) => (disposed ? void l.release() : (lock = l)),
      () => {},
    )
    ;(async () => {
      try {
        setStage('動画を読み込み中…')
        const video = await loadVideo(draft.url)
        setTruncated(video.duration > MAX_DURATION_SEC)
        setStage('撮影範囲を確認中…')
        if (!(await checkFullBody(video))) {
          await new Promise<void>((resolve) => setProceed(() => resolve))
          setProceed(undefined)
        }
        if (ctrl.signal.aborted) return
        setStage('姿勢を推定中…')
        const track = await extractPoseTrack(video, { onProgress: setProgress, signal: ctrl.signal })
        setStage('ムーブを解析中…')
        const analysis = analyze(track, draft.meta.wallAngle, draft.meta.sent)
        // E2E / 解析回帰テストから結果を読むためのフック
        ;(window as unknown as { __crimbLastAnalysis?: unknown }).__crimbLastAnalysis = analysis
        const thumbnail = await captureThumbnail(video, Math.min(video.duration / 2, 3))
        setDraft({ ...draft, track, analysis, thumbnail, createdAt: Date.now() })
        navigate('/result', { replace: true })
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message)
      }
    })()
    return () => {
      disposed = true
      ctrl.abort()
      lock?.release()
    }
    // draft.url が変わったときだけ再解析する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.url])

  if (!draft) return <Navigate to="/new" replace />

  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      {error ? (
        <>
          <p role="alert" className="text-rose-400">解析に失敗しました: {error}</p>
          <button ref={backRef} className="rounded-lg bg-slate-800 px-4 py-2" onClick={() => navigate('/new')}>
            戻る
          </button>
        </>
      ) : proceed ? (
        <div role="alert" className="flex flex-col gap-3 rounded-lg bg-slate-800 p-4">
          <p className="font-bold text-amber-300">全身が映っていないようです</p>
          <p className="text-sm text-slate-300">
            手先から足先まで全身が画面に収まるように撮ると、正しく解析できます。スマホは縦向きのまま、壁から少し離れて撮るのがおすすめです。
          </p>
          <div className="flex justify-center gap-3">
            <button className="rounded-lg bg-slate-700 px-4 py-2" onClick={() => navigate('/new')}>
              撮り直す
            </button>
            <button className="rounded-lg bg-accent px-4 py-2 font-bold text-slate-950" onClick={proceed}>
              このまま解析
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="text-4xl">🧗</div>
          <p aria-live="polite">{stage}</p>
          {truncated && (
            <p className="text-sm text-amber-400">動画が{MAX_DURATION_SEC / 60}分を超えているため、最初の{MAX_DURATION_SEC / 60}分だけを解析します</p>
          )}
          <div
            className="h-3 w-full overflow-hidden rounded-full bg-slate-800"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label={stage}
          >
            <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="text-sm text-slate-400">{Math.round(progress * 100)}%</p>
          <button className="inline-flex min-h-11 items-center px-2 text-sm text-slate-400 underline" onClick={() => navigate('/new')}>
            中止
          </button>
        </>
      )}
    </section>
  )
}

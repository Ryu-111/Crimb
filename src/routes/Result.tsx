import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { analyze } from '../analysis/metrics'
import type { Analysis, PoseTrack } from '../analysis/types'
import AdviceList from '../components/AdviceList'
import MetaFields from '../components/MetaFields'
import MetricGrid from '../components/MetricGrid'
import MoveList from '../components/MoveList'
import Timeline from '../components/Timeline'
import VideoOverlay, { type VideoOverlayHandle } from '../components/VideoOverlay'
import { db, deleteSession, previousSession, saveSession, type SessionMeta } from '../db/db'
import { useDraft } from '../lib/draft'
import { formatDate } from '../lib/format'
import { useObjectUrl } from '../lib/useObjectUrl'

interface ViewProps {
  meta: SessionMeta
  createdAt: number
  track: PoseTrack
  analysis: Analysis
  videoUrl?: string
  children?: React.ReactNode
}

function ResultView({ meta, createdAt, track, analysis, videoUrl, children }: ViewProps) {
  const { metrics, advice } = analysis
  const overlay = useRef<VideoOverlayHandle>(null)
  const seek = videoUrl ? (t: number) => overlay.current?.seek(t) : undefined
  const previous = useLiveQuery(
    () => (meta.problemName ? previousSession(meta.problemName, createdAt) : undefined),
    [meta.problemName, createdAt],
  )
  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">{meta.problemName || '無題の課題'}</h1>
        <p className="text-sm text-slate-400">
          {meta.grade} ・ {meta.wallAngle} ・ {meta.sent ? '完登' : 'トライ'} ・ {formatDate(createdAt)}
        </p>
        {meta.notes && <p className="mt-1 text-sm whitespace-pre-wrap text-slate-300">{meta.notes}</p>}
      </header>
      <VideoOverlay ref={overlay} src={videoUrl} track={track} />
      <Timeline analysis={analysis} duration={metrics.durationSec} onSeek={seek} />
      <div>
        <h2 className="mb-2 font-semibold">改善ポイント</h2>
        <AdviceList advice={advice} onJump={seek} />
      </div>
      {analysis.moves.length > 0 && (
        <div>
          <h2 className="mb-2 font-semibold">ムーブごとの振り返り</h2>
          <MoveList analysis={analysis} onSeek={seek} />
        </div>
      )}
      <div>
        <h2 className="mb-2 font-semibold">
          指標 {previous && <span className="text-xs font-normal text-slate-400">（前回 {formatDate(previous.createdAt)} と比較）</span>}
        </h2>
        <MetricGrid metrics={metrics} previous={previous?.metrics} />
        {previous && (
          <Link to={`/problem/${encodeURIComponent(meta.problemName)}`} className="mt-2 block text-sm text-accent">
            この課題のトライをすべて比較 →
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

/** 解析直後（未保存） */
export function DraftResult() {
  const { draft } = useDraft()
  const navigate = useNavigate()
  const [keepVideo, setKeepVideo] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const [saving, setSaving] = useState(false)
  if (!draft?.track || !draft.analysis || !draft.createdAt) return <Navigate to="/new" replace />
  const { track, analysis, createdAt } = draft

  const save = async () => {
    setSaving(true)
    setSaveError(undefined)
    const store = (video?: Blob) =>
      saveSession(
        {
          ...draft.meta,
          createdAt,
          metrics: analysis.metrics,
          advice: analysis.advice,
          thumbnail: draft.thumbnail,
          hasVideo: !!video,
        },
        track,
        video,
      )
    let id: number
    try {
      try {
        id = await store(keepVideo ? draft.file : undefined)
      } catch (e) {
        // 大きい動画は容量不足などで保存できないことがある。記録だけでも残す
        if (!keepVideo) throw e
        id = await store()
        alert('動画は容量不足などで保存できなかったため、記録のみ保存しました')
      }
    } catch (e) {
      setSaveError(`保存できませんでした: ${(e as Error).message}`)
      setSaving(false)
      return
    }
    // draft はここでは消さない（React Router の遷移は transition 扱いのため、先に draft が消えて
    // /new へリダイレクトされてしまう）。次の解析開始時に置き換えられ、そのとき Object URL も破棄される
    navigate(`/session/${id}`, { replace: true })
  }

  return (
    <ResultView
      meta={draft.meta}
      createdAt={createdAt}
      track={track}
      analysis={analysis}
      videoUrl={draft.url}
    >
      <div className="space-y-3 rounded-xl bg-slate-800/50 p-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={keepVideo} onChange={(e) => setKeepVideo(e.target.checked)} />
          動画も端末に保存する（容量を使います）
        </label>
        <button
          className="w-full rounded-xl bg-accent py-3 font-bold text-slate-950 disabled:opacity-50"
          disabled={saving}
          onClick={save}
        >
          記録を保存
        </button>
        {saveError && (
          <p role="alert" className="text-sm text-rose-400">
            {saveError}
          </p>
        )}
        <button className="min-h-11 w-full py-2 text-sm text-slate-400" onClick={() => navigate('/new')}>
          保存せずに戻る
        </button>
      </div>
    </ResultView>
  )
}

/** 保存済みセッション */
export function SavedResult() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  // undefined = 読み込み中、null = 見つからない（Dexie の get() は該当なしでも undefined を返すため区別する）
  const session = useLiveQuery(async () => (await db.sessions.get(id)) ?? null, [id])
  const track = useLiveQuery(async () => (await db.tracks.get(id)) ?? null, [id])
  const video = useLiveQuery(() => db.videos.get(id), [id])
  const videoUrl = useObjectUrl(video?.blob)
  const [editing, setEditing] = useState<SessionMeta>()

  // 解析ロジックが改善されたときに古い記録にも新しい改善案を出せるよう、保存済みの姿勢から再計算
  const analysis = useMemo(
    () => (track ? analyze(track.track, session?.wallAngle, session?.sent) : undefined),
    [track, session?.wallAngle, session?.sent],
  )

  // 成長グラフ・課題比較・前回比較は保存済みの指標を読むので、再計算結果と違えば書き戻して揃える
  // shortcut: 開いた記録だけが更新される。全件を揃えるなら一括再解析のマイグレーションを足す
  useEffect(() => {
    if (!session || !analysis) return
    const stale =
      JSON.stringify(session.metrics) !== JSON.stringify(analysis.metrics) ||
      JSON.stringify(session.advice) !== JSON.stringify(analysis.advice)
    if (stale) db.sessions.update(id, { metrics: analysis.metrics, advice: analysis.advice }).catch(() => {})
  }, [id, session, analysis])

  if (session === undefined || track === undefined) return <p className="text-slate-400">読み込み中…</p>
  if (!session || !track || !analysis) return <p className="text-slate-400">記録が見つかりません</p>

  const remove = async () => {
    if (!confirm('この記録を削除しますか？')) return
    await deleteSession(id)
    navigate('/', { replace: true })
  }

  const saveEdit = async () => {
    await db.sessions.update(id, { ...editing! })
    setEditing(undefined)
  }

  return (
    <ResultView
      meta={session}
      createdAt={session.createdAt}
      track={track.track}
      analysis={analysis}
      videoUrl={videoUrl}
    >
      {editing ? (
        <div className="space-y-3 rounded-xl bg-slate-800/50 p-4">
          <MetaFields meta={editing} onChange={setEditing} />
          <div className="grid grid-cols-2 gap-2">
            <button className="rounded-lg bg-slate-800 py-2" onClick={() => setEditing(undefined)}>
              キャンセル
            </button>
            <button className="rounded-lg bg-accent py-2 font-bold text-slate-950" onClick={saveEdit}>
              変更を保存
            </button>
          </div>
        </div>
      ) : (
        <button
          className="w-full rounded-lg bg-slate-800 py-2 text-sm"
          onClick={() =>
            setEditing({
              problemName: session.problemName,
              grade: session.grade,
              wallAngle: session.wallAngle,
              sent: session.sent,
              notes: session.notes,
            })
          }
        >
          記録を編集
        </button>
      )}
      <button className="w-full rounded-lg border border-rose-500/50 py-2 text-sm text-rose-400" onClick={remove}>
        この記録を削除
      </button>
    </ResultView>
  )
}

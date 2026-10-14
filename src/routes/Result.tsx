import { useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { analyze } from '../analysis/metrics'
import type { Analysis, PoseTrack } from '../analysis/types'
import AdviceList from '../components/AdviceList'
import MetricGrid from '../components/MetricGrid'
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
      </header>
      <VideoOverlay ref={overlay} src={videoUrl} track={track} />
      <Timeline analysis={analysis} duration={metrics.durationSec} onSeek={seek} />
      <div>
        <h2 className="mb-2 font-semibold">改善ポイント</h2>
        <AdviceList advice={advice} onJump={seek} />
      </div>
      <div>
        <h2 className="mb-2 font-semibold">
          指標 {previous && <span className="text-xs font-normal text-slate-400">（前回 {formatDate(previous.createdAt)} と比較）</span>}
        </h2>
        <MetricGrid metrics={metrics} previous={previous?.metrics} />
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
  const [saving, setSaving] = useState(false)
  if (!draft?.track || !draft.analysis || !draft.createdAt) return <Navigate to="/new" replace />
  const { track, analysis, createdAt } = draft

  const save = async () => {
    setSaving(true)
    const id = await saveSession(
      {
        ...draft.meta,
        createdAt,
        metrics: analysis.metrics,
        advice: analysis.advice,
        thumbnail: draft.thumbnail,
        hasVideo: keepVideo,
      },
      track,
      keepVideo ? draft.file : undefined,
    )
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
        <button className="w-full text-sm text-slate-400" onClick={() => navigate('/new')}>
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
  const session = useLiveQuery(() => db.sessions.get(id), [id])
  const track = useLiveQuery(() => db.tracks.get(id), [id])
  const video = useLiveQuery(() => db.videos.get(id), [id])
  const videoUrl = useObjectUrl(video?.blob)

  // 解析ロジックが改善されたときに古い記録にも新しい改善案を出せるよう、保存済みの姿勢から再計算
  const analysis = useMemo(() => (track ? analyze(track.track) : undefined), [track])

  if (session === undefined || track === undefined) return <p className="text-slate-400">読み込み中…</p>
  if (!session || !track || !analysis) return <p className="text-slate-400">記録が見つかりません</p>

  const remove = async () => {
    if (!confirm('この記録を削除しますか？')) return
    await deleteSession(id)
    navigate('/', { replace: true })
  }

  return (
    <ResultView
      meta={session}
      createdAt={session.createdAt}
      track={track.track}
      analysis={analysis}
      videoUrl={videoUrl}
    >
      <button className="w-full rounded-lg border border-rose-500/50 py-2 text-sm text-rose-400" onClick={remove}>
        この記録を削除
      </button>
    </ResultView>
  )
}

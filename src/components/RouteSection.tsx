import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { alignHolds, climbStart, findHolds, holdContacts, pickColor, routeOrder, wallTilt } from '../analysis/route'
import type { PoseTrack } from '../analysis/types'
import { grabFrame, loadVideo } from '../pose/video'
import { db, type SavedRoute } from '../db/db'
import { formatDate } from '../lib/format'
import type { Ghost } from './Route3D'

// three.js は大きいので、課題を表示するときだけ読み込む
const Route3D = lazy(() => import('./Route3D'))

/** 壁の写真の幅（ピクセル）。色の判定と 3D の貼り付けに使う */
const FRAME_WIDTH = 480

interface Props {
  videoUrl: string
  track: PoseTrack
  wallAngle?: string
  onSeek?: (t: number) => void
  /** 保存済みの課題（あれば最初から 3D で表示） */
  route?: SavedRoute
  onRouteChange?: (route: SavedRoute | undefined) => void
  /** 同じ課題の別のトライを重ねるための課題名と、この記録の id（候補から除く） */
  problemName?: string
  sessionId?: number
}

/**
 * 課題のホールドを 1 つタップすると、同じ色のホールドを拾って 3D で表示する。
 * shortcut: 壁の写真は動画の最初のコマを使う（登る前で体に隠れていないことが多いため）。隠れる動画が多ければコマを選べるようにする
 */
export default function RouteSection({ videoUrl, track, wallAngle, onSeek, route: saved, onRouteChange, problemName, sessionId }: Props) {
  const [frame, setFrame] = useState<{ canvas: HTMLCanvasElement; url: string }>()
  const [error, setError] = useState<string>()
  const [picked, setPicked] = useState<SavedRoute | null>()
  // 未選択（undefined）なら保存済みの課題を使う。選び直し中は null
  const route = picked === undefined ? saved : (picked ?? undefined)
  const holds = route?.holds
  const setRoute = (r: SavedRoute | undefined) => {
    setPicked(r ?? null)
    onRouteChange?.(r)
  }

  // 重ねる候補: 同じ課題で、課題のホールドを選んである別の記録
  const others = useLiveQuery(
    async () =>
      problemName
        ? (await db.sessions.where('problemName').equals(problemName).toArray()).filter((s) => s.id !== sessionId && s.route)
        : [],
    [problemName, sessionId],
  )
  const [ghostId, setGhostId] = useState<number>()
  const ghostTrack = useLiveQuery(async () => (ghostId ? (await db.tracks.get(ghostId))?.track : undefined), [ghostId])

  useEffect(() => {
    const live = { current: true }
    loadVideo(videoUrl)
      .then((v) => grabFrame(v, 0, FRAME_WIDTH))
      .then((canvas) => live.current && setFrame({ canvas, url: canvas.toDataURL('image/jpeg', 0.85) }))
      .catch(() => live.current && setError('動画からコマを取り出せませんでした'))
    return () => {
      live.current = false
    }
  }, [videoUrl])

  const contacts = useMemo(() => (holds ? holdContacts(track, holds) : []), [track, holds])
  const order = useMemo(() => routeOrder(contacts), [contacts])

  const ghostSession = others?.find((s) => s.id === ghostId)
  const ghost = useMemo((): Ghost | 'unaligned' | undefined => {
    if (!holds || !ghostTrack || !ghostSession?.route) return undefined
    const aspectG = ghostTrack.height / ghostTrack.width
    const aspect = track.height / track.width
    const t = alignHolds(ghostSession.route.holds, holds, aspectG, aspect)
    if (!t) return 'unaligned'
    const start = climbStart(contacts)
    const startG = climbStart(holdContacts(ghostTrack, ghostSession.route.holds))
    return {
      track: ghostTrack,
      map: (x, y) => ({ x: t.s * x + t.tx, y: (t.s * y * aspectG + t.ty) / aspect }),
      offset: startG - start,
    }
  }, [holds, ghostTrack, ghostSession, track, contacts])

  const pick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!frame) return
    const { canvas } = frame
    const r = e.currentTarget.getBoundingClientRect()
    const x = Math.round(((e.clientX - r.left) / r.width) * canvas.width)
    const y = Math.round(((e.clientY - r.top) / r.height) * canvas.height)
    const img = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height)
    const color = pickColor(img.data, canvas.width, canvas.height, x, y)
    if (!color) {
      setError('色がはっきりしたホールドをタップしてください（白・灰・黒のホールドには未対応です）')
      return
    }
    const found = findHolds(img.data, canvas.width, canvas.height, color)
    setError(found.length ? undefined : 'この色のホールドが見つかりませんでした。別のホールドをタップしてください')
    setRoute(found.length ? { holds: found, color } : undefined)
  }

  if (error && !frame) return <p className="text-sm text-slate-400">{error}</p>
  if (!frame) return <p className="text-sm text-slate-400">壁の写真を準備中…</p>

  return (
    <div className="space-y-3">
      {!holds ? (
        <>
          <p className="text-sm text-slate-300">課題のホールドを 1 つタップしてください。同じ色のホールドを拾って立体で表示します。</p>
          <img
            src={frame.url}
            alt="壁の写真。課題のホールドをタップ"
            onClick={pick}
            className="mx-auto block w-full max-w-xs cursor-crosshair rounded-xl"
            data-testid="route-frame"
          />
        </>
      ) : (
        <>
          <Suspense fallback={<p className="text-sm text-slate-400">3D 表示を読み込み中…</p>}>
            <Route3D
              image={frame.canvas}
              holds={route.holds}
              color={route.color}
              contacts={contacts}
              order={order}
              track={track}
              tilt={wallTilt(wallAngle)}
              ghost={typeof ghost === 'object' ? ghost : undefined}
            />
          </Suspense>
          <p className="text-xs text-slate-400">
            同じ色のホールド {holds.length} 個のうち {order.length} 個に触れました。ドラッグで回転、ピンチで拡大できます。カメラを固定して撮った動画で正確になります。
          </p>
          {others && others.length > 0 && (
            <label className="block space-y-1 text-sm">
              <span className="text-slate-300">同じ課題の別のトライを重ねる（緑の骨格と重心）</span>
              <select
                className="min-h-11 w-full rounded-lg bg-slate-800 px-3"
                value={ghostId ?? ''}
                onChange={(e) => setGhostId(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">重ねない</option>
                {others.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatDate(s.createdAt)}（{s.sent ? '完登' : 'トライ'}）
                  </option>
                ))}
              </select>
              {ghost === 'unaligned' && (
                <span role="alert" className="block text-rose-400">
                  ホールドの位置が合わせられませんでした。両方の記録で同じ色のホールドを選んでいるか確認してください
                </span>
              )}
              {typeof ghost === 'object' && (
                <span className="block text-xs text-slate-400">ホールドの位置で写真を重ね、課題に最初に触れた時刻で再生をそろえています。</span>
              )}
            </label>
          )}
          {contacts.length > 0 && (
            <ol className="space-y-1">
              {contacts.map((c, i) => (
                <li key={i}>
                  <button
                    className="grid min-h-11 w-full grid-cols-[2rem_3.5rem_3rem_1fr] items-center rounded-lg px-2 text-left text-sm hover:bg-slate-800"
                    onClick={() => onSeek?.(c.t)}
                    disabled={!onSeek}
                  >
                    <span className="font-bold text-accent">{order.indexOf(c.hold) + 1}</span>
                    <span className="text-slate-400 tabular-nums">{c.t.toFixed(1)}s</span>
                    <span className={c.limb.endsWith('足') ? 'text-sky-400' : 'text-accent'}>{c.limb}</span>
                    <span className="text-xs text-slate-400">{c.dur.toFixed(1)} 秒保持</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <button className="min-h-11 w-full rounded-lg bg-slate-800 py-2 text-sm" onClick={() => setRoute(undefined)}>
            別の色を選び直す
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-400">
          {error}
        </p>
      )}
    </div>
  )
}

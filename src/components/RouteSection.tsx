import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { alignHolds, climbStart, findHolds, holdContacts, pickColor, routeOrder, wallTilt } from '../analysis/route'
import type { PoseTrack } from '../analysis/types'
import { stabilize } from '../analysis/camera'
import type { Relief } from '../analysis/relief'
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
 * 壁の写真は最初のコマ（登る前で体に隠れていないことが多い）を使い、スライダーで別のコマも選べる
 */
export default function RouteSection({ videoUrl, track, wallAngle, onSeek, route: saved, onRouteChange, problemName, sessionId }: Props) {
  const [video, setVideo] = useState<HTMLVideoElement>()
  const [frameT, setFrameT] = useState(saved?.t ?? 0)
  const [frame, setFrame] = useState<{ canvas: HTMLCanvasElement; url: string }>()
  // シークが重なると別のコマが描かれることがあるので、コマの取り出しは 1 つずつ行う
  const grabbing = useRef(Promise.resolve())
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
  const [relief, setRelief] = useState<Relief>()
  const [depth, setDepth] = useState<{ progress?: number; loaded?: number; error?: string }>()

  // 壁の凹凸の推定（端末内）。モデルは大きいので押したときだけ読み込む
  const estimate = async () => {
    if (!frame) return
    setDepth({ progress: 0 })
    try {
      const { estimateRelief } = await import('../pose/depth')
      // progress: 0〜1 はダウンロードの割合（全体が分からなければ undefined）、1 で推定中
      const r = await estimateRelief(frame.canvas, (loaded, total) => setDepth({ progress: total ? loaded / total : undefined, loaded }))
      ;(globalThis as unknown as { __crimbLastRelief?: Relief }).__crimbLastRelief = r
      setRelief(r)
      setDepth(undefined)
    } catch (e) {
      setDepth({ error: `凹凸を推定できませんでした: ${(e as Error).message}` })
    }
  }

  useEffect(() => {
    const live = { current: true }
    loadVideo(videoUrl)
      .then((v) => live.current && setVideo(v))
      .catch(() => live.current && setError('動画からコマを取り出せませんでした'))
    return () => {
      live.current = false
    }
  }, [videoUrl])

  useEffect(() => {
    if (!video) return
    const live = { current: true }
    // スライダーを動かしている間は取り出さない
    const timer = setTimeout(() => {
      grabbing.current = grabbing.current
        .then(() => (live.current ? grabFrame(video, frameT, FRAME_WIDTH) : undefined))
        .then((canvas) => {
          if (!canvas || !live.current) return
          setFrame({ canvas, url: canvas.toDataURL('image/jpeg', 0.85) })
          setRelief(undefined)
        })
        .catch(() => {
          if (live.current) setError('動画からコマを取り出せませんでした')
        })
    }, 150)
    return () => {
      live.current = false
      clearTimeout(timer)
    }
  }, [video, frameT])

  // ホールドは壁の写真のコマの座標なので、手足もそのコマの座標に直してから比べる（カメラが動いても合う）
  const photoT = route?.t ?? 0
  const stable = useMemo(() => stabilize(track, photoT), [track, photoT])
  const contacts = useMemo(() => (holds ? holdContacts(stable, holds) : []), [stable, holds])
  const order = useMemo(() => routeOrder(contacts), [contacts])

  const ghostSession = others?.find((s) => s.id === ghostId)
  const ghost = useMemo((): Ghost | 'unaligned' | undefined => {
    if (!holds || !ghostTrack || !ghostSession?.route) return undefined
    const aspectG = ghostTrack.height / ghostTrack.width
    const aspect = track.height / track.width
    const t = alignHolds(ghostSession.route.holds, holds, aspectG, aspect)
    if (!t) return 'unaligned'
    const start = climbStart(contacts)
    const ghostStable = stabilize(ghostTrack, ghostSession.route.t ?? 0)
    const startG = climbStart(holdContacts(ghostStable, ghostSession.route.holds))
    return {
      track: ghostStable,
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
    if (!color) return
    const found = findHolds(img.data, canvas.width, canvas.height, color)
    setError(found.length ? undefined : 'この色のホールドが見つかりませんでした。別のホールドをタップしてください')
    setRoute(found.length ? { holds: found, color, t: frameT } : undefined)
  }

  if (error && !frame) return <p className="text-sm text-slate-400">{error}</p>
  if (!frame) return <p className="text-sm text-slate-400">壁の写真を準備中…</p>

  return (
    <div className="space-y-3">
      {!holds ? (
        <>
          <p className="text-sm text-slate-300">課題のホールドを 1 つタップしてください。同じ色のホールドを拾って立体で表示します。</p>
          {video && video.duration > 0 && (
            <label className="block space-y-1 text-sm">
              <span className="text-slate-300">
                壁の写真に使うコマ（{frameT.toFixed(1)} 秒）
                <span className="block text-xs text-slate-400">体でホールドが隠れていないコマを選ぶと、正しく拾えます</span>
              </span>
              <input
                type="range"
                min={0}
                max={Math.floor(video.duration * 10) / 10}
                step={0.1}
                value={frameT}
                onChange={(e) => setFrameT(Number(e.target.value))}
                className="h-11 w-full accent-orange-500"
                data-testid="route-frame-time"
              />
            </label>
          )}
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
              track={stable}
              tilt={wallTilt(wallAngle)}
              ghost={typeof ghost === 'object' ? ghost : undefined}
              relief={relief}
            />
          </Suspense>
          {!relief && (
            <div className="space-y-1">
              <button
                className="min-h-11 w-full rounded-lg bg-slate-800 py-2 text-sm disabled:opacity-60"
                onClick={estimate}
                disabled={depth !== undefined && !depth.error}
              >
                {depth && !depth.error
                  ? depth.progress === 1
                    ? '壁の凹凸を推定中…'
                    : depth.progress !== undefined
                      ? `モデルを読み込み中… ${Math.round(depth.progress * 100)}%`
                      : `モデルを読み込み中… ${((depth.loaded ?? 0) / 1e6).toFixed(1)}MB`
                  : '壁の凹凸を推定する'}
              </button>
              <p className="text-xs text-slate-400">
                写真 1 枚から奥行きを推定して、ハリボテやホールドの出っ張りを立体にします。初回だけ約 27MB のモデルをダウンロードします（写真は端末の外に送りません）。
              </p>
              {depth?.error && (
                <p role="alert" className="text-sm text-rose-400">
                  {depth.error}
                </p>
              )}
            </div>
          )}
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

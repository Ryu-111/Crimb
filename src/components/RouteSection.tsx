import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { findHolds, holdContacts, pickColor, routeOrder, wallTilt, type Hold, type Hsv } from '../analysis/route'
import type { PoseTrack } from '../analysis/types'
import { grabFrame, loadVideo } from '../pose/video'

// three.js は大きいので、課題を表示するときだけ読み込む
const Route3D = lazy(() => import('./Route3D'))

/** 壁の写真の幅（ピクセル）。色の判定と 3D の貼り付けに使う */
const FRAME_WIDTH = 480

interface Props {
  videoUrl: string
  track: PoseTrack
  wallAngle?: string
  onSeek?: (t: number) => void
}

/**
 * 課題のホールドを 1 つタップすると、同じ色のホールドを拾って 3D で表示する。
 * shortcut: 壁の写真は動画の最初のコマを使う（登る前で体に隠れていないことが多いため）。隠れる動画が多ければコマを選べるようにする
 */
export default function RouteSection({ videoUrl, track, wallAngle, onSeek }: Props) {
  const [frame, setFrame] = useState<{ canvas: HTMLCanvasElement; url: string }>()
  const [error, setError] = useState<string>()
  const [route, setRoute] = useState<{ holds: Hold[]; color: Hsv }>()
  const holds = route?.holds

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
            />
          </Suspense>
          <p className="text-xs text-slate-400">
            同じ色のホールド {holds.length} 個のうち {order.length} 個に触れました。ドラッグで回転、ピンチで拡大できます。カメラを固定して撮った動画で正確になります。
          </p>
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

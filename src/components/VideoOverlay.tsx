import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { Frame, PoseTrack } from '../analysis/types'
import { LM } from '../analysis/geometry'

const BONES: [number, number][] = [
  [LM.leftShoulder, LM.rightShoulder],
  [LM.leftShoulder, LM.leftElbow],
  [LM.leftElbow, LM.leftWrist],
  [LM.rightShoulder, LM.rightElbow],
  [LM.rightElbow, LM.rightWrist],
  [LM.leftShoulder, LM.leftHip],
  [LM.rightShoulder, LM.rightHip],
  [LM.leftHip, LM.rightHip],
  [LM.leftHip, LM.leftKnee],
  [LM.leftKnee, LM.leftAnkle],
  [LM.rightHip, LM.rightKnee],
  [LM.rightKnee, LM.rightAnkle],
]

export interface VideoOverlayHandle {
  seek: (t: number) => void
}

function frameAt(track: PoseTrack, t: number): Frame | undefined {
  const i = Math.round(t * track.fps)
  return track.frames[Math.min(track.frames.length - 1, Math.max(0, i))]
}

function comOf(f: Frame): { x: number; y: number } | null {
  const lm = f.lm
  if (!lm) return null
  const ids = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip, LM.leftHip, LM.rightHip]
  return {
    x: ids.reduce((a, i) => a + lm[i]!.x, 0) / ids.length,
    y: ids.reduce((a, i) => a + lm[i]!.y, 0) / ids.length,
  }
}

/** 動画の上に骨格と重心の軌跡を重ねて表示 */
const VideoOverlay = forwardRef<VideoOverlayHandle, { src?: string; track: PoseTrack }>(function VideoOverlay(
  { src, track },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useImperativeHandle(ref, () => ({
    seek: (t: number) => {
      const v = videoRef.current
      if (!v) return
      v.currentTime = t
      v.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
  }))

  useEffect(() => {
    let raf = 0
    const draw = () => {
      const v = videoRef.current
      const c = canvasRef.current
      const ctx = c?.getContext('2d')
      if (c && ctx) {
        const w = c.clientWidth
        const h = c.clientHeight
        if (c.width !== w * devicePixelRatio) {
          c.width = w * devicePixelRatio
          c.height = h * devicePixelRatio
        }
        ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        ctx.clearRect(0, 0, w, h)
        const t = v?.currentTime ?? 0
        // 重心の軌跡（ここまで）
        ctx.strokeStyle = 'rgba(251,191,36,0.8)'
        ctx.lineWidth = 2
        ctx.beginPath()
        let started = false
        for (const f of track.frames) {
          if (f.t > t) break
          const c0 = comOf(f)
          if (!c0) continue
          if (started) ctx.lineTo(c0.x * w, c0.y * h)
          else ctx.moveTo(c0.x * w, c0.y * h)
          started = true
        }
        ctx.stroke()
        const f = frameAt(track, t)
        if (f?.lm) {
          ctx.strokeStyle = '#38bdf8'
          ctx.lineWidth = 3
          for (const [a, b] of BONES) {
            const p = f.lm[a]!
            const q = f.lm[b]!
            if (p.v < 0.5 || q.v < 0.5) continue
            ctx.beginPath()
            ctx.moveTo(p.x * w, p.y * h)
            ctx.lineTo(q.x * w, q.y * h)
            ctx.stroke()
          }
          ctx.fillStyle = '#f97316'
          for (const i of [LM.leftWrist, LM.rightWrist, LM.leftAnkle, LM.rightAnkle]) {
            const p = f.lm[i]!
            if (p.v < 0.5) continue
            ctx.beginPath()
            ctx.arc(p.x * w, p.y * h, 5, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [track])

  return (
    <div
      className="relative mx-auto overflow-hidden rounded-xl bg-black"
      style={{
        aspectRatio: `${track.width} / ${track.height}`,
        width: `min(100%, calc(60vh * ${track.width / track.height}))`,
      }}
    >
      {src ? (
        <video ref={videoRef} src={src} controls playsInline muted className="absolute inset-0 h-full w-full" />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-sm text-slate-500">動画は保存されていません</div>
      )}
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  )
})

export default VideoOverlay

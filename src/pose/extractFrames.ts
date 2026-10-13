import type { Frame, PoseTrack } from '../analysis/types'
import { getLandmarker } from './landmarker'
import { cleanFrames } from './smoothing'

/** 解析するフレームレート */
export const SAMPLE_FPS = 15
/** 解析する動画の最大長 (秒) */
export const MAX_DURATION_SEC = 180

/** detectForVideo のタイムスタンプは解析をまたいで単調増加させる必要がある */
let clock = 0

export interface ExtractOptions {
  onProgress?: (ratio: number) => void
  signal?: AbortSignal
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      video.removeEventListener('seeked', done)
      video.removeEventListener('error', fail)
      resolve()
    }
    const fail = () => {
      video.removeEventListener('seeked', done)
      video.removeEventListener('error', fail)
      reject(new Error('動画の読み込みに失敗しました'))
    }
    video.addEventListener('seeked', done)
    video.addEventListener('error', fail)
    video.currentTime = t
  })
}

export function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = src
    video.addEventListener('loadeddata', () => resolve(video), { once: true })
    video.addEventListener('error', () => reject(new Error('この動画形式は再生できません')), { once: true })
    video.load()
  })
}

/** 動画を一定間隔でシークして姿勢を推定し、補間・平滑化した時系列を返す */
export async function extractPoseTrack(video: HTMLVideoElement, opts: ExtractOptions = {}): Promise<PoseTrack> {
  const landmarker = await getLandmarker()
  const duration = Math.min(video.duration || 0, MAX_DURATION_SEC)
  const step = 1 / SAMPLE_FPS
  const total = Math.max(1, Math.floor(duration / step))
  const frames: Frame[] = []
  for (let i = 0; i <= total; i++) {
    if (opts.signal?.aborted) throw new DOMException('解析を中止しました', 'AbortError')
    const t = Math.min(i * step, duration)
    await seek(video, t)
    clock += step * 1000
    const res = landmarker.detectForVideo(video, clock)
    const lm = res.landmarks[0]
    frames.push({
      t,
      lm: lm ? lm.map((p) => ({ x: round(p.x), y: round(p.y), v: round(p.visibility ?? 1) })) : null,
    })
    opts.onProgress?.(i / total)
  }
  return { fps: SAMPLE_FPS, width: video.videoWidth, height: video.videoHeight, frames: cleanFrames(frames) }
}

const round = (v: number) => Math.round(v * 1000) / 1000

/** 動画の指定時刻のサムネイル (JPEG) */
export async function captureThumbnail(video: HTMLVideoElement, t: number, width = 320): Promise<Blob | undefined> {
  await seek(video, t)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = Math.round((video.videoHeight / video.videoWidth) * width) || width
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), 'image/jpeg', 0.7))
}

import { fullBodyVisible } from '../analysis/geometry'
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

/** イベントが来ないまま止まる端末があるため、待ち時間の上限 (ms) */
const LOAD_TIMEOUT_MS = 15_000
const SEEK_TIMEOUT_MS = 5_000

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      video.removeEventListener('seeked', done)
      video.removeEventListener('error', fail)
    }
    const done = () => {
      cleanup()
      resolve()
    }
    const fail = () => {
      cleanup()
      reject(new Error('動画の読み込みに失敗しました'))
    }
    const timer = setTimeout(fail, SEEK_TIMEOUT_MS)
    video.addEventListener('seeked', done)
    video.addEventListener('error', fail)
    video.currentTime = t
  })
}

export function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const fail = () => {
      clearTimeout(timer)
      reject(new Error('この動画形式は再生できません'))
    }
    const timer = setTimeout(fail, LOAD_TIMEOUT_MS)
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = src
    // iOS は preload を無視して loadeddata まで進まないことがある。duration が分かれば十分（フレームは seek でデコードされる）
    video.addEventListener(
      'loadedmetadata',
      () => {
        clearTimeout(timer)
        resolve(video)
      },
      { once: true },
    )
    video.addEventListener('error', fail, { once: true })
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
    frames.push({ t, lm: detect(landmarker, video) })
    opts.onProgress?.(i / total)
  }
  return { fps: SAMPLE_FPS, width: video.videoWidth, height: video.videoHeight, frames: cleanFrames(frames) }
}

const round = (v: number) => Math.round(v * 1000) / 1000

function detect(landmarker: Awaited<ReturnType<typeof getLandmarker>>, video: HTMLVideoElement): Frame['lm'] {
  const lm = landmarker.detectForVideo(video, clock).landmarks[0]
  return lm ? lm.map((p) => ({ x: round(p.x), y: round(p.y), v: round(p.visibility ?? 1) })) : null
}

/** 冒頭 1.5 秒 (6 フレーム) を推定し、全身が映っているかを返す */
export async function checkFullBody(video: HTMLVideoElement): Promise<boolean> {
  const landmarker = await getLandmarker()
  const end = Math.min(video.duration || 0, 1.5)
  const frames: Frame[] = []
  for (let i = 0; i < 6; i++) {
    const t = (end * i) / 5
    await seek(video, t)
    clock += 1000 / SAMPLE_FPS
    frames.push({ t, lm: detect(landmarker, video) })
  }
  return fullBodyVisible(frames)
}

/** 動画の指定時刻のサムネイル (JPEG) */
export async function captureThumbnail(video: HTMLVideoElement, t: number, width = 320): Promise<Blob | undefined> {
  await seek(video, t)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = Math.round((video.videoHeight / video.videoWidth) * width) || width
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), 'image/jpeg', 0.7))
}

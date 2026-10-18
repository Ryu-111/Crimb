// 動画の読み込み・シーク・コマの取り出し（MediaPipe に依存しないので結果画面からも使える）
import { CAMERA_CHECK_WIDTH, medianCameraShift, toGray, type Gray } from '../analysis/camera'

/** イベントが来ないまま止まる端末があるため、待ち時間の上限 (ms) */
const LOAD_TIMEOUT_MS = 15_000
const SEEK_TIMEOUT_MS = 5_000

export function seek(video: HTMLVideoElement, t: number): Promise<void> {
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

/** 動画の指定時刻のコマを、幅 width のキャンバスに描く */
export async function grabFrame(video: HTMLVideoElement, t: number, width: number): Promise<HTMLCanvasElement> {
  await seek(video, t)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = Math.round((video.videoHeight / video.videoWidth) * width) || width
  canvas.getContext('2d', { willReadFrequently: true })?.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** 動画の指定時刻のサムネイル (JPEG) */
export async function captureThumbnail(video: HTMLVideoElement, t: number, width = 320): Promise<Blob | undefined> {
  const canvas = await grabFrame(video, t, width)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), 'image/jpeg', 0.7))
}

/** 動画全体から count コマを小さく取り出し、最初のコマからのカメラのずれの中央値（画像の幅に対する割合） */
export async function cameraShift(video: HTMLVideoElement, count = 8): Promise<number> {
  const d = Math.max(0, (video.duration || 0) - 0.1)
  const frames: Gray[] = []
  for (let i = 0; i < count; i++) {
    const canvas = await grabFrame(video, (d * i) / (count - 1), CAMERA_CHECK_WIDTH)
    const img = canvas.getContext('2d', { willReadFrequently: true })?.getImageData(0, 0, canvas.width, canvas.height)
    if (img) frames.push(toGray(img.data, img.width, img.height))
  }
  return medianCameraShift(frames)
}

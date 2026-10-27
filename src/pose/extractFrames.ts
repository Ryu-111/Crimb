import { dropImplausiblePoses, fullBodyVisible, isImplausible, poseAt, torsoLength } from '../analysis/geometry'
import type { Frame, Landmark, PoseTrack } from '../analysis/types'
import { trackCamera, toGray, type Gray } from '../analysis/camera'
import { mergePose, samePerson } from '../analysis/hybrid'
import { cropBox, uncrop } from './crop'
import { getLandmarker } from './landmarker'
import { seek } from './video'
import { cleanFrames } from './smoothing'

/** 解析するフレームレート */
export const SAMPLE_FPS = 15
/** 解析する動画の最大長 (秒) */
export const MAX_DURATION_SEC = 180
/** 両方のモデルが見失ったとき、直前の姿勢からこのコマ数（約 2 秒）以内なら、その周りを探し直す */
export const SEARCH_MAX_GAP = 30
/**
 * MediaPipe と YOLO が同じ人を指していて、MediaPipe がその人を追い続けている間は、YOLO はこのコマ数に 1 回だけ回す。
 * YOLO は 1 コマで MediaPipe より重いので、解析時間の多くを占めていた
 */
export const YOLO_CHECK_EVERY = 3

/** detectForVideo のタイムスタンプは解析をまたいで単調増加させる必要がある */
let clock = 0

export interface ExtractOptions {
  onProgress?: (ratio: number) => void
  signal?: AbortSignal
}

/** 動画を一定間隔でシークして姿勢を推定し、補間・平滑化した時系列を返す */
export async function extractPoseTrack(video: HTMLVideoElement, opts: ExtractOptions = {}): Promise<PoseTrack> {
  const landmarker = await getLandmarker()
  // MediaPipe が見失う人（後ろ向き・暗い服・小さく写る）を YOLO-pose で補う。読み込めなければ MediaPipe だけで続ける
  const yolo = await import('./yolo').then((m) => m.YoloTracker.create()).catch(() => null)
  const duration = Math.min(video.duration || 0, MAX_DURATION_SEC)
  const step = 1 / SAMPLE_FPS
  const total = Math.max(1, Math.floor(duration / step))
  const frames: Frame[] = []
  const yoloFrames: Frame['lm'][] = []
  const grays: Gray[] = []
  const small = document.createElement('canvas')
  small.width = CAMERA_TRACK_WIDTH
  small.height = Math.round((video.videoHeight / video.videoWidth) * CAMERA_TRACK_WIDTH) || CAMERA_TRACK_WIDTH
  const smallCtx = small.getContext('2d', { willReadFrequently: true })
  // 直前に分かっている姿勢（MediaPipe か YOLO）。両方が見失ったコマで探し直す手がかりにする
  let last: { i: number; lm: Landmark[] } | null = null
  // MediaPipe と YOLO が最後に同じ人を指したコマと、直前のコマの MediaPipe の姿勢
  let agreed = -Infinity
  let prevLm: Frame['lm'] = null
  for (let i = 0; i <= total; i++) {
    if (opts.signal?.aborted) throw new DOMException('解析を中止しました', 'AbortError')
    const t = Math.min(i * step, duration)
    await seek(video, t)
    clock += step * 1000
    const lm = detect(landmarker, video)
    frames.push({ t, lm })
    if (yolo) {
      let y: Frame['lm'] = null
      // MediaPipe が別の人や壁の模様に飛び移ったら（腰が大きく動いたら）、すぐ YOLO で確かめる
      if (lm && prevLm && samePerson(lm, prevLm) && i - agreed < YOLO_CHECK_EVERY) yolo.follow(video, lm)
      else {
        y = await yolo.detect(video)
        if (!lm && !y && last && i - last.i <= SEARCH_MAX_GAP) y = await yolo.search(video, last.lm)
        if (lm && y && samePerson(lm, y)) agreed = i
      }
      yoloFrames.push(y)
      const known = mergePose(lm, y)
      if (known) last = { i, lm: known }
    }
    prevLm = lm
    if (smallCtx) {
      smallCtx.drawImage(video, 0, 0, small.width, small.height)
      grays.push(toGray(smallCtx.getImageData(0, 0, small.width, small.height).data, small.width, small.height))
    }
    opts.onProgress?.(i / total)
  }
  const track: PoseTrack = { fps: SAMPLE_FPS, width: video.videoWidth, height: video.videoHeight, frames }
  const detected = await redetect(landmarker, video, track, opts.signal)
  const merged = yolo ? detected.map((f, i) => ({ ...f, lm: mergePose(f.lm, yoloFrames[i] ?? null) })) : detected
  const cleaned = cleanFrames(merged)
  return { ...track, frames: cleaned, camera: grays.length === cleaned.length ? cameraOffsets(grays, cleaned) : undefined }
}

/** カメラのずれを求める画像の幅（ピクセル） */
const CAMERA_TRACK_WIDTH = 128

/** コマごとのカメラのずれ（正規化画像座標）。人の写っている範囲は壁の模様ではないので比べない */
function cameraOffsets(grays: Gray[], frames: Frame[]): { dx: number; dy: number }[] {
  const masks = grays.map((g, i) => {
    const lm = frames[i]?.lm
    if (!lm) return undefined
    const mask = new Uint8Array(g.width * g.height).fill(1)
    const xs = lm.map((p) => p.x)
    const ys = lm.map((p) => p.y)
    const x0 = Math.max(0, Math.floor((Math.min(...xs) - 0.05) * g.width))
    const x1 = Math.min(g.width, Math.ceil((Math.max(...xs) + 0.05) * g.width))
    const y0 = Math.max(0, Math.floor((Math.min(...ys) - 0.05) * g.height))
    const y1 = Math.min(g.height, Math.ceil((Math.max(...ys) + 0.05) * g.height))
    for (let y = y0; y < y1; y++) mask.fill(0, y * g.width + x0, y * g.width + Math.max(x0, x1))
    return mask
  })
  return trackCamera(grays, masks).map(({ dx, dy }, i) => ({ dx: dx / grays[i]!.width, dy: dy / grays[i]!.height }))
}

/** 検出し直すのは、正しい姿勢からこの秒数以内のフレームまで（戻した姿勢も次の手がかりにする） */
export const REDETECT_MAX_GAP_SEC = 1
/** 続けてこの回数失敗したら、その先は画面外とみなして諦める（1 回の検出は通常の約 2 倍かかる） */
export const REDETECT_MAX_MISSES = 3

/**
 * 検出なし・ありえない姿勢のフレームを、近くの正しい姿勢の周りを切り抜いて検出し直す。
 * VIDEO モードは直前の位置を追跡するので、壁の模様を人と誤検出すると数秒間抜け出せない。
 * 切り抜きで人のいる位置を教えることで、追跡の初期値の代わりにする。前向き → 後ろ向きの順に広げる
 */
async function redetect(landmarker: Landmarker, video: HTMLVideoElement, track: PoseTrack, signal?: AbortSignal): Promise<Frame[]> {
  const torso = torsoLength(dropImplausiblePoses(track))
  const frames = track.frames.map((f) => ({ ...f }))
  const good = frames.map((f) => {
    const p = poseAt(f, track)
    return p !== null && !isImplausible(p, torso)
  })
  if (good.every(Boolean) || !good.some(Boolean)) return frames
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return frames
  await landmarker.setOptions({ runningMode: 'IMAGE' })
  try {
    for (const dir of [1, -1]) {
      let ref = -1
      let misses = 0
      for (let k = 0; k < frames.length; k++) {
        if (signal?.aborted) throw new DOMException('解析を中止しました', 'AbortError')
        const i = dir === 1 ? k : frames.length - 1 - k
        if (good[i]) {
          ref = i
          misses = 0
          continue
        }
        if (ref < 0 || misses >= REDETECT_MAX_MISSES || Math.abs(frames[i]!.t - frames[ref]!.t) > REDETECT_MAX_GAP_SEC) continue
        misses++
        const box = cropBox(frames[ref]!.lm!, track.width, track.height)
        await seek(video, frames[i]!.t)
        const size = Math.min(512, Math.round(box.size))
        canvas.width = size
        canvas.height = size
        ctx.drawImage(video, box.x, box.y, box.size, box.size, 0, 0, size, size)
        const lm = landmarker.detect(canvas).landmarks[0]
        if (!lm) continue
        const frame = { t: frames[i]!.t, lm: toLandmarks(uncrop(toLandmarks(lm), box, track.width, track.height)) }
        const p = poseAt(frame, track)
        if (!p || isImplausible(p, torso)) continue
        frames[i] = frame
        good[i] = true
        ref = i
        misses = 0
      }
    }
  } finally {
    await landmarker.setOptions({ runningMode: 'VIDEO' })
  }
  return frames
}

type Landmarker = Awaited<ReturnType<typeof getLandmarker>>

const round = (v: number) => Math.round(v * 1000) / 1000

function toLandmarks(lm: { x: number; y: number; visibility?: number; v?: number }[]): Landmark[] {
  return lm.map((p) => ({ x: round(p.x), y: round(p.y), v: round(p.v ?? p.visibility ?? 1) }))
}

function detect(landmarker: Landmarker, video: HTMLVideoElement): Frame['lm'] {
  const lm = landmarker.detectForVideo(video, clock).landmarks[0]
  return lm ? toLandmarks(lm) : null
}

/** 動画全体から 6 フレームを推定し、全身が画面に収まっているかを返す */
export async function checkFullBody(video: HTMLVideoElement): Promise<boolean> {
  const landmarker = await getLandmarker()
  // 冒頭は壁に歩いて近づく場面が多く体が画面に入りきらないので、動画全体（10%〜90%）から 6 フレームを見る
  const d = Math.min(video.duration || 0, MAX_DURATION_SEC)
  const frames: Frame[] = []
  for (let i = 0; i < 6; i++) {
    const t = d * (0.1 + (0.8 * i) / 5)
    // VIDEO モードは直前フレームの位置を手がかりに追跡するので、数秒飛ばすと外れる。直前の 2 フレームで追い付かせてから判定
    let lm: Frame['lm'] = null
    for (const dt of [2, 1, 0]) {
      await seek(video, Math.max(0, t - dt / SAMPLE_FPS))
      clock += 1000 / SAMPLE_FPS
      lm = detect(landmarker, video)
    }
    frames.push({ t, lm })
  }
  return fullBodyVisible(frames)
}

import type { Frame, Landmark, PoseTrack } from './types'

/** MediaPipe Pose のランドマーク番号 */
export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const

export const MIN_VISIBILITY = 0.5

export interface Vec {
  x: number
  y: number
}

/** 正規化座標をアスペクト比を考慮した平面座標に変換（y の単位 = 画像の高さ） */
export function toPlane(p: Landmark, aspect: number): Vec {
  return { x: p.x * aspect, y: p.y }
}

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function mid(a: Vec, b: Vec): Vec {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** b を頂点とする角 abc（度） */
export function angle(a: Vec, b: Vec, c: Vec): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y }
  const v2 = { x: c.x - b.x, y: c.y - b.y }
  const n = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)
  if (n === 0) return 180
  const cos = Math.min(1, Math.max(-1, (v1.x * v2.x + v1.y * v2.y) / n))
  return (Math.acos(cos) * 180) / Math.PI
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}

/** 1 フレームを扱いやすくしたビュー */
export class Pose {
  constructor(
    private readonly lm: Landmark[],
    private readonly aspect: number,
  ) {}

  get(i: number): Vec {
    return toPlane(this.lm[i]!, this.aspect)
  }

  visible(...idx: number[]): boolean {
    return idx.every((i) => (this.lm[i]?.v ?? 0) >= MIN_VISIBILITY)
  }

  get shoulderMid(): Vec {
    return mid(this.get(LM.leftShoulder), this.get(LM.rightShoulder))
  }

  get hipMid(): Vec {
    return mid(this.get(LM.leftHip), this.get(LM.rightHip))
  }

  /** 重心の近似（肩中点と腰中点の重み付き平均。腰寄り） */
  get com(): Vec {
    const s = this.shoulderMid
    const h = this.hipMid
    return { x: s.x * 0.4 + h.x * 0.6, y: s.y * 0.4 + h.y * 0.6 }
  }

  get torso(): number {
    return dist(this.shoulderMid, this.hipMid)
  }
}

export function poseAt(frame: Frame, track: PoseTrack): Pose | null {
  if (!frame.lm) return null
  const p = new Pose(frame.lm, track.width / track.height)
  return p.visible(LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip) ? p : null
}

/** 体格の基準長（胴の長さの中央値） */
export function torsoLength(track: PoseTrack): number {
  const values: number[] = []
  for (const f of track.frames) {
    const p = poseAt(f, track)
    if (p) values.push(p.torso)
  }
  return median(values) || 0.25
}

const FULL_BODY = [
  LM.leftShoulder,
  LM.rightShoulder,
  LM.leftHip,
  LM.rightHip,
  LM.leftWrist,
  LM.rightWrist,
  LM.leftAnkle,
  LM.rightAnkle,
]

/** 肩・腰・手首・足首がすべて見えているフレームが半数以上なら true（解析前の撮影チェック） */
export function fullBodyVisible(frames: Frame[]): boolean {
  const ok = frames.filter((f) => f.lm && FULL_BODY.every((i) => (f.lm?.[i]?.v ?? 0) >= MIN_VISIBILITY)).length
  return frames.length > 0 && ok * 2 >= frames.length
}

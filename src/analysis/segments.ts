import { LM, poseAt, type Vec } from './geometry'
import type { Limb, LimbMove, PoseTrack, Segment } from './types'

/** 重心がこれ以下の速さ (胴長/秒) なら静止とみなす */
export const STILL_SPEED = 0.35
/** 静止とみなす最短時間 (秒) */
export const MIN_STILL_SEC = 0.4
/** 手足が「動いた」とみなす速さ (胴長/秒) と移動量 (胴長) */
export const LIMB_SPEED = 1.0
export const LIMB_MIN_DISPLACEMENT = 0.3

/** 各フレームの点の速さ (単位/秒)。点が無いフレームは NaN。 */
export function speeds(points: (Vec | null)[], times: number[]): number[] {
  return points.map((p, i) => {
    const prev = i > 0 ? points[i - 1] : null
    const next = i < points.length - 1 ? points[i + 1] : null
    if (!p) return NaN
    const a = prev ?? p
    const b = next ?? p
    const ta = prev ? times[i - 1]! : times[i]!
    const tb = next ? times[i + 1]! : times[i]!
    if (tb === ta) return 0
    return Math.hypot(b.x - a.x, b.y - a.y) / (tb - ta)
  })
}

/** 条件を満たすフレームの連続区間を [開始, 終了] のインデックスで返す */
export function runIndices(flags: boolean[]): [number, number][] {
  const out: [number, number][] = []
  let start = -1
  for (let i = 0; i <= flags.length; i++) {
    if (i < flags.length && flags[i]) {
      if (start < 0) start = i
    } else if (start >= 0) {
      out.push([start, i - 1])
      start = -1
    }
  }
  return out
}

/** 条件を満たすフレームの連続区間（minSec 未満は捨てる） */
export function runs(flags: boolean[], times: number[], minSec: number): Segment[] {
  return runIndices(flags)
    .map(([a, b]) => ({ start: times[a]!, end: times[b]! }))
    .filter((s) => s.end - s.start >= minSec)
}

export function comPoints(track: PoseTrack): (Vec | null)[] {
  return track.frames.map((f) => poseAt(f, track)?.com ?? null)
}

/** 静止区間と、その間の移動区間（ムーブ） */
export function detectStillsAndMoves(track: PoseTrack, torso: number): { stills: Segment[]; moves: Segment[] } {
  const times = track.frames.map((f) => f.t)
  const sp = speeds(comPoints(track), times).map((s) => s / torso)
  const stills = runs(
    sp.map((s) => !Number.isNaN(s) && s < STILL_SPEED),
    times,
    MIN_STILL_SEC,
  )
  const moves: Segment[] = []
  for (let i = 1; i < stills.length; i++) {
    moves.push({ start: stills[i - 1]!.end, end: stills[i]!.start })
  }
  return { stills, moves }
}

const LIMB_INDEX: Record<Limb, number> = {
  leftHand: LM.leftWrist,
  rightHand: LM.rightWrist,
  leftFoot: LM.leftAnkle,
  rightFoot: LM.rightAnkle,
}

/** 手足それぞれの移動イベント（ホールド/スタンスの持ち替え・置き換え） */
export function detectLimbMoves(track: PoseTrack, torso: number): LimbMove[] {
  const times = track.frames.map((f) => f.t)
  const out: LimbMove[] = []
  for (const limb of Object.keys(LIMB_INDEX) as Limb[]) {
    const idx = LIMB_INDEX[limb]
    const pts = track.frames.map((f) => {
      const p = poseAt(f, track)
      return p && p.visible(idx) ? p.get(idx) : null
    })
    const sp = speeds(pts, times).map((s) => s / torso)
    for (const [i0, i1] of runIndices(sp.map((s) => !Number.isNaN(s) && s > LIMB_SPEED))) {
      // 動き出す直前と止まった直後の位置で移動量を測る
      const a0 = Math.max(0, i0 - 1)
      const b0 = Math.min(pts.length - 1, i1 + 1)
      const a = pts[a0] ?? pts[i0]
      const b = pts[b0] ?? pts[i1]
      if (a && b && Math.hypot(b.x - a.x, b.y - a.y) / torso >= LIMB_MIN_DISPLACEMENT) {
        out.push({ start: times[i0]!, end: times[i1]!, limb })
      }
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

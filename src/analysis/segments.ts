import { LM, poseAt, type Vec } from './geometry'
import type { Limb, LimbMove, PoseTrack, Segment } from './types'

/** 重心がこれ以下の速さ (胴長/秒) なら静止とみなす */
export const STILL_SPEED = 0.35
/** 静止とみなす最短時間 (秒) */
export const MIN_STILL_SEC = 0.4
/** 手足が「動いた」とみなす速さ (胴長/秒) と移動量 (胴長) */
export const LIMB_SPEED = 1.0
export const LIMB_MIN_DISPLACEMENT = 0.3
/** 手足が「置かれている」とみなす速さ (胴長/秒) と最短時間 (秒) */
export const LIMB_STILL_SPEED = 0.5
export const LIMB_MIN_HOLD_SEC = 0.3
/** 手足はこの visibility から使う。背面撮影では手首が体や壁に隠れて低めに出るため、体幹（0.5）より緩くする */
export const LIMB_VISIBILITY = 0.3

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

/**
 * 手足それぞれの移動イベント（ホールド/スタンスの持ち替え・置き換え）。
 * 手足が止まっていた位置（≥ LIMB_MIN_HOLD_SEC）から次に止まった位置へ LIMB_MIN_DISPLACEMENT 以上動いたら 1 回。
 * 検出のブレや手持ちカメラの揺れは「2 か所に止まる」形にならないので数えない。
 */
export function detectLimbMoves(track: PoseTrack, torso: number): LimbMove[] {
  const times = track.frames.map((f) => f.t)
  const out: LimbMove[] = []
  for (const limb of Object.keys(LIMB_INDEX) as Limb[]) {
    const idx = LIMB_INDEX[limb]
    const pts = track.frames.map((f) => {
      const p = poseAt(f, track)
      return p && p.vis(idx) >= LIMB_VISIBILITY ? p.get(idx) : null
    })
    const sp = speeds(pts, times).map((s) => s / torso)
    const holds = runIndices(sp.map((s) => !Number.isNaN(s) && s < LIMB_STILL_SPEED)).filter(
      ([a, b]) => times[b]! - times[a]! >= LIMB_MIN_HOLD_SEC,
    )
    const center = ([a, b]: [number, number]) => {
      const ps = pts.slice(a, b + 1).filter((p) => p !== null)
      return { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length }
    }
    for (let i = 1; i < holds.length; i++) {
      const prev = holds[i - 1]!
      const next = holds[i]!
      const a = center(prev)
      const b = center(next)
      if (Math.hypot(b.x - a.x, b.y - a.y) / torso >= LIMB_MIN_DISPLACEMENT) {
        out.push({ start: times[prev[1]]!, end: times[next[0]]!, limb })
      }
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

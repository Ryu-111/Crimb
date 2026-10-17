import { LM, poseAt, type Vec } from './geometry'
import type { Limb, LimbMove, PoseTrack, Segment } from './types'

/** 重心がこれ以下の速さ (胴長/秒) なら静止とみなす */
export const STILL_SPEED = 0.35
/** 静止とみなす最短時間 (秒) */
export const MIN_STILL_SEC = 0.4
/** 手足が「動いた」とみなす移動量 (胴長) */
export const LIMB_MIN_DISPLACEMENT = 0.3
/**
 * 手足が「置かれている」: 前後 LIMB_STILL_WINDOW 秒の点がすべて平均位置から LIMB_STILL_RADIUS (胴長) 以内。
 * フレーム間の速さで判定すると、遠くから撮った動画では検出のブレだけで静止が途切れる
 */
export const LIMB_STILL_WINDOW = 0.3
export const LIMB_STILL_RADIUS = 0.25
export const LIMB_MIN_HOLD_SEC = 0.2
/**
 * 手足はこの visibility から使う。背面撮影では手首が体や壁に隠れて低く出る。
 * 低い値の点はブレるが、上の「一定範囲に留まる」条件を満たさない限り数えないので緩くしてよい
 */
export const LIMB_VISIBILITY = 0.2

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
    const center = (ps: Vec[]) => ({
      x: ps.reduce((s, p) => s + p.x, 0) / ps.length,
      y: ps.reduce((s, p) => s + p.y, 0) / ps.length,
    })
    // 前後 LIMB_STILL_WINDOW 秒の範囲だけを見る（全コマを毎回走査すると、長い動画で計算量がコマ数の二乗になる）。時刻は昇順
    let lo = 0
    let hi = 0
    const still = pts.map((p, i) => {
      while (times[lo]! < times[i]! - LIMB_STILL_WINDOW - 1e-9) lo++
      if (hi < i) hi = i
      while (hi + 1 < times.length && times[hi + 1]! <= times[i]! + LIMB_STILL_WINDOW + 1e-9) hi++
      if (!p) return false
      const near = pts.slice(lo, hi + 1).filter((q): q is Vec => q !== null)
      if (near.length < 3) return false
      const c = center(near)
      return near.every((q) => Math.hypot(q.x - c.x, q.y - c.y) / torso <= LIMB_STILL_RADIUS)
    })
    const holds = runIndices(still)
      .filter(([a, b]) => times[b]! - times[a]! >= LIMB_MIN_HOLD_SEC)
      .map(([a, b]): [number, number, Vec] => [a, b, center(pts.slice(a, b + 1).filter((p) => p !== null))])
    for (let i = 1; i < holds.length; i++) {
      const prev = holds[i - 1]!
      const next = holds[i]!
      const a = prev[2]
      const b = next[2]
      if (Math.hypot(b.x - a.x, b.y - a.y) / torso >= LIMB_MIN_DISPLACEMENT) {
        out.push({ start: times[prev[1]]!, end: times[next[0]]!, limb })
      }
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

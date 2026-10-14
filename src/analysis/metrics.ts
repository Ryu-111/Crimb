import { angle, dist, dropImplausiblePoses, LM, mean, mid, poseAt, torsoLength, type Pose } from './geometry'
import { comPoints, detectLimbMoves, detectStillsAndMoves } from './segments'
import type { Analysis, Frame, Metrics, PoseTrack, Segment } from './types'
import { buildAdvice } from './rules'

/** この角度以上なら腕が伸びているとみなす (度) */
export const STRAIGHT_ARM_DEG = 150
/** 落下判定: この時間 (秒) 以内に重心がこの距離 (胴長) 以上下がる */
export const FALL_WINDOW_SEC = 1.0
export const FALL_DROP = 1.5
/** 1 フレームでこれ以上（胴長）重心が動いたら検出の飛び（瞬間移動）とみなす。自由落下でも 15 fps なら 0.5 程度 */
export const MAX_COM_STEP = 0.8

function inSegments(t: number, segs: Segment[]): boolean {
  return segs.some((s) => t >= s.start && t <= s.end)
}

/** 片腕の肘角度（体重がかかっている＝手首が肩より上の腕のみ）。該当なしなら null */
function loadedElbowAngles(p: Pose): number[] {
  const out: number[] = []
  const arms = [
    [LM.leftShoulder, LM.leftElbow, LM.leftWrist],
    [LM.rightShoulder, LM.rightElbow, LM.rightWrist],
  ] as const
  for (const [s, e, w] of arms) {
    if (!p.visible(s, e, w)) continue
    if (p.get(w).y > p.get(s).y) continue
    out.push(angle(p.get(s), p.get(e), p.get(w)))
  }
  return out
}

/** 片手が下がっている（シェイク・チョーク中） */
function isShaking(p: Pose, torso: number): boolean {
  const sy = p.shoulderMid.y
  return [LM.leftWrist, LM.rightWrist].some((w) => p.visible(w) && p.get(w).y > sy + 0.6 * torso)
}

export function detectFall(track: PoseTrack, torso: number): number | null {
  const com = comPoints(track)
  const frames = track.frames
  // 飛び乗り・スタートの座り込みを除くため、重心がそれまでの最も低い位置より胴長 1 つ分上がってから判定
  // （最初のフレームを基準にすると、画面に入ってくる途中の崩れた姿勢が高く出たときに判定が始まらない）
  let lowest = -Infinity
  let started = false
  for (let i = 0; i < frames.length; i++) {
    const a = com[i]
    if (!a) continue
    lowest = Math.max(lowest, a.y)
    if (!started && (lowest - a.y) / torso >= 1) started = true
    if (!started) continue
    // 画面の上端に体が掛かっている場面からの「落下」は、上半身が画面外に出た検出の乱れであることが多い
    if (a.y - torso < 0.05) continue
    for (let j = i + 1; j < frames.length && frames[j]!.t - frames[i]!.t <= FALL_WINDOW_SEC; j++) {
      const b = com[j]
      const prev = com[j - 1]
      // 途中で検出が途切れたり瞬間移動したりする区間は落下とみなさない
      if (!b || !prev || dist(prev, b) / torso > MAX_COM_STEP) break
      if ((b.y - a.y) / torso >= FALL_DROP) return frames[i]!.t
    }
  }
  return null
}

function climbFrames(track: PoseTrack, fallAt: number | null): Frame[] {
  return fallAt === null ? track.frames : track.frames.filter((f) => f.t < fallAt)
}

/** sent: 完登した記録なら、最後の飛び降りを落下として改善案に出さない（以降のフレームは除外する） */
export function analyze(raw: PoseTrack, wallAngle?: string, sent?: boolean): Analysis {
  const track = dropImplausiblePoses(raw)
  const torso = torsoLength(track)
  const frames = track.frames
  const durationSec = frames.length ? frames[frames.length - 1]!.t - frames[0]!.t : 0
  const detected = frames.filter((f) => poseAt(f, track))
  const dropAt = detectFall(track, torso)
  const fallAt = sent ? null : dropAt
  const climbing: PoseTrack = { ...track, frames: climbFrames(track, dropAt) }

  const { stills, moves } = detectStillsAndMoves(climbing, torso)
  const limbMoves = detectLimbMoves(climbing, torso)
  const stillSec = stills.reduce((a, s) => a + s.end - s.start, 0)
  const climbSec = climbing.frames.length
    ? climbing.frames[climbing.frames.length - 1]!.t - climbing.frames[0]!.t
    : 0

  const elbow: number[] = []
  const sway: number[] = []
  const hipPos: number[] = []
  let shakeFrames = 0
  let posedFrames = 0
  for (const f of climbing.frames) {
    const p = poseAt(f, climbing)
    if (!p) continue
    posedFrames++
    if (isShaking(p, torso)) shakeFrames++
    if (!inSegments(f.t, stills)) continue
    elbow.push(...loadedElbowAngles(p))
    if (p.visible(LM.leftAnkle, LM.rightAnkle)) {
      const feet = mid(p.get(LM.leftAnkle), p.get(LM.rightAnkle))
      sway.push(Math.abs(p.com.x - feet.x) / torso)
      if (p.visible(LM.leftWrist, LM.rightWrist)) {
        const handsY = Math.min(p.get(LM.leftWrist).y, p.get(LM.rightWrist).y)
        const span = feet.y - handsY
        if (span > 0.5 * torso) hipPos.push((p.hipMid.y - handsY) / span)
      }
    }
  }

  const com = comPoints(climbing).filter((c) => c !== null)
  let pathLen = 0
  for (let i = 1; i < com.length; i++) pathLen += dist(com[i - 1]!, com[i]!)
  const first = com[0]
  const last = com[com.length - 1]
  const straight = first && last ? dist(first, last) : 0
  const handMoves = limbMoves.filter((m) => m.limb.endsWith('Hand')).length
  const footMoves = limbMoves.filter((m) => m.limb.endsWith('Foot')).length

  const metrics: Metrics = {
    durationSec,
    detectionRate: frames.length ? detected.length / frames.length : 0,
    stillRatio: climbSec > 0 ? stillSec / climbSec : 0,
    moveCount: moves.length,
    avgMoveSec: moves.length ? mean(moves.map((m) => m.end - m.start)) : 0,
    longestStillSec: Math.max(0, ...stills.map((s) => s.end - s.start)),
    straightArmRatio: elbow.length ? elbow.filter((a) => a >= STRAIGHT_ARM_DEG).length / elbow.length : 0,
    handMoves,
    footMoves,
    footHandRatio: handMoves ? footMoves / handMoves : 0,
    pathEfficiency: pathLen > 0 ? Math.min(1, straight / pathLen) : 0,
    lateralSway: mean(sway),
    hipPosition: mean(hipPos),
    shakeRatio: posedFrames ? shakeFrames / posedFrames : 0,
    verticalGain: first && last ? (first.y - Math.min(...com.map((c) => c.y))) / torso : 0,
    fallAt,
  }

  return { metrics, advice: buildAdvice(metrics, { stills, limbMoves, track: climbing, torso, wallAngle, elbowSamples: elbow.length, sent }), stills, moves, limbMoves }
}

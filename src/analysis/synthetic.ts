/**
 * テスト・デモ用の合成クライマー。キーフレーム間を補間して PoseTrack を作る。
 * 座標は正規化画像座標 (0..1, y は下向き)。
 */
import { LM } from './geometry'
import type { Landmark, PoseTrack } from './types'

export interface P {
  x: number
  y: number
}

export interface Keyframe {
  t: number
  hip: P
  lHand: P
  rHand: P
  lFoot: P
  rFoot: P
  /** 肘の曲がり具合 0 = 伸びている, 1 = 大きく曲がる */
  bend?: number
}

const TORSO = 0.12

function lerpP(a: P, b: P, r: number): P {
  return { x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r }
}

function elbow(shoulder: P, wrist: P, bend: number, side: 1 | -1): P {
  const m = lerpP(shoulder, wrist, 0.5)
  const dx = wrist.x - shoulder.x
  const dy = wrist.y - shoulder.y
  const len = Math.hypot(dx, dy) || 1
  // 腕に垂直な方向へ外側にずらして肘を曲げる
  return { x: m.x + (-dy / len) * bend * 0.08 * side, y: m.y + (dx / len) * bend * 0.08 * side }
}

export function poseFromKeyframe(k: Keyframe): Landmark[] {
  const bend = k.bend ?? 0
  const lShoulder = { x: k.hip.x - 0.04, y: k.hip.y - TORSO }
  const rShoulder = { x: k.hip.x + 0.04, y: k.hip.y - TORSO }
  const lHip = { x: k.hip.x - 0.03, y: k.hip.y }
  const rHip = { x: k.hip.x + 0.03, y: k.hip.y }
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: k.hip.x, y: k.hip.y - TORSO * 1.3, v: 1 }))
  const set = (i: number, p: P) => (lm[i] = { x: p.x, y: p.y, v: 1 })
  set(LM.leftShoulder, lShoulder)
  set(LM.rightShoulder, rShoulder)
  set(LM.leftHip, lHip)
  set(LM.rightHip, rHip)
  set(LM.leftWrist, k.lHand)
  set(LM.rightWrist, k.rHand)
  set(LM.leftElbow, elbow(lShoulder, k.lHand, bend, -1))
  set(LM.rightElbow, elbow(rShoulder, k.rHand, bend, 1))
  set(LM.leftAnkle, k.lFoot)
  set(LM.rightAnkle, k.rFoot)
  set(LM.leftKnee, lerpP(lHip, k.lFoot, 0.5))
  set(LM.rightKnee, lerpP(rHip, k.rFoot, 0.5))
  return lm
}

export function synthesize(keys: Keyframe[], fps = 15, aspect = 9 / 16): PoseTrack {
  const frames = []
  const end = keys[keys.length - 1]!.t
  for (let i = 0; i * (1 / fps) <= end + 1e-9; i++) {
    const t = i / fps
    let a = keys[0]!
    let b = keys[keys.length - 1]!
    for (let j = 0; j < keys.length - 1; j++) {
      if (t >= keys[j]!.t && t <= keys[j + 1]!.t) {
        a = keys[j]!
        b = keys[j + 1]!
        break
      }
    }
    const r = b.t === a.t ? 0 : Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)))
    const k: Keyframe = {
      t,
      hip: lerpP(a.hip, b.hip, r),
      lHand: lerpP(a.lHand, b.lHand, r),
      rHand: lerpP(a.rHand, b.rHand, r),
      lFoot: lerpP(a.lFoot, b.lFoot, r),
      rFoot: lerpP(a.rFoot, b.rFoot, r),
      bend: (a.bend ?? 0) + ((b.bend ?? 0) - (a.bend ?? 0)) * r,
    }
    frames.push({ t, lm: poseFromKeyframe(k) })
  }
  return { fps, width: Math.round(1080 * aspect), height: 1080, frames }
}

interface ClimbOptions {
  /** 腕の曲がり (0..1) */
  bend?: number
  /** 手を出すごとに足も上げるか */
  useFeet?: boolean
  /** 各ポジションでの静止秒数 */
  pause?: number
  /** 最後に落下するか */
  fall?: boolean
  /** 手を出す回数 */
  moves?: number
}

/** 手と足を交互に上げながら登る単純なシナリオ */
export function climb({ bend = 0, useFeet = true, pause = 1, fall = false, moves = 6 }: ClimbOptions = {}): PoseTrack {
  const keys: Keyframe[] = []
  let t = 0
  let hipY = 0.8
  const reach = 0.25 - bend * 0.08
  let lHand = { x: 0.42, y: hipY - reach }
  let rHand = { x: 0.58, y: hipY - reach }
  let lFoot = { x: 0.44, y: 0.95 }
  let rFoot = { x: 0.56, y: 0.95 }
  const push = () => keys.push({ t, hip: { x: 0.5, y: hipY }, lHand, rHand, lFoot, rFoot, bend })
  push()
  for (let i = 0; i < moves; i++) {
    t += pause
    push()
    const step = 0.06
    if (useFeet) {
      // 足を上げてから腰を上げる
      t += 0.4
      lFoot = i % 2 === 0 ? { ...lFoot, y: lFoot.y - 0.08 } : lFoot
      rFoot = i % 2 === 1 ? { ...rFoot, y: rFoot.y - 0.08 } : rFoot
      hipY -= step
      push()
    } else {
      hipY -= step * 0.3
    }
    t += pause
    push()
    // 手を出す
    t += 0.5
    // 高い方の手よりさらに上のホールドへ
    const target = Math.min(lHand.y, rHand.y) - step
    if (i % 2 === 0) lHand = { ...lHand, y: target }
    else rHand = { ...rHand, y: target }
    push()
  }
  t += pause
  push()
  if (fall) {
    t += 0.6
    hipY += 0.4
    lHand = { ...lHand, y: lHand.y + 0.4 }
    rHand = { ...rHand, y: rHand.y + 0.4 }
    lFoot = { ...lFoot, y: Math.min(1, lFoot.y + 0.4) }
    rFoot = { ...rFoot, y: Math.min(1, rFoot.y + 0.4) }
    push()
    t += 0.5
    push()
  }
  return synthesize(keys)
}

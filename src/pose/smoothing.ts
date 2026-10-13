import type { Frame, Landmark } from '../analysis/types'

/** この秒数以下の検出抜けは前後から線形補間する */
export const MAX_GAP_SEC = 0.5

function lerp(a: Landmark[], b: Landmark[], r: number): Landmark[] {
  return a.map((p, i) => {
    const q = b[i]!
    return { x: p.x + (q.x - p.x) * r, y: p.y + (q.y - p.y) * r, v: Math.min(p.v, q.v) }
  })
}

/** 短い検出抜けを補間 */
export function fillGaps(frames: Frame[], maxGapSec = MAX_GAP_SEC): Frame[] {
  const out = frames.map((f) => ({ ...f }))
  let lastIdx = -1
  for (let i = 0; i < out.length; i++) {
    if (!out[i]!.lm) continue
    if (lastIdx >= 0 && i - lastIdx > 1) {
      const a = out[lastIdx]!
      const b = out[i]!
      if (b.t - a.t <= maxGapSec) {
        for (let k = lastIdx + 1; k < i; k++) {
          out[k] = { t: out[k]!.t, lm: lerp(a.lm!, b.lm!, (out[k]!.t - a.t) / (b.t - a.t)) }
        }
      }
    }
    lastIdx = i
  }
  return out
}

/** 中心移動平均でジッターを除去（検出のあるフレームのみを平均） */
export function smooth(frames: Frame[], window = 5): Frame[] {
  const half = Math.floor(window / 2)
  return frames.map((f, i) => {
    if (!f.lm) return f
    const neighbors: Landmark[][] = []
    for (let k = Math.max(0, i - half); k <= Math.min(frames.length - 1, i + half); k++) {
      const lm = frames[k]!.lm
      if (lm) neighbors.push(lm)
    }
    const lm = f.lm.map((p, j) => {
      let x = 0
      let y = 0
      for (const n of neighbors) {
        x += n[j]!.x
        y += n[j]!.y
      }
      return { x: x / neighbors.length, y: y / neighbors.length, v: p.v }
    })
    return { t: f.t, lm }
  })
}

export function cleanFrames(frames: Frame[]): Frame[] {
  return smooth(fillGaps(frames))
}

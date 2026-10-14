import { describe, expect, it } from 'vitest'
import { buildAdvice, THRESHOLDS, wallKind } from './rules'
import type { Metrics } from './types'

const base: Metrics = {
  durationSec: 10,
  detectionRate: 1,
  stillRatio: 0.5,
  moveCount: 5,
  avgMoveSec: 1,
  longestStillSec: 2,
  straightArmRatio: 0.5,
  handMoves: 5,
  footMoves: 5,
  footHandRatio: 1,
  pathEfficiency: 0.8,
  lateralSway: 0.1,
  hipPosition: 0.5,
  shakeRatio: 0.1,
  verticalGain: 2,
  fallAt: null,
}
const ctx = { stills: [], limbMoves: [], track: { fps: 15, width: 1, height: 1, frames: [] }, torso: 0.1 }
const ids = (m: Partial<Metrics>) => buildAdvice({ ...base, ...m }, ctx).map((a) => a.id)

describe('buildAdvice thresholds', () => {
  it('gives no advice for an average climb', () => {
    expect(ids({})).toEqual([])
  })

  it('triggers strictly beyond each threshold, not at it', () => {
    const T = THRESHOLDS
    expect(ids({ detectionRate: T.minDetectionRate })).not.toContain('capture')
    expect(ids({ detectionRate: T.minDetectionRate - 0.01 })).toContain('capture')
    expect(ids({ straightArmRatio: T.straightArmLow })).not.toContain('straight-arm')
    expect(ids({ straightArmRatio: T.straightArmLow - 0.01 })).toContain('straight-arm')
    expect(ids({ straightArmRatio: T.straightArmGood })).toContain('straight-arm-good')
    expect(ids({ footHandRatio: T.footHandLow })).not.toContain('feet')
    expect(ids({ footHandRatio: T.footHandLow - 0.01 })).toContain('feet')
    expect(ids({ stillRatio: T.stillRatioHigh })).not.toContain('hesitation')
    expect(ids({ longestStillSec: T.longestStillSec + 0.1 })).toContain('hesitation')
    expect(ids({ lateralSway: T.lateralSwayHigh + 0.01 })).toContain('balance')
    expect(ids({ hipPosition: T.hipPositionLow + 0.01 })).toContain('hips')
    expect(ids({ shakeRatio: T.shakeRatioHigh + 0.01 })).toContain('shake')
    expect(ids({ pathEfficiency: T.pathEfficiencyLow - 0.01 })).toContain('path')
  })

  it('skips the footwork advice when there are too few hand moves to judge', () => {
    expect(ids({ handMoves: 2, footMoves: 0, footHandRatio: 0 })).not.toContain('feet')
  })

  it('treats a missing path as no data rather than inefficiency', () => {
    expect(ids({ pathEfficiency: 0 })).not.toContain('path')
  })
})

describe('wallKind', () => {
  it('classifies angles', () => {
    expect(wallKind('スラブ')).toBe('slab')
    expect(wallKind('垂壁')).toBe('vertical')
    expect(wallKind('110°')).toBe('vertical')
    expect(wallKind('ルーフ')).toBe('steep')
    expect(wallKind()).toBe('vertical')
  })
})

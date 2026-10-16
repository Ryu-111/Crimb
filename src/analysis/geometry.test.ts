import { describe, expect, it } from 'vitest'
import type { Frame } from './types'
import { angle, fullBodyVisible, LM, median, segmentCom } from './geometry'

describe('geometry', () => {
  it('computes angles', () => {
    expect(angle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(180)
    expect(angle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 })).toBeCloseTo(90)
  })

  it('computes median', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(median([])).toBe(0)
  })

  it('checks full-body visibility in sampled frames', () => {
    const body = (v: number, hidden = -1): Frame => ({
      t: 0,
      lm: Array.from({ length: 33 }, (_, i) => ({ x: 0.5, y: 0.5, v: i === hidden ? 0.1 : v })),
    })
    const noHip = body(1, 24)
    const empty: Frame = { t: 0, lm: null }
    expect(fullBodyVisible([body(1), body(1), noHip, empty])).toBe(true)
    expect(fullBodyVisible([body(1), noHip, empty, body(0.3)])).toBe(false)
    expect(fullBodyVisible([])).toBe(false)
  })

  it('accepts a back view with one hand hidden behind the body, but not cut-off legs', () => {
    const frame = (vis: Record<number, number>): Frame => ({
      t: 0,
      lm: Array.from({ length: 33 }, (_, i) => ({ x: 0.5, y: 0.5, v: vis[i] ?? 1 })),
    })
    // 実動画（背面・右手が体の陰）: 右手首 0.21、右足首 0.35
    expect(fullBodyVisible([frame({ 16: 0.21, 28: 0.35 })])).toBe(true)
    // 実動画（脚が画面の下に切れている）: 腰 0.01、足首 0.02
    expect(fullBodyVisible([frame({ 23: 0.01, 24: 0.01, 27: 0.02, 28: 0.02 })])).toBe(false)
  })
})

describe('segment centre of mass', () => {
  const pose = (overrides: Record<number, { x: number; y: number; v?: number }> = {}) =>
    Array.from({ length: 33 }, (_, i) => ({ x: 0.5, y: 0.5, v: 1, ...overrides[i] }))
  const standing = {
    [LM.nose]: { x: 0.5, y: 0.1 },
    [LM.leftShoulder]: { x: 0.45, y: 0.2 }, [LM.rightShoulder]: { x: 0.55, y: 0.2 },
    [LM.leftElbow]: { x: 0.43, y: 0.32 }, [LM.rightElbow]: { x: 0.57, y: 0.32 },
    [LM.leftWrist]: { x: 0.42, y: 0.44 }, [LM.rightWrist]: { x: 0.58, y: 0.44 },
    [LM.leftHip]: { x: 0.47, y: 0.5 }, [LM.rightHip]: { x: 0.53, y: 0.5 },
    [LM.leftKnee]: { x: 0.47, y: 0.7 }, [LM.rightKnee]: { x: 0.53, y: 0.7 },
    [LM.leftAnkle]: { x: 0.47, y: 0.9 }, [LM.rightAnkle]: { x: 0.53, y: 0.9 },
  }

  it('sits on the centre line, a little above the hips, for a symmetric standing pose', () => {
    const c = segmentCom(pose(standing))!
    expect(c.x).toBeCloseTo(0.5, 5)
    expect(c.y).toBeGreaterThan(0.4)
    expect(c.y).toBeLessThan(0.55)
  })

  it('moves toward a raised leg', () => {
    const up = segmentCom(pose({ ...standing, [LM.rightKnee]: { x: 0.65, y: 0.5 }, [LM.rightAnkle]: { x: 0.65, y: 0.65 } }))!
    const c = segmentCom(pose(standing))!
    expect(up.x).toBeGreaterThan(c.x + 0.01)
    expect(up.y).toBeLessThan(c.y)
  })

  it('ignores hidden limbs and gives up without the trunk', () => {
    const hidden = segmentCom(pose({ ...standing, [LM.leftWrist]: { x: 0, y: 0, v: 0 } }))!
    expect(hidden.x).toBeGreaterThan(0.49)
    expect(segmentCom(pose({ ...standing, [LM.leftHip]: { x: 0.47, y: 0.5, v: 0 } }))).toBeNull()
  })
})

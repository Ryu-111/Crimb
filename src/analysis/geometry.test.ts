import { describe, expect, it } from 'vitest'
import type { Frame } from './types'
import { angle, fullBodyVisible, median } from './geometry'

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

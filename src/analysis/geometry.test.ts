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
    const noAnkle = body(1, 28)
    const empty: Frame = { t: 0, lm: null }
    expect(fullBodyVisible([body(1), body(1), noAnkle, empty])).toBe(true)
    expect(fullBodyVisible([body(1), noAnkle, empty, body(0.3)])).toBe(false)
    expect(fullBodyVisible([])).toBe(false)
  })
})

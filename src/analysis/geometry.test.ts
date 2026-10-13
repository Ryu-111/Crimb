import { describe, expect, it } from 'vitest'
import { angle, median } from './geometry'

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
})

import { describe, expect, it } from 'vitest'
import { cropBox, uncrop, CROP_SCALE } from './crop'

const lm = (pts: [number, number][]) => pts.map(([x, y]) => ({ x, y, v: 1 }))

describe('cropBox', () => {
  it('centres a square on the body, scaled from its longer side', () => {
    const b = cropBox(lm([[0.4, 0.4], [0.6, 0.4], [0.4, 0.6], [0.6, 0.6]]), 1000, 1000)
    expect(b.size).toBeCloseTo(200 * CROP_SCALE)
    expect(b.x + b.size / 2).toBeCloseTo(500)
    expect(b.y + b.size / 2).toBeCloseTo(500)
  })

  it('shifts the box inside the frame near an edge', () => {
    const b = cropBox(lm([[0, 0], [0.1, 0], [0, 0.1], [0.1, 0.1]]), 1000, 2000)
    expect(b.x).toBe(0)
    expect(b.y).toBe(0)
  })

  it('never exceeds the shorter side of the frame', () => {
    const b = cropBox(lm([[0, 0], [1, 0], [0, 1], [1, 1]]), 720, 1280)
    expect(b.size).toBe(720)
    expect(b.x).toBe(0)
  })
})

describe('uncrop', () => {
  it('maps crop coordinates back to the full frame', () => {
    const [p] = uncrop(lm([[0.5, 0.25]]), { x: 100, y: 200, size: 400 }, 1000, 2000)
    expect(p!.x).toBeCloseTo(0.3)
    expect(p!.y).toBeCloseTo(0.15)
  })
})

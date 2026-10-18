import { describe, expect, it } from 'vitest'
import { cropBox, searchBox, uncrop, CROP_SCALE, SEARCH_MIN_SIZE, SEARCH_SCALE, SEARCH_ZOOM } from './crop'

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

describe('searchBox', () => {
  const body = lm([[0.5, 0.55], [0.55, 0.55], [0.5, 0.65], [0.55, 0.65]])

  it('crops tighter than the usual box and zooms about 3x', () => {
    const b = searchBox(body, 1280, 720, 640)
    expect(b.size).toBeCloseTo(72 * SEARCH_SCALE)
    expect(b.size).toBeLessThan(cropBox(body, 1280, 720).size)
    expect(b.input % 32).toBe(0)
    expect(b.input / b.size).toBeGreaterThanOrEqual(SEARCH_ZOOM)
  })

  it('never collapses to an empty crop when all points coincide', () => {
    const b = searchBox(lm([[0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5]]), 1280, 720, 640)
    expect(b.size).toBe(SEARCH_MIN_SIZE)
    expect(b.x + b.size / 2).toBeCloseTo(640)
    expect(b.input).toBeGreaterThan(0)
  })

  it('caps the input size for a large person', () => {
    expect(searchBox(lm([[0.2, 0.1], [0.8, 0.9]]), 1920, 1080, 640).input).toBe(640)
  })
})

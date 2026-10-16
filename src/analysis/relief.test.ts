import { describe, expect, it } from 'vitest'
import { depthInputSize, RELIEF_HEIGHT, reliefAt, reliefFromDepth, toModelInput } from './relief'

describe('depth model input', () => {
  it('keeps the aspect ratio with sides that are multiples of 14', () => {
    expect(depthInputSize(480, 960)).toEqual({ width: 266, height: 518 })
    expect(depthInputSize(1920, 1080)).toEqual({ width: 518, height: 294 })
  })

  it('normalises each colour plane with the ImageNet mean and deviation', () => {
    const rgba = new Uint8ClampedArray([255, 0, 128, 255, 0, 255, 0, 255])
    const t = toModelInput(rgba, 2, 1)
    expect(t).toHaveLength(6)
    expect(t[0]).toBeCloseTo((1 - 0.485) / 0.229, 5) // R of pixel 0
    expect(t[1]).toBeCloseTo((0 - 0.485) / 0.229, 5) // R of pixel 1
    expect(t[2]).toBeCloseTo((0 - 0.456) / 0.224, 5) // G of pixel 0
    expect(t[5]).toBeCloseTo((0 - 0.406) / 0.225, 5) // B of pixel 1
  })
})

describe('wall relief from a depth map', () => {
  // 斜めから撮った壁（左が手前に傾いている）に、ホールドの出っ張りが 1 つある
  const w = 60
  const h = 120
  const depth = new Float32Array(w * h)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const tilt = 5 - (4 * i) / w + (2 * j) / h
      const hold = Math.hypot(i - 40, j - 30) < 6 ? 3 : 0
      depth[j * w + i] = tilt + hold
    }
  }
  const relief = reliefFromDepth(depth, w, h, 32)

  it('makes a grid with the photo aspect ratio', () => {
    expect(relief.cols).toBe(32)
    expect(relief.rows).toBe(64)
  })

  it('removes the camera tilt so the bare wall is flat', () => {
    expect(Math.abs(reliefAt(relief, 0.1, 0.9))).toBeLessThan(0.01)
    expect(Math.abs(reliefAt(relief, 0.9, 0.1) - reliefAt(relief, 0.1, 0.9))).toBeLessThan(0.01)
  })

  it('raises the hold toward the viewer, capped at the relief height', () => {
    const z = reliefAt(relief, 40 / (w - 1), 30 / (h - 1))
    expect(z).toBeGreaterThan(RELIEF_HEIGHT * 0.8)
    expect(z).toBeLessThanOrEqual(RELIEF_HEIGHT + 1e-6)
  })
})

import { describe, expect, it } from 'vitest'
import { fillGaps, smooth } from './smoothing'
import type { Frame } from '../analysis/types'

const f = (t: number, x: number | null): Frame => ({ t, lm: x === null ? null : [{ x, y: 0, v: 1 }] })

describe('smoothing', () => {
  it('interpolates short gaps only', () => {
    const out = fillGaps([f(0, 0), f(0.1, null), f(0.2, 1), f(0.3, null), f(1.5, 2)])
    expect(out[1]!.lm![0]!.x).toBeCloseTo(0.5)
    expect(out[3]!.lm).toBeNull()
  })

  it('averages neighbouring frames', () => {
    const out = smooth([f(0, 0), f(0.1, 3), f(0.2, 0)], 3)
    expect(out[1]!.lm![0]!.x).toBeCloseTo(1)
  })
})

describe('long gaps', () => {
  it('keeps a gap longer than the limit empty and still interpolates later short gaps', () => {
    const out = fillGaps([f(0, 0), f(0.3, null), f(0.6, null), f(0.9, 3), f(1.0, null), f(1.1, 5)])
    expect(out[1]!.lm).toBeNull()
    expect(out[2]!.lm).toBeNull()
    expect(out[4]!.lm![0]!.x).toBeCloseTo(4)
  })

  it('leaves leading and trailing missing frames untouched', () => {
    const out = fillGaps([f(0, null), f(0.1, 1), f(0.2, null)])
    expect(out[0]!.lm).toBeNull()
    expect(out[2]!.lm).toBeNull()
  })
})

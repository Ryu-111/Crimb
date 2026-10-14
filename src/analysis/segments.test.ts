import { describe, expect, it } from 'vitest'
import { torsoLength } from './geometry'
import { detectLimbMoves, detectStillsAndMoves, runs } from './segments'
import { climb } from './synthetic'

describe('runs', () => {
  it('extracts consecutive true runs longer than minSec', () => {
    const t = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6]
    expect(runs([true, true, false, true, true, true, true], t, 0.2)).toEqual([{ start: 0.3, end: 0.6 }])
  })
})

describe('segment detection', () => {
  it('finds a still period at every pause and moves in between', () => {
    const track = climb({ moves: 4, pause: 1 })
    const { stills, moves } = detectStillsAndMoves(track, torsoLength(track))
    expect(stills.length).toBeGreaterThanOrEqual(5)
    expect(moves.length).toBe(stills.length - 1)
  })

  it('counts hand and foot moves', () => {
    const track = climb({ moves: 4 })
    const m = detectLimbMoves(track, torsoLength(track))
    expect(m.filter((x) => x.limb.endsWith('Hand'))).toHaveLength(4)
    expect(m.filter((x) => x.limb.endsWith('Foot'))).toHaveLength(4)
  })

  it('counts no foot moves when the climber never steps up', () => {
    const track = climb({ moves: 4, useFeet: false })
    const m = detectLimbMoves(track, torsoLength(track))
    expect(m.filter((x) => x.limb.endsWith('Foot'))).toHaveLength(0)
  })
})

describe('segment boundaries', () => {
  it('drops still runs shorter than the minimum and keeps one exactly at it', () => {
    const t = [0, 0.1, 0.2, 0.3, 0.4, 0.5]
    expect(runs([true, true, true, false, false, false], t, 0.3)).toEqual([])
    expect(runs([true, true, true, true, false, false], t, 0.3)).toEqual([{ start: 0, end: 0.3 }])
  })

  it('handles a run that reaches the last frame', () => {
    expect(runs([false, true, true], [0, 1, 2], 0)).toEqual([{ start: 1, end: 2 }])
  })

  it('ignores a hand that jitters fast but does not travel', () => {
    const track = climb({ moves: 0, pause: 2 })
    // 手首を 1 フレームおきに少しだけ揺らす（速いが移動量は小さい）
    track.frames.forEach((f, i) => {
      const w = f.lm![15]!
      f.lm![15] = { ...w, x: w.x + (i % 2 ? 0.01 : -0.01) }
    })
    expect(detectLimbMoves(track, torsoLength(track))).toHaveLength(0)
  })
})

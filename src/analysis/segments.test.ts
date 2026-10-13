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

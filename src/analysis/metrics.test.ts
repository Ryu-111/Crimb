import { describe, expect, it } from 'vitest'
import { analyze } from './metrics'
import { climb } from './synthetic'

describe('analyze', () => {
  it('rewards a straight-arm, footwork-driven climb', () => {
    const { metrics, advice } = analyze(climb({ bend: 0, useFeet: true }))
    expect(metrics.detectionRate).toBe(1)
    expect(metrics.straightArmRatio).toBeGreaterThan(0.9)
    expect(metrics.footHandRatio).toBeGreaterThanOrEqual(1)
    expect(metrics.fallAt).toBeNull()
    expect(metrics.verticalGain).toBeGreaterThan(1)
    const ids = advice.map((a) => a.id)
    expect(ids).toContain('straight-arm-good')
    expect(ids).not.toContain('straight-arm')
    expect(ids).not.toContain('feet')
  })

  it('flags bent arms and missing footwork', () => {
    const { metrics, advice } = analyze(climb({ bend: 1, useFeet: false }))
    expect(metrics.straightArmRatio).toBeLessThan(0.35)
    expect(metrics.footMoves).toBe(0)
    const ids = advice.map((a) => a.id)
    expect(ids).toContain('straight-arm')
    expect(ids).toContain('feet')
    const bent = advice.find((a) => a.id === 'straight-arm')!
    expect(bent.t).toBeTypeOf('number')
  })

  it('detects a fall and excludes it from the climbing metrics', () => {
    const { metrics, advice } = analyze(climb({ fall: true }))
    expect(metrics.fallAt).not.toBeNull()
    expect(advice[0]!.id).toBe('fall')
    expect(advice[0]!.t).toBe(metrics.fallAt)
  })

  it('flags long hesitation', () => {
    const { advice } = analyze(climb({ pause: 10, moves: 2 }))
    expect(advice.map((a) => a.id)).toContain('hesitation')
  })

  it('asks for better footage when the pose is rarely detected', () => {
    const track = climb()
    track.frames = track.frames.map((f, i) => (i % 3 === 0 ? f : { ...f, lm: null }))
    const { advice } = analyze(track)
    expect(advice[0]!.id).toBe('capture')
  })

  it('handles an empty track', () => {
    const { metrics } = analyze({ fps: 15, width: 1, height: 1, frames: [] })
    expect(metrics.durationSec).toBe(0)
    expect(metrics.detectionRate).toBe(0)
  })

  it('sorts advice by severity', () => {
    const order = { high: 0, medium: 1, low: 2, good: 3 }
    const { advice } = analyze(climb({ bend: 1, useFeet: false, fall: true }))
    const sev = advice.map((a) => order[a.severity])
    expect(sev).toEqual([...sev].sort((a, b) => a - b))
  })

  it('reorders advice by wall angle', () => {
    const track = climb({ bend: 1, useFeet: false })
    const ids = (angle: string) => analyze(track, angle).advice.map((a) => a.id)
    const before = (list: string[], a: string, b: string) => list.indexOf(a) < list.indexOf(b)
    expect(before(ids('スラブ'), 'feet', 'straight-arm')).toBe(true)
    expect(before(ids('130°以上'), 'straight-arm', 'feet')).toBe(true)
    expect(analyze(track, 'スラブ').advice.find((a) => a.id === 'straight-arm')!.severity).toBe('low')
  })
})

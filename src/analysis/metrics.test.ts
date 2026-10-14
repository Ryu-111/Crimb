import { describe, expect, it } from 'vitest'
import { LM } from './geometry'
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

  it('detects a fall when the first frames show a broken pose high in the frame', () => {
    // 画面に入ってくる途中の姿勢が、実際より高い位置に出ることがある（実動画 garrett の冒頭）
    const track = climb({ fall: true })
    const first = track.frames[0]!.lm!.map((p) => ({ ...p, y: p.y - 0.5 }))
    const { metrics } = analyze({ ...track, frames: [{ t: -0.1, lm: first }, ...track.frames] })
    expect(metrics.fallAt).not.toBeNull()
  })

  it('detects an early fall even when the clip keeps running on the mat', () => {
    const track = climb({ moves: 3, fall: true })
    const last = track.frames[track.frames.length - 1]!
    const dt = 1 / track.fps
    const n = 4 * track.frames.length
    for (let i = 1; i <= n; i++) track.frames.push({ ...last, t: last.t + i * dt })
    const { metrics, advice } = analyze(track)
    expect(metrics.fallAt).not.toBeNull()
    expect(metrics.fallAt!).toBeLessThan(track.frames[track.frames.length - 1]!.t / 3)
    expect(advice[0]!.id).toBe('fall')
  })

  it('does not report the drop after a completed send as a fall', () => {
    const fell = analyze(climb({ fall: true }))
    const { metrics, advice } = analyze(climb({ fall: true }), undefined, true)
    expect(metrics.fallAt).toBeNull()
    // 飛び降り区間は登りの指標から除外される
    expect(metrics.moveCount).toBe(fell.metrics.moveCount)
    expect(advice.map((a) => a.id)).not.toContain('fall')
  })

  it('gives no straight-arm advice when the arms were never measured during stills', () => {
    const track = climb({ bend: 1 })
    // 肘が常に隠れている
    const hidden = new Set<number>([LM.leftElbow, LM.rightElbow])
    track.frames = track.frames.map((f) => ({ ...f, lm: f.lm && f.lm.map((l, i) => (hidden.has(i) ? { ...l, v: 0 } : l)) }))
    const { advice } = analyze(track)
    const ids = advice.map((a) => a.id)
    expect(ids).not.toContain('straight-arm')
    expect(ids).not.toContain('straight-arm-good')
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

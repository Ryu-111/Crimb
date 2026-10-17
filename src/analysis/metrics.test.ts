import { describe, expect, it } from 'vitest'
import { LM } from './geometry'
import { THRESHOLDS } from './rules'
import type { PoseTrack } from './types'
import { analyze } from './metrics'
import { climb } from './synthetic'

/** 手持ちのぶれ・追いかけで画面全体が動く動画を作る（landmark を動かし、同じ量を camera に記録する） */
function withCameraMotion(track: PoseTrack, amp: number, periodSec: number, record: boolean): PoseTrack {
  const camera = track.frames.map((f) => ({ dx: amp * Math.sin((2 * Math.PI * f.t) / periodSec), dy: amp * 0.6 * Math.sin((2 * Math.PI * f.t) / (periodSec * 1.7)) }))
  return {
    ...track,
    frames: track.frames.map((f, i) => (f.lm ? { ...f, lm: f.lm.map((p) => ({ ...p, x: p.x + camera[i]!.dx, y: p.y + camera[i]!.dy })) } : f)),
    ...(record ? { camera } : {}),
  }
}

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

  it('never mixes other advice into a capture warning (40 random dropouts)', () => {
    let seed = 7
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
    for (let n = 0; n < 40; n++) {
      const track = climb({ bend: rnd() * 2, useFeet: rnd() > 0.5, pause: rnd() * 6, fall: rnd() > 0.7 })
      const keep = 0.2 + rnd() * 0.8
      track.frames = track.frames.map((f) => (rnd() < keep ? f : { ...f, lm: null }))
      const { metrics, advice } = analyze(track)
      const ids = advice.map((a) => a.id)
      if (metrics.detectionRate < THRESHOLDS.minDetectionRate) expect(ids, `rate ${metrics.detectionRate}`).toEqual(['capture'])
      else expect(ids).not.toContain('capture')
    }
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

describe('long clips', () => {
  it('analyzes a 17-minute clip quickly (limb stillness window is linear in frames)', () => {
    const t = climb({ moves: 480, pause: 0.6 })
    expect(t.frames.length).toBeGreaterThan(10_000)
    const t0 = performance.now()
    const a = analyze(t)
    expect(a.limbMoves.length).toBeGreaterThan(900)
    // 二乗の計算量だった頃は 2.5 秒。余裕を見て 1.5 秒（CI の遅い環境でも通る）
    expect(performance.now() - t0).toBeLessThan(1500)
  })
})

describe('camera motion compensation', () => {
  it('keeps limb moves and stills the same when the camera pans (20 random pans)', () => {
    let seed = 11
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
    let uncompensatedWorse = 0
    for (let n = 0; n < 20; n++) {
      const clean = climb({ pause: 1 + rnd() * 2, moves: 4 + Math.floor(rnd() * 4) })
      const a = analyze(clean)
      const amp = 0.03 + rnd() * 0.05
      const period = 2 + rnd() * 4
      const fixed = analyze(withCameraMotion(clean, amp, period, true))
      const blind = analyze(withCameraMotion(clean, amp, period, false))
      expect(fixed.limbMoves.length, 'limb moves').toBe(a.limbMoves.length)
      expect(fixed.moves.length, 'moves').toBe(a.moves.length)
      if (Math.abs(blind.limbMoves.length - a.limbMoves.length) + Math.abs(blind.moves.length - a.moves.length) > 0) uncompensatedWorse++
    }
    // 補正なしでは崩れる条件であること（テストが補正の効果を見ていることの確認）
    expect(uncompensatedWorse).toBeGreaterThan(5)
  })

  it('is a no-op for tracks without camera data', () => {
    const t = climb()
    expect(analyze(t).metrics).toEqual(analyze({ ...t, camera: undefined }).metrics)
  })
})

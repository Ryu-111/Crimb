/**
 * 実際の登攀動画（imix8/Ascend, MIT）から抽出した姿勢データでの回帰テスト。
 * 出典と抽出方法は test-fixtures/README.md を参照。
 */
import { describe, expect, it } from 'vitest'
import abhi from '../../test-fixtures/tracks/abhi.json'
import eric from '../../test-fixtures/tracks/eric.json'
import garrett from '../../test-fixtures/tracks/garrett.json'
import { analyze } from './metrics'
import type { PoseTrack } from './types'

const cases = [
  { name: 'garrett', track: garrett as PoseTrack },
  { name: 'eric', track: eric as PoseTrack },
]

describe.each(cases)('real climb: $name', ({ track }) => {
  const { metrics, advice } = analyze(track, '垂壁', true)

  it('detects the climber in most frames and does not report a fall', () => {
    expect(metrics.detectionRate).toBeGreaterThan(0.6)
    expect(metrics.fallAt).toBeNull()
  })

  it('does not ask to reshoot a well-framed video', () => {
    expect(advice.map((a) => a.id)).not.toContain('capture')
  })
})

// 動画を目視で数えた手・足の持ち替え回数の範囲（数え方で幅が出る）。姿勢の抽出は実行ごとに少し変わるので ±1 まで許す。
// garrett の足は取り付き（2.5〜7 秒）の足置きを 0.25 秒刻みで数え直した値
describe.each([
  { name: 'garrett', track: garrett, hands: [5, 8], feet: [8, 11] },
  { name: 'eric', track: eric, hands: [12, 16], feet: [10, 15] },
  { name: 'abhi', track: abhi, hands: [8, 13], feet: [8, 13] },
])('hand and foot placements: $name', ({ track, hands, feet }) => {
  const { metrics } = analyze(track as PoseTrack, '垂壁', true)
  it('matches the eye-counted range (not jitter)', () => {
    expect(metrics.handMoves).toBeGreaterThanOrEqual(hands[0]! - 1)
    expect(metrics.handMoves).toBeLessThanOrEqual(hands[1]! + 1)
    expect(metrics.footMoves).toBeGreaterThanOrEqual(feet[0]! - 1)
    expect(metrics.footMoves).toBeLessThanOrEqual(feet[1]! + 1)
  })
})

describe('real climb: abhi (upper body leaves the frame)', () => {
  it('does not report a fall when the upper body goes out of the top of the frame', () => {
    // 17〜21 秒に上半身が画面外へ出ると、肩が脚の上に付け替えられて重心が瞬間移動していた
    expect(analyze(abhi as PoseTrack, '垂壁', false).metrics.fallAt).toBeNull()
  })
})

describe('real drops are still detected when analysed as an attempt', () => {
  it.each([
    ['garrett', garrett, 14.5],
    ['eric', eric, 29],
  ] as const)('%s drops near %f s', (_n, track, t) => {
    const fallAt = analyze(track as PoseTrack, '垂壁', false).metrics.fallAt
    expect(fallAt).not.toBeNull()
    expect(Math.abs(fallAt! - t)).toBeLessThan(1.5)
  })
})

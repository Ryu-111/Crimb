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
    // garrett は冒頭 5 秒、壁のホールドを人と誤検出していた（除外されるので 0.6 台になる）
    expect(metrics.detectionRate).toBeGreaterThan(0.6)
    expect(metrics.fallAt).toBeNull()
  })

  it('counts a plausible number of hand and foot placements (not jitter)', () => {
    // 15〜30 秒の課題で手足とも 2〜12 回程度。以前はブレで足が 30 回以上数えられていた
    expect(metrics.handMoves).toBeGreaterThanOrEqual(2)
    expect(metrics.handMoves).toBeLessThanOrEqual(12)
    expect(metrics.footMoves).toBeGreaterThanOrEqual(2)
    expect(metrics.footMoves).toBeLessThanOrEqual(12)
  })

  it('does not ask to reshoot a well-framed video', () => {
    expect(advice.map((a) => a.id)).not.toContain('capture')
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
